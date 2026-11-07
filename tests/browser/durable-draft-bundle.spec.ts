import { test, expect, type Page } from '@playwright/test';

const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );

function draftId(page: Page) {
  const id = new URL(page.url()).hash.match(/^#draft=([a-f0-9-]{36})$/)?.[1];
  expect(id).toBeTruthy();
  return id!;
}

/**
 * Rewrite the current draft in the format 2 chunk-bundle layout used before
 * content-addressed assets: rebuild the Draft from the format 3 manifest and
 * its asset records, store it as checksummed chunks, and remove the asset
 * records, exactly as an older build would have left IndexedDB.
 */
async function replaceWithLargeBundle(page: Page, id: string) {
  await page.evaluate(async (draftId) => {
    const current = await new Promise<{
      pointer: Record<string, unknown>;
      assets: Map<string, string>;
    }>((resolve, reject) => {
      const opened = indexedDB.open('pixelforge-documents');
      opened.onerror = () => reject(opened.error);
      opened.onsuccess = () => {
        const database = opened.result;
        const transaction = database.transaction(['drafts', 'draftBlobs']);
        const pointerRequest = transaction.objectStore('drafts').get(draftId);
        const assets = new Map<string, string>();
        pointerRequest.onerror = () => reject(pointerRequest.error);
        pointerRequest.onsuccess = () => {
          const pointer = pointerRequest.result as Record<string, unknown>;
          const refs = pointer.assetRefs as Record<string, { hash: string }>;
          for (const hash of new Set(Object.values(refs).map((ref) => ref.hash))) {
            const request = transaction
              .objectStore('draftBlobs')
              .get(`asset:${draftId}:${hash}`);
            request.onsuccess = () => {
              assets.set(
                hash,
                new TextDecoder().decode((request.result as { bytes: ArrayBuffer }).bytes),
              );
            };
          }
          transaction.oncomplete = () => {
            database.close();
            resolve({ pointer, assets });
          };
        };
      };
    });
    const {
      kind: _kind,
      format: _format,
      savedAt: _savedAt,
      assetRefs,
      ...draft
    } = current.pointer as Record<string, unknown> & {
      assetRefs: Record<string, { hash: string; w: number; h: number }>;
    };
    const original = {
      ...draft,
      assets: Object.fromEntries(
        Object.entries(assetRefs).map(([assetId, ref]) => [
          assetId,
          { url: current.assets.get(ref.hash)!, w: ref.w, h: ref.h },
        ]),
      ),
    } as Record<string, unknown>;
    original.__largeRecoveryFixture = 'x'.repeat(5 * 1024 * 1024);
    const encoded = new TextEncoder().encode(JSON.stringify(original));
    const chunkSize = 64 * 1024;
    const bundleId = crypto.randomUUID();
    const chunks = Array.from({ length: Math.ceil(encoded.byteLength / chunkSize) }, (_, index) => {
      const bytes = encoded.slice(index * chunkSize, Math.min((index + 1) * chunkSize, encoded.byteLength));
      return {
        id: `${bundleId}:${index.toString(36)}`,
        bundleId,
        index,
        bytes: bytes.buffer,
      };
    });
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const manifest = {
      kind: 'pixelforge-draft-bundle',
      version: 1,
      id: bundleId,
      revision: current.pointer.localRevision,
      localRevision: current.pointer.localRevision,
      checksum,
      byteLength: encoded.byteLength,
      chunkSize,
      chunkCount: chunks.length,
      chunks: chunks.map((chunk) => chunk.id),
      name: current.pointer.name,
      createdAt: new Date().toISOString(),
    };
    await new Promise<void>((resolve, reject) => {
      const opened = indexedDB.open('pixelforge-documents');
      opened.onerror = () => reject(opened.error);
      opened.onsuccess = () => {
        const database = opened.result;
        const transaction = database.transaction(['drafts', 'draftBlobs'], 'readwrite');
        const pointers = transaction.objectStore('drafts');
        const blobs = transaction.objectStore('draftBlobs');
        blobs.delete(IDBKeyRange.bound(`asset:${draftId}:`, `asset:${draftId}:~`));
        chunks.forEach((chunk) => blobs.put(chunk, chunk.id));
        pointers.put(manifest, draftId);
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, id);
}

async function corruptOneChunk(page: Page, id: string) {
  await page.evaluate(async (draftId) => {
    await new Promise<void>((resolve, reject) => {
      const opened = indexedDB.open('pixelforge-documents');
      opened.onerror = () => reject(opened.error);
      opened.onsuccess = () => {
        const database = opened.result;
        const transaction = database.transaction(['drafts', 'draftBlobs'], 'readwrite');
        const pointers = transaction.objectStore('drafts');
        const blobs = transaction.objectStore('draftBlobs');
        const pointerRequest = pointers.get(draftId);
        pointerRequest.onsuccess = () => {
          const pointer = pointerRequest.result as { chunks: string[] };
          const chunkRequest = blobs.get(pointer.chunks[0]);
          chunkRequest.onsuccess = () => {
            const chunk = chunkRequest.result as { bytes: ArrayBuffer };
            const bytes = chunk.bytes.slice(0);
            new Uint8Array(bytes)[0] ^= 0xff;
            blobs.put({ ...chunk, bytes }, pointer.chunks[0]);
          };
        };
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, id);
}

type StoredState = {
  kind?: string;
  format?: number;
  localRevision?: number;
  refs: number;
  assetKeys: string[];
  chunkKeys: number;
};

/** Summarize the stored pointer and this draft's records in `draftBlobs`. */
function storedState(page: Page, id: string) {
  return page.evaluate(
    (draftId) =>
      new Promise<StoredState>((resolve, reject) => {
        const opened = indexedDB.open('pixelforge-documents');
        opened.onerror = () => reject(opened.error);
        opened.onsuccess = () => {
          const database = opened.result;
          const transaction = database.transaction(['drafts', 'draftBlobs']);
          const pointerRequest = transaction.objectStore('drafts').get(draftId);
          const keysRequest = transaction.objectStore('draftBlobs').getAllKeys();
          transaction.oncomplete = () => {
            database.close();
            const pointer = pointerRequest.result as {
              kind?: string;
              format?: number;
              localRevision?: number;
              assetRefs?: Record<string, { hash: string }>;
            };
            const keys = keysRequest.result.map(String);
            resolve({
              kind: pointer?.kind,
              format: pointer?.format,
              localRevision: pointer?.localRevision,
              refs: new Set(Object.values(pointer?.assetRefs || {}).map((ref) => ref.hash)).size,
              assetKeys: keys.filter((key) => key.startsWith(`asset:${draftId}:`)),
              chunkKeys: keys.filter((key) => !key.startsWith('asset:')).length,
            });
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    id,
  );
}

async function corruptOneAsset(page: Page, id: string) {
  await page.evaluate(async (draftId) => {
    await new Promise<void>((resolve, reject) => {
      const opened = indexedDB.open('pixelforge-documents');
      opened.onerror = () => reject(opened.error);
      opened.onsuccess = () => {
        const database = opened.result;
        const transaction = database.transaction(['draftBlobs'], 'readwrite');
        const blobs = transaction.objectStore('draftBlobs');
        const keys = blobs.getAllKeys(
          IDBKeyRange.bound(`asset:${draftId}:`, `asset:${draftId}:~`),
        );
        keys.onsuccess = () => {
          const key = keys.result[0] as string;
          const read = blobs.get(key);
          read.onsuccess = () => {
            const value = read.result as { bytes: ArrayBuffer };
            // Still a syntactically valid PNG data URL, but different bytes.
            const url = new TextDecoder().decode(value.bytes);
            const parts = url.match(/^(.*)([A-Za-z0-9+/])(=*)$/)!;
            const changed = `${parts[1]}${parts[2] === 'A' ? 'B' : 'A'}${parts[3]}`;
            blobs.put({ ...value, bytes: new TextEncoder().encode(changed).buffer }, key);
          };
        };
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, id);
}

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await saved(page);
});

test('large local bundle survives reload and exposes a versioned manifest', async ({ page }) => {
  const id = draftId(page);
  const preservedName = await page.getByLabel('Document name').inputValue();
  await replaceWithLargeBundle(page, id);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await saved(page);
  // The bundle envelope carries the draft metadata forward. Keep this tied to
  // the current fixture name so a product rename does not turn the recovery
  // test into a false failure.
  await expect(page.getByLabel('Document name')).toHaveValue(preservedName);
  // The first save after recovery migrates the format 2 bundle to a format 3
  // manifest in one transaction: old chunks are gone, every referenced asset
  // has exactly one content-addressed record.
  await page.getByLabel('Document name').fill('Migrated bundle');
  await saved(page);
  const state = await storedState(page, id);
  expect(state.kind).toBe('pixelforge-draft-manifest');
  expect(state.format).toBe(3);
  expect(state.chunkKeys).toBe(0);
  expect(state.assetKeys).toHaveLength(state.refs);
  expect(state.refs).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Document name')).toHaveValue('Migrated bundle');
  await saved(page);
});

test('checksum corruption fails closed without adopting damaged draft bytes', async ({ page }) => {
  const id = draftId(page);
  await replaceWithLargeBundle(page, id);
  await corruptOneChunk(page, id);
  await page.reload();
  await expect(page.getByText('Recovery unavailable. Original draft kept; export backups of your work.', { exact: true })).toBeVisible();
  expect(page.url()).not.toContain(id);
});

test('a corrupted content-addressed asset fails closed and keeps the original bookmark', async ({ page }) => {
  const id = draftId(page);
  const state = await storedState(page, id);
  expect(state.kind).toBe('pixelforge-draft-manifest');
  expect(state.assetKeys.length).toBeGreaterThan(0);
  await corruptOneAsset(page, id);
  await page.reload();
  await expect(page.getByText('Recovery unavailable. Original draft kept; export backups of your work.', { exact: true })).toBeVisible();
  expect(page.url()).not.toContain(id);
  // The damaged draft was not overwritten by the replacement document.
  expect((await storedState(page, id)).localRevision).toBe(state.localRevision);
});
