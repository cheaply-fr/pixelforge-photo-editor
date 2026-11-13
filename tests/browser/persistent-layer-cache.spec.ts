import { test, expect, type Page } from '@playwright/test';
import {
  compositeChecksum,
  dropDraftPreview,
  layerStoreEntries,
  marks,
  seedPainting,
  type PaintingLayerSpec,
} from './large-painting-fixture';

// Large filtered layers are kept on the device (IndexedDB, lossless PNG) so
// reopening a painting decodes them instead of recomputing the filter. The
// reopened composite must be pixel-identical to the one computed live, and
// editing the filter must produce a new entry rather than reuse a stale one.

const W = 2000;
const H = 1500;
const canvas = (page: Page) => page.getByTestId('editor-canvas');
const settled = (page: Page) => expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 120_000 });

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

async function menu(page: Page, name: string, item: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

/** Entries in the on-device layer store (0 when it does not exist yet). */
const storedEntries = (page: Page) =>
  page.evaluate(async () => {
    // Never create the database here: only the editor does.
    if (!(await indexedDB.databases()).some((database) => database.name === 'pixelforge-layer-cache')) return 0;
    return new Promise<number>((resolve) => {
    const opening = indexedDB.open('pixelforge-layer-cache');
    opening.onerror = () => resolve(0);
    opening.onsuccess = () => {
      const database = opening.result;
      if (!database.objectStoreNames.contains('meta')) {
        database.close();
        resolve(0);
        return;
      }
      const counting = database.transaction('meta', 'readonly').objectStore('meta').count();
      counting.onsuccess = () => {
        database.close();
        resolve(counting.result);
      };
      counting.onerror = () => resolve(0);
    };
    });
  });

/** A cheap checksum of the composite, plus a few exact samples. */
const composite = (page: Page) =>
  canvas(page).evaluate((element: HTMLCanvasElement) => {
    const data = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    let sum = 0;
    for (let index = 0; index < data.length; index += 97) sum = (sum * 31 + data[index]) % 2147483647;
    const at = (x: number, y: number) => Array.from(data.slice((y * element.width + x) * 4, (y * element.width + x) * 4 + 4));
    return { sum, samples: [at(10, 10), at(1000, 750), at(1999, 1499), at(600, 1200)] };
  });

test('a filtered layer is kept on the device and reopens pixel-identical', async ({ page }) => {
  test.setTimeout(240_000);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('New document width (px)').fill(String(W));
  await dialog.getByLabel('New document height (px)').fill(String(H));
  await dialog.getByLabel('Background contents').selectOption('white');
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(canvas(page)).toHaveJSProperty('width', W);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  expect(await storedEntries(page)).toBe(0);
  // Another opener created the database without the editor's stores: the
  // editor must upgrade it rather than miss forever.
  await page.evaluate(() => new Promise<void>((resolve) => {
    const opening = indexedDB.open('pixelforge-layer-cache', 1);
    opening.onsuccess = () => {
      opening.result.close();
      resolve();
    };
    opening.onerror = () => resolve();
  }));

  // Clouds on the empty layer: a whole-layer generated texture, seconds of work on large paintings.
  await menu(page, 'Filter', 'Clouds');
  await settled(page);
  await expect.poll(() => storedEntries(page), { timeout: 60_000 }).toBeGreaterThan(0);
  const live = await composite(page);
  expect(live.samples[1][3]).toBe(255);
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device', { timeout: 60_000 });

  await page.reload();
  await expect(page.getByRole('button', { name: /^Select layer / })).toHaveCount(2, { timeout: 120_000 });
  await settled(page);
  expect(await composite(page), 'reopened from the device store, same pixels').toEqual(live);

  // A changed filter is a new key: it is computed (not the stale entry) and stored too.
  const before = await storedEntries(page);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Lens Flare…', exact: true }).click();
  await settled(page);
  const flared = await composite(page);
  expect(flared.sum).not.toBe(live.sum);
  await expect.poll(() => storedEntries(page), { timeout: 60_000 }).toBeGreaterThanOrEqual(before);
});

/** The tag of the saved draft preview, if one is stored. */
const previewTag = (page: Page) =>
  page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((database) => database.name === 'pixelforge-layer-cache')) return null;
    return new Promise<string | null>((resolve) => {
    const opening = indexedDB.open('pixelforge-layer-cache');
    opening.onerror = () => resolve(null);
    opening.onsuccess = () => {
      const database = opening.result;
      if (!database.objectStoreNames.contains('meta')) return resolve(null);
      const all = database.transaction('meta', 'readonly').objectStore('meta').getAll();
      all.onsuccess = () => {
        database.close();
        resolve((all.result as Array<{ tag?: string }>).find((meta) => meta.tag)?.tag ?? null);
      };
      all.onerror = () => resolve(null);
    };
    });
  });

test('a reopened large draft shows its saved picture while the layers load', async ({ page }) => {
  test.setTimeout(240_000);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('New document width (px)').fill(String(W));
  await dialog.getByLabel('New document height (px)').fill(String(H));
  await dialog.getByLabel('Background contents').selectOption('white');
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  // A tall enough stack (8+ layers) on a 3 MP canvas keeps a presented copy.
  for (let index = 0; index < 8; index += 1) {
    await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
    await settled(page);
  }
  await menu(page, 'Filter', 'Clouds');
  await settled(page);
  const live = await composite(page);
  await expect.poll(() => previewTag(page), { timeout: 60_000 }).not.toBeNull();
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device', { timeout: 60_000 });

  // Hold the finished install a moment, so the preview is observable first.
  await page.addInitScript(() => {
    (globalThis as { __PIXELFORGE_INSTALL_HOLD_MS__?: number }).__PIXELFORGE_INSTALL_HOLD_MS__ = 1500;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('pixelforge.draft-preview').length), { timeout: 60_000 }).toBe(1);
  // While the install is held, the canvas already shows the saved picture.
  expect(await composite(page)).toEqual(live);
  await expect(page.getByRole('button', { name: /^Select layer / })).toHaveCount(9, { timeout: 120_000 });
  await settled(page);
  expect(await composite(page)).toEqual(live);
});

// A painting with the slow local and frame stages of the reported 89-layer
// night sky (Clouds, Smart Filter stacks under Emboss / Motion Blur, Light
// Rays, Wave, Outer Glow, an inverted mask, Levels, a clipped layer), saved
// with tiled layers like a real draft.
const PAINTING: PaintingLayerSpec[] = [
  { name: 'Sky', content: 'sky' },
  { name: 'Milky Way', content: 'empty', filter: 'clouds', blend: 'screen', opacity: 0.6 },
  { name: 'Dust lanes', content: 'empty', filter: 'clouds', blend: 'multiply', opacity: 0.5, mask: true, maskInverted: true },
  { name: 'Milky Way grain', content: 'stars', filter: 'motion-blur', smart: ['clouds'], blend: 'screen' },
  { name: 'Stars', content: 'stars', adjust: { levelsGamma: 1.3, levelsWhite: 230 } },
  { name: 'Mountains', content: 'band', filter: 'emboss', smart: ['clouds'] },
  { name: 'Mountain light', content: 'band', filter: 'gaussian-blur', blend: 'screen', clip: true },
  { name: 'Plain sand', content: 'band', filter: 'emboss', smart: ['clouds', 'motion-blur'], blend: 'multiply' },
  { name: 'Lid flare', content: 'empty', filter: 'light-rays', blend: 'screen' },
  { name: 'Smoke wisps', content: 'blobs', filter: 'wave', smart: ['gaussian-blur'], blend: 'screen', opacity: 0.7 },
  { name: 'Ground lights', content: 'stars', outerGlow: true },
];

type StoreStats = { hits: number; misses: number; queued: number; writes: number; failed: number; prefetches: number };
const storeStats = async (page: Page) =>
  (await marks(page, 'pixelforge.persistent-layer-cache')).map((mark) => mark.detail as StoreStats);
const rows = (page: Page) => page.getByRole('button', { name: /^Select layer / });

test('a reopened painting shows its saved picture at once and reads its layers from the device', async ({ page }) => {
  test.setTimeout(900_000);
  // Record what the opening overlay said, however briefly it showed.
  await page.addInitScript(() => {
    const seen: string[] = [];
    (globalThis as { __openingSeen?: string[] }).__openingSeen = seen;
    new MutationObserver(() => {
      const text = document.querySelector('[data-testid="opening-progress"]')?.textContent;
      if (text && seen[seen.length - 1] !== text) seen.push(text);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  const openingSeen = () => page.evaluate(() => (globalThis as { __openingSeen?: string[] }).__openingSeen ?? []);
  await seedPainting(page, W, H, PAINTING);

  // First open: every layer is computed and kept on the device.
  await page.reload();
  await expect(rows(page)).toHaveCount(PAINTING.length, { timeout: 300_000 });
  await settled(page);
  const computed = await compositeChecksum(page);
  const first = (await storeStats(page)).at(-1)!;
  expect(first.hits, 'nothing stored yet').toBe(0);
  expect(first.queued, 'the slow layers are written').toBeGreaterThanOrEqual(7);
  expect(first.failed).toBe(0);
  expect((await openingSeen()).some((text) => /Opening draft… \d+\/11 layers/.test(text)), 'opening progress shown').toBe(true);
  // Writes finish in the background; the preview is saved right after the install.
  await expect.poll(async () => (await layerStoreEntries(page)).filter((entry) => !entry.tag || entry.tag.startsWith('placed:')).length, { timeout: 120_000 })
    .toBeGreaterThanOrEqual(first.queued);
  await expect.poll(async () => (await layerStoreEntries(page)).some((entry) => entry.tag && !entry.tag.startsWith('placed:')), { timeout: 60_000 }).toBe(true);

  // Second open: the saved picture is the finished composite.
  await page.reload();
  await expect.poll(async () => (await marks(page, 'pixelforge.draft-preview')).length, { timeout: 60_000 }).toBe(1);
  await expect(rows(page)).toHaveCount(PAINTING.length, { timeout: 120_000 });
  await settled(page);
  expect((await marks(page, 'pixelforge.draft-preview-installed')).length, 'installed from the saved picture').toBe(1);
  expect(await compositeChecksum(page), 'saved picture is byte-identical to the computed composite').toEqual(computed);
  // The layers then render in the background, from the device store.
  await expect.poll(async () => (await marks(page, 'pixelforge.draft-warm')).map((mark) => (mark.detail as { completed: boolean }).completed), { timeout: 300_000 })
    .toEqual([true]);
  const warmed = (await storeStats(page)).at(-1)!;
  expect(warmed.hits, 'filtered layers read back, not recomputed').toBeGreaterThanOrEqual(7);
  expect(warmed.queued, 'nothing slow was recomputed').toBe(0);
  expect(await compositeChecksum(page)).toEqual(computed);

  // Third open without the saved picture: the full render reads every slow
  // layer (local and frame stages) from the device, a few layers ahead.
  expect(await dropDraftPreview(page)).toBe(1);
  await page.reload();
  await expect(rows(page)).toHaveCount(PAINTING.length, { timeout: 300_000 });
  await settled(page);
  expect((await marks(page, 'pixelforge.draft-preview')).length).toBe(0);
  const reopened = (await storeStats(page)).at(-1)!;
  expect(reopened.hits).toBeGreaterThanOrEqual(7);
  expect(reopened.queued).toBe(0);
  expect(reopened.prefetches, 'reads start ahead of the layers').toBeGreaterThan(0);
  expect(await compositeChecksum(page), 'layers from the device are byte-identical').toEqual(computed);
});
