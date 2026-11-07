import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';

const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
    { timeout: 30_000 },
  );

const ready = (page: Page) =>
  expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false', {
    timeout: 30_000,
  });

async function openEditor(page: Page, url = '/editor?new=1') {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto(url);
  await ready(page);
  await saved(page);
}

function draftId(page: Page) {
  const id = new URL(page.url()).hash.match(/^#draft=([a-f0-9-]{36})$/)?.[1];
  expect(id).toBeTruthy();
  return id!;
}

type Stored = {
  localRevision: number;
  history: unknown[];
  index: number;
  assetRefs: Record<string, { hash: string; w: number; h: number }>;
  assetKeys: string[];
};

/** Read this draft's format 3 manifest and asset record keys from IndexedDB. */
function stored(page: Page, id: string) {
  return page.evaluate(
    (draftId) =>
      new Promise<Stored>((resolve, reject) => {
        const opened = indexedDB.open('pixelforge-documents');
        opened.onerror = () => reject(opened.error);
        opened.onsuccess = () => {
          const database = opened.result;
          const transaction = database.transaction(['drafts', 'draftBlobs']);
          const pointer = transaction.objectStore('drafts').get(draftId);
          const keys = transaction
            .objectStore('draftBlobs')
            .getAllKeys(IDBKeyRange.bound(`asset:${draftId}:`, `asset:${draftId}:~`));
          transaction.oncomplete = () => {
            database.close();
            const value = pointer.result as Omit<Stored, 'assetKeys'> & { kind: string };
            if (value?.kind !== 'pixelforge-draft-manifest')
              return reject(new Error(`Unexpected pointer ${value?.kind}`));
            resolve({
              localRevision: value.localRevision,
              history: value.history,
              index: value.index,
              assetRefs: value.assetRefs,
              assetKeys: keys.result.map(String).sort(),
            });
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    id,
  );
}

/** SHA-256 of the composited editor canvas pixels. */
const canvasDigest = (page: Page) =>
  page.getByTestId('editor-canvas').evaluate(async (canvas: HTMLCanvasElement) => {
    const pixels = canvas
      .getContext('2d')!
      .getImageData(0, 0, canvas.width, canvas.height).data;
    const digest = await crypto.subtle.digest('SHA-256', pixels);
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
  });

/** The final full render can land shortly after the save status settles. */
async function settledDigest(page: Page) {
  let previous = '';
  let current = await canvasDigest(page);
  for (let attempt = 0; attempt < 40 && current !== previous; attempt += 1) {
    await page.waitForTimeout(400);
    previous = current;
    current = await canvasDigest(page);
  }
  return current;
}

async function stroke(page: Page, x: number, y: number) {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  const point = { clientX: box.x + box.width * x, clientY: box.y + box.height * y };
  await canvas.evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  const base = { pointerId: 41, pointerType: 'mouse', pressure: 1, isPrimary: true };
  await canvas.dispatchEvent('pointerdown', { ...base, ...point, buttons: 1 });
  await page.waitForTimeout(60);
  await canvas.dispatchEvent('pointermove', {
    ...base,
    clientX: point.clientX + box.width * 0.1,
    clientY: point.clientY + box.height * 0.05,
    buttons: 1,
  });
  await canvas.dispatchEvent('pointerup', {
    ...base,
    clientX: point.clientX + box.width * 0.1,
    clientY: point.clientY + box.height * 0.05,
    buttons: 0,
  });
  await expect(canvas).toHaveAttribute('data-rendering', 'false', { timeout: 30_000 });
  await expect(page.locator('footer')).toContainText('Paint layer updated', {
    timeout: 30_000,
  });
  await saved(page);
}

test('poster strokes save only new assets and reload with identical pixels and history', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openEditor(page);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('Document preset').selectOption('poster-2-3');
  await dialog.getByLabel('Background contents').selectOption('white');
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const canvas = page.getByTestId('editor-canvas');
  await expect(canvas).toHaveJSProperty('width', 2646);
  await saved(page);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await saved(page);
  await selectTool(page, 'Brush');

  const id = draftId(page);
  let previous = await stored(page, id);
  // Every committed manifest references exactly the records that exist.
  expect(previous.assetKeys).toHaveLength(
    new Set(Object.values(previous.assetRefs).map((ref) => ref.hash)).size,
  );
  for (const [x, y] of [
    [0.2, 0.2],
    [0.4, 0.5],
    [0.3, 0.8],
  ]) {
    await stroke(page, x, y);
    // The footer notice persists between strokes, so wait for the committed
    // manifest itself to gain this stroke's history step.
    await expect
      .poll(async () => (await stored(page, id)).history.length, { timeout: 30_000 })
      .toBe(previous.history.length + 1);
    await saved(page);
    const next = await stored(page, id);
    const added = next.assetKeys.filter((key) => !previous.assetKeys.includes(key));
    const removed = previous.assetKeys.filter((key) => !next.assetKeys.includes(key));
    // One stroke produces one new paint-layer asset; nothing else is rewritten
    // and nothing still referenced by history is collected.
    expect(added).toHaveLength(1);
    expect(removed).toHaveLength(0);
    expect(next.history.length).toBe(previous.history.length + 1);
    expect(next.assetKeys).toHaveLength(
      new Set(Object.values(next.assetRefs).map((ref) => ref.hash)).size,
    );
    previous = next;
  }

  const before = await settledDigest(page);
  await page.reload();
  await ready(page);
  await saved(page);
  await expect(canvas).toHaveAttribute('data-rendering', 'false', { timeout: 30_000 });
  await expect(canvas).toHaveJSProperty('width', 2646);
  expect(await settledDigest(page)).toBe(before);
  const after = await stored(page, id);
  expect(after.history).toEqual(previous.history);
  expect(after.index).toBe(previous.index);
  expect(after.assetRefs).toEqual(previous.assetRefs);
  // The post-reload save reused every stored record.
  expect(after.assetKeys).toEqual(previous.assetKeys);
  expect(after.localRevision).toBeGreaterThan(previous.localRevision);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a bookmark-less editor tab does not attach to a draft open in another tab', async ({
  page,
  context,
}) => {
  await openEditor(page);
  const original = draftId(page);
  const second = await context.newPage();
  await openEditor(second, '/editor');
  const other = draftId(second);
  expect(other).not.toBe(original);
  await expect(second.locator('footer')).toContainText(
    'Your last draft is open in another tab, so this tab started a new draft.',
  );
  // The first tab keeps saving its own revision chain without a conflict.
  await page.getByLabel('Document name').fill('Still mine');
  await saved(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await second.getByLabel('Document name').fill('Second tab draft');
  await saved(second);
  await second.close();
  // Wait until the closed tab's advisory lock is released.
  await expect
    .poll(() =>
      page.evaluate(
        async (id) =>
          (await navigator.locks.query()).held?.some(
            (lock) => lock.name === `pixelforge:draft-open:${id}`,
          ) ?? false,
        other,
      ),
    )
    .toBe(false);

  // Once no tab holds it, `/editor` reopens the last draft as before.
  const third = await context.newPage();
  await openEditor(third, '/editor');
  expect(draftId(third)).toBe(other);
  await expect(third.getByLabel('Document name')).toHaveValue('Second tab draft');
  await third.close();
});
