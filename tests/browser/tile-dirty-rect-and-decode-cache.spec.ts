import { test, expect, type Page } from '@playwright/test';
import zlib from 'node:zlib';
import { selectTool } from './tool-selection';
import { openPanel } from './sidebar-panels';

// W4-5 / W4-7 (docs/tiled-layer-assets-contract.md): a paint commit on a
// tiled layer reads back and hashes only the tiles its dirty rectangle
// touches, with exactly the tiles a full scan would produce; assembling a
// version that shares tiles draws them from the decoded-tile cache (main
// thread and render worker). Pixels must stay identical through undo, redo
// and reload. `__PIXELFORGE_VERIFY_TILE_HINTS__` makes every hinted commit
// also run the full scan and report whether the tiles matched.

const W = 1600;
const H = 1200;
const TILES = Math.ceil(W / 256) * Math.ceil(H / 256);

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (bytes: Buffer) => {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([length, body, sum]);
};
/** A noisy RGB photo (every tile distinct). */
function noisyPng() {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  let state = 23;
  for (let y = 0; y < H; y++) {
    const row = y * (W * 3 + 1);
    for (let x = 0; x < W * 3; x++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      raw[row + 1 + x] = ((x >> 2) + (y >> 3) + (state >>> 29)) & 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(W, 0);
  header.writeUInt32BE(H, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const settled = (page: Page) =>
  expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });
const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device', {
    timeout: 60_000,
  });
const historyPosition = (page: Page) =>
  page.getByRole('region', { name: 'History' }).getByLabel('History position');

async function open(page: Page, flags: { worker?: boolean } = {}) {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.addInitScript((worker) => {
    const scope = window as Window & { __PIXELFORGE_VERIFY_TILE_HINTS__?: boolean; __PIXELFORGE_FORCE_WORKER__?: boolean };
    scope.__PIXELFORGE_VERIFY_TILE_HINTS__ = true;
    if (worker) scope.__PIXELFORGE_FORCE_WORKER__ = true;
  }, flags.worker === true);
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await saved(page);
  await page.getByTestId('file-input').setInputFiles({ name: 'noisy-photo.png', mimeType: 'image/png', buffer: noisyPng() });
  await expect(canvas(page)).toHaveJSProperty('width', W);
  await settled(page);
  await saved(page);
}

type TileCommit = {
  tiles: number;
  hashed: number;
  skipped: number;
  encoded: number;
  hinted: boolean;
  fallback?: string;
  fullScanMatch?: boolean;
};
type TileCache = { hits: number; misses: number; seeded: number; context: 'main' | 'worker' };

/** Drain the performance marks of one kind. */
const drain = <T,>(page: Page, name: string) =>
  page.evaluate((mark) => {
    const details = performance.getEntriesByName(mark, 'mark').map((entry) => (entry as PerformanceMark).detail);
    performance.clearMarks(mark);
    return details;
  }, name) as Promise<T[]>;
const tileCommits = (page: Page) => drain<TileCommit>(page, 'pixelforge.tile-commit');
const tileCache = (page: Page) => drain<TileCache>(page, 'pixelforge.decoded-tile-cache');

/** SHA-256 of the composited canvas once it stops changing. */
async function digest(page: Page) {
  await settled(page);
  const read = () =>
    canvas(page).evaluate(async (element: HTMLCanvasElement) => {
      const pixels = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
      const hash = await crypto.subtle.digest('SHA-256', pixels);
      return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
    });
  let previous = '';
  let current = await read();
  for (let attempt = 0; attempt < 30 && current !== previous; attempt += 1) {
    await page.waitForTimeout(250);
    previous = current;
    current = await read();
  }
  return current;
}

/** A horizontal stroke at document row y (from x0 to x1). */
async function stroke(page: Page, pointerId: number, x0: number, x1: number, y: number) {
  await openPanel(page, 'History');
  const before = await historyPosition(page).innerText();
  await canvas(page).scrollIntoViewIfNeeded();
  await canvas(page).evaluate(
    async (element: HTMLCanvasElement, { pointerId, x0, x1, y }) => {
      element.setPointerCapture = () => undefined;
      const rect = element.getBoundingClientRect();
      const client = (x: number) => ({
        clientX: rect.left + ((x + 0.5) / element.width) * rect.width,
        clientY: rect.top + ((y + 0.5) / element.height) * rect.height,
      });
      const common = { pointerId, pointerType: 'mouse', pressure: 1, isPrimary: true, bubbles: true };
      element.dispatchEvent(new PointerEvent('pointerdown', { ...common, buttons: 1, button: 0, ...client(x0) }));
      for (let i = 1; i <= 10; i++) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        element.dispatchEvent(new PointerEvent('pointermove', { ...common, buttons: 1, ...client(x0 + ((x1 - x0) * i) / 10) }));
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
      element.dispatchEvent(new PointerEvent('pointerup', { ...common, buttons: 0, button: 0, ...client(x1) }));
    },
    { pointerId, x0, x1, y },
  );
  await expect(historyPosition(page)).not.toHaveText(before, { timeout: 60_000 });
  await settled(page);
}

async function setRange(page: Page, label: string, value: number) {
  await page.getByLabel(label, { exact: true }).evaluate((input: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(next));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function tool(page: Page, name: 'Brush' | 'Pencil' | 'Eraser', size: number, hardness?: number) {
  await selectTool(page, name);
  await page.getByLabel('Size', { exact: true }).fill(String(size));
  if (hardness !== undefined) await setRange(page, 'Hardness', hardness);
}

/** Every hinted commit since the last drain matched the full scan; returns the stroke commit. */
async function expectHintedCommit(page: Page, maxHashed: number) {
  const commits = await tileCommits(page);
  const hinted = commits.filter((commit) => commit.hinted);
  expect(hinted.length).toBeGreaterThanOrEqual(1);
  for (const commit of hinted) {
    expect(commit.fullScanMatch).toBe(true);
    expect(commit.skipped + commit.hashed).toBe(commit.tiles);
  }
  const last = hinted.at(-1)!;
  expect(last.hashed).toBeGreaterThanOrEqual(1);
  expect(last.hashed).toBeLessThanOrEqual(maxHashed);
  return last;
}

async function blur(page: Page) {
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
}
async function undo(page: Page) {
  await openPanel(page, 'History');
  const before = await historyPosition(page).innerText();
  await page.keyboard.press('Control+z');
  await expect(historyPosition(page)).not.toHaveText(before);
}
async function redo(page: Page) {
  await openPanel(page, 'History');
  const before = await historyPosition(page).innerText();
  await page.keyboard.press('Control+Shift+z');
  await expect(historyPosition(page)).not.toHaveText(before);
}

/** Undo every step back to the first digest, then redo them all, comparing pixels. */
async function walkHistory(page: Page, digests: string[]) {
  await blur(page);
  for (let index = digests.length - 2; index >= 0; index -= 1) {
    await undo(page);
    expect(await digest(page), `undo to step ${index}`).toBe(digests[index]);
  }
  for (let index = 1; index < digests.length; index += 1) {
    await redo(page);
    expect(await digest(page), `redo to step ${index}`).toBe(digests[index]);
  }
}

async function reloadDraft(page: Page) {
  await saved(page);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false', { timeout: 60_000 });
  await expect(canvas(page)).toHaveJSProperty('width', W);
}

test('brush, pencil, eraser, symmetry and selection-confined strokes on a photo commit only their tiles, identical to a full scan', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page);
  await tileCommits(page);
  const digests = [await digest(page)];

  // Hard brush inside tile (2, 2).
  await tool(page, 'Brush', 24, 100);
  await stroke(page, 31, 560, 700, 600);
  const hard = await expectHintedCommit(page, 2);
  expect(hard.skipped).toBe(TILES - hard.hashed);
  expect(hard.encoded).toBeLessThanOrEqual(hard.hashed);
  digests.push(await digest(page));

  // A soft brush across a tile corner (semi-transparent edges blend in).
  await setRange(page, 'Hardness', 0);
  await page.getByLabel('Size', { exact: true }).fill('70');
  await stroke(page, 32, 980, 1060, 760);
  await expectHintedCommit(page, 4);
  digests.push(await digest(page));

  // Pencil and Eraser use the same tracked stamps.
  await tool(page, 'Pencil', 9);
  await stroke(page, 33, 100, 200, 100);
  await expectHintedCommit(page, 2);
  digests.push(await digest(page));
  await tool(page, 'Eraser', 40, 50);
  await stroke(page, 34, 1300, 1500, 1000);
  await expectHintedCommit(page, 4);
  digests.push(await digest(page));

  // Vertical symmetry: the mirrored copy's tiles are part of the hint.
  await tool(page, 'Brush', 20, 100);
  await page.getByLabel('Paint symmetry', { exact: true }).selectOption('vertical');
  await stroke(page, 35, 300, 360, 300);
  const mirrored = await expectHintedCommit(page, 8);
  expect(mirrored.hashed).toBeGreaterThanOrEqual(2);
  digests.push(await digest(page));
  await page.getByLabel('Paint symmetry', { exact: true }).selectOption('off');

  // A stroke confined to a rectangular selection across the boundary.
  await selectTool(page, 'Select');
  await canvas(page).scrollIntoViewIfNeeded();
  const corners = await canvas(page).evaluate((element: HTMLCanvasElement) => {
    const rect = element.getBoundingClientRect();
    const at = (x: number, y: number) => ({ x: rect.left + (x / element.width) * rect.width, y: rect.top + (y / element.height) * rect.height });
    return [at(600, 880), at(900, 1100)];
  });
  await page.mouse.move(corners[0].x, corners[0].y);
  await page.mouse.down();
  await page.mouse.move(corners[1].x, corners[1].y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('footer')).toContainText(/selection/i);
  // The selection is its own history step.
  digests.push(await digest(page));
  await tileCommits(page);
  await tool(page, 'Brush', 30, 100);
  await stroke(page, 36, 500, 1000, 990);
  await expectHintedCommit(page, 8);
  digests.push(await digest(page));

  // Exact undo/redo through every hinted commit, then a reload from the draft.
  await walkHistory(page, digests);
  await reloadDraft(page);
  expect(await digest(page)).toBe(digests.at(-1));
});

test('a soft stroke on a new paint layer commits from its dirty rectangle and stores only its bounds', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await tileCommits(page);
  const digests = [await digest(page)];

  await tool(page, 'Brush', 60, 0);
  await stroke(page, 41, 200, 420, 300);
  // Two hinted commits: the canvas-size expansion at pointer-down (an empty
  // base) and the stroke itself; both match a full scan.
  const first = await expectHintedCommit(page, 4);
  expect(first.encoded).toBeLessThanOrEqual(first.hashed);
  digests.push(await digest(page));

  // The layer was stored at its content bounds; the next stroke grows it
  // again (expansion hint from the trimmed asset) and commits its tiles.
  await stroke(page, 42, 1200, 1450, 1050);
  await expectHintedCommit(page, 4);
  digests.push(await digest(page));

  await tool(page, 'Eraser', 50, 0);
  await stroke(page, 43, 250, 330, 300);
  await expectHintedCommit(page, 4);
  digests.push(await digest(page));

  await walkHistory(page, digests);
  await reloadDraft(page);
  expect(await digest(page)).toBe(digests.at(-1));
});

for (const worker of [false, true]) {
  test(`undo and redo after a reload assemble shared tiles from the decoded-tile cache (${worker ? 'render worker' : 'main thread'})`, async ({ page }) => {
    test.setTimeout(300_000);
    await open(page, { worker });
    const digests = [await digest(page)];
    await tool(page, 'Brush', 24, 100);
    await stroke(page, 51, 560, 700, 600);
    digests.push(await digest(page));
    await stroke(page, 52, 1300, 1420, 1100);
    digests.push(await digest(page));

    // A reload starts with empty caches: the current version decodes its tiles.
    await reloadDraft(page);
    expect(await digest(page)).toBe(digests[2]);
    await tileCache(page);
    await blur(page);
    // Undo twice: each older version shares all but one or two tiles.
    await undo(page);
    expect(await digest(page)).toBe(digests[1]);
    await undo(page);
    expect(await digest(page)).toBe(digests[0]);
    await redo(page);
    expect(await digest(page)).toBe(digests[1]);
    await redo(page);
    expect(await digest(page)).toBe(digests[2]);
    const context = worker ? 'worker' : 'main';
    const marks = (await tileCache(page)).filter((mark) => mark.context === context);
    const hits = marks.reduce((total, mark) => total + mark.hits, 0);
    const misses = marks.reduce((total, mark) => total + mark.misses, 0);
    // Two older versions were assembled; together they introduce at most
    // four tiles the current version does not hold.
    expect(hits).toBeGreaterThanOrEqual(2 * (TILES - 4));
    expect(misses).toBeLessThanOrEqual(4);
  });
}
