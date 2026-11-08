import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';

// Retouch tools (Dodge, Burn, Sponge, Smudge, Blur, Sharpen, Mixer and
// History brushes) on a worker-sized (>= 2 MP) document with a mid-stack
// edited layer: every pointer move processes only the brush window of the
// layer (pixelforge.stroke-window), and every live preview renders in the
// persistent render worker, starting from the cached composite below the
// edited layer (pixelforge.gesture-preview) instead of recompositing the
// whole stack.

const SIZE = 1500;

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const settled = (page: Page) =>
  expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });

async function menu(page: Page, name: string, item: string | RegExp) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', typeof item === 'string' ? { name: item, exact: true } : { name: item }).click();
}

/** A textured, colourful mid-tone photo every retouch tool visibly changes. */
async function importPhoto(page: Page) {
  const png = await page.evaluate((size) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(size, size);
    let state = 11;
    for (let y = 0; y < size; y += 1)
      for (let x = 0; x < size; x += 1) {
        state = (state * 1664525 + 1013904223) >>> 0;
        const jitter = (state >>> 27) - 16, offset = (y * size + x) * 4;
        image.data[offset] = 70 + ((x * 3 + y) % 110) + jitter;
        image.data[offset + 1] = 90 + ((x + y * 2) % 70) - jitter;
        image.data[offset + 2] = 60 + ((x * 5 + y * 7) % 120) + jitter;
        image.data[offset + 3] = 255;
      }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  }, SIZE);
  await page.getByTestId('file-input').setInputFiles({
    name: 'retouch-preview-photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', String(SIZE), { timeout: 60_000 });
  await settled(page);
}

async function addPaintLayers(page: Page, count: number, clouds: boolean) {
  for (let index = 0; index < count; index += 1) {
    await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
    await settled(page);
    if (clouds && index % 2 === 0) {
      await menu(page, 'Filter', 'Clouds');
      await settled(page);
      await page.getByLabel('Layer opacity', { exact: true }).fill('30');
      await settled(page);
    }
  }
}

/**
 * Photo at the bottom, four paint layers (two with live Clouds), a copy of
 * the photo (the edited layer, index 5 from the bottom) and four more paint
 * layers above it: ten layers, over the composite cache's 8-layer threshold.
 */
async function buildStack(page: Page) {
  await importPhoto(page);
  await addPaintLayers(page, 4, true);
  const layers = page.getByRole('button', { name: /^Select layer / });
  // The panel lists layers top first; the photo is last. A duplicate goes on top.
  await layers.nth((await layers.count()) - 1).click();
  await settled(page);
  await menu(page, 'Layer', /^Duplicate Layer/);
  await settled(page);
  await page.getByLabel('Layer opacity', { exact: true }).fill('85');
  await settled(page);
  await addPaintLayers(page, 4, true);
  await expect(layers).toHaveCount(10);
  await layers.nth(4).click();
  await settled(page);
  await expect(layers.nth(4)).toHaveAccessibleName(/copy/i);
  // The photo copy (85 % opacity) is the active layer.
  await expect(page.getByLabel('Layer opacity', { exact: true })).toHaveValue('85');
  return { activeIndex: 5, layerCount: 10 };
}

type Preview = { path: string; firstCompleted: number; layers: number };
type StrokeWindow = { tool: string; pixels: number; layerPixels: number };

const digest = (page: Page) =>
  page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0x811c9dc5;
    for (let i = 0; i < data.length; i += 1) hash = Math.imul(hash ^ data[i], 0x01000193);
    return (hash >>> 0).toString(16);
  });

const marks = (page: Page) =>
  page.evaluate(() => ({
    previews: (performance.getEntriesByName('pixelforge.gesture-preview', 'mark') as PerformanceMark[]).map(
      (mark) => mark.detail as Preview,
    ),
    windows: (performance.getEntriesByName('pixelforge.stroke-window', 'mark') as PerformanceMark[]).map(
      (mark) => mark.detail as StrokeWindow,
    ),
  }));

/**
 * A 12-move stroke across the middle of the canvas, paced like pointer input,
 * that waits for the live previews to settle before releasing, so the last
 * preview can be compared with the committed render.
 */
async function stroke(page: Page, row: number) {
  await page.evaluate(() => {
    performance.clearMarks('pixelforge.gesture-preview');
    performance.clearMarks('pixelforge.stroke-window');
  });
  const canvas = page.getByTestId('editor-canvas');
  // On a phone the canvas can start below the fold: bring it into view and
  // stroke over the part of it that is on screen.
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const viewport = page.viewportSize()!;
  let left = Math.max(box.x, 0), top = Math.max(box.y, 0);
  let right = Math.min(box.x + box.width, viewport.width), bottom = Math.min(box.y + box.height, viewport.height);
  if (right - left < 20 || bottom - top < 20)
    [left, top, right, bottom] = [box.x, box.y, box.x + box.width, box.y + box.height];
  const at = (fx: number, fy: number) => ({
    clientX: left + (right - left) * fx,
    clientY: top + (bottom - top) * fy,
  });
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  const common = { pointerId: 311, pointerType: 'mouse', pressure: 1, isPrimary: true };
  await canvas.dispatchEvent('pointerdown', { ...common, ...at(0.25, row), buttons: 1 });
  // The gesture decodes its layer first; moves made meanwhile are replayed.
  await settled(page);
  let last = at(0.25, row);
  for (let step = 1; step <= 12; step += 1) {
    last = at(0.25 + step * 0.04, row + (step % 2) * 0.01);
    await canvas.dispatchEvent('pointermove', { ...common, ...last, buttons: 1 });
    await page.waitForTimeout(40);
  }
  // Let the coalesced previews catch up with the last move.
  await expect.poll(async () => (await marks(page)).previews.length).toBeGreaterThanOrEqual(2);
  await settled(page);
  await page.waitForTimeout(150);
  await settled(page);
  const previewed = await digest(page);
  const during = await marks(page);
  await canvas.dispatchEvent('pointerup', { ...common, ...last, buttons: 0 });
  await settled(page);
  return { previewed, ...during };
}

const TOOLS = [
  { label: 'Dodge', tool: 'dodge', notice: 'Dodge stroke applied' },
  { label: 'Burn', tool: 'burn', notice: 'Burn stroke applied' },
  { label: 'Sponge', tool: 'sponge', notice: 'Sponge stroke applied' },
  { label: 'Smudge', tool: 'smudge', notice: 'Smudge stroke applied' },
  { label: 'Blur', tool: 'blur', notice: 'Blur stroke applied' },
  { label: 'Sharpen', tool: 'sharpen', notice: 'Sharpen stroke applied' },
  { label: 'Mixer Brush', tool: 'mixer-brush', notice: 'Mixer Brush stroke applied' },
  { label: 'History Brush', tool: 'history-brush', notice: /History Brush restored source/ },
] as const;

test('retouch strokes on a mid-stack layer preview in the worker from the cached composite and touch only the brush window', async ({ page }) => {
  test.setTimeout(360_000);
  const { activeIndex, layerCount } = await buildStack(page);
  let row = 0.15;
  for (const { label, tool, notice } of TOOLS) {
    await selectTool(page, label);
    const size = page.getByLabel('Size', { exact: true }).first();
    if (await size.isVisible()) await size.fill('60');
    const before = await digest(page);
    const result = await stroke(page, row);
    row += 0.09;
    await expect(page.locator('footer'), label).toContainText(notice);
    // Per move: only the brush window of the 1500 x 1500 layer was processed.
    const windows = result.windows.filter((item) => item.tool === tool);
    expect(windows.length, `${label} segments`).toBeGreaterThanOrEqual(1);
    for (const item of windows) {
      expect(item.layerPixels).toBe(SIZE * SIZE);
      expect(item.pixels, `${label} window`).toBeLessThan(item.layerPixels / 20);
    }
    // Per preview: rendered by the worker, starting above the cached
    // composite of the five layers below the edited one. The first preview
    // after choosing a layer may have to build that snapshot.
    expect(result.previews.length, `${label} previews`).toBeGreaterThanOrEqual(2);
    for (const preview of result.previews) {
      expect(preview.path, `${label} preview path`).toBe('worker');
      expect(preview.layers).toBe(layerCount);
    }
    const fromCache = result.previews.filter((preview) => preview.firstCompleted >= activeIndex).length;
    expect(fromCache, `${label} previews from the cached composite`).toBeGreaterThanOrEqual(result.previews.length - 1);
    // The last preview and the commit show the same pixels.
    const committed = await digest(page);
    expect(committed, `${label} commit equals the last preview`).toBe(result.previewed);
    // Mixer and History brushes sample this very layer here, so they may
    // leave it unchanged; every other tool visibly edits the photo.
    if (tool !== 'history-brush' && tool !== 'mixer-brush')
      expect(committed, `${label} changed the image`).not.toBe(before);
  }
  await expect(page.locator('footer')).not.toContainText('Could not render');
});

test('a Dodge stroke reloads to the same pixels it committed', async ({ page }) => {
  test.setTimeout(240_000);
  await buildStack(page);
  await selectTool(page, 'Dodge');
  const size = page.getByLabel('Size', { exact: true }).first();
  if (await size.isVisible()) await size.fill('90');
  const before = await digest(page);
  const result = await stroke(page, 0.5);
  await expect(page.locator('footer')).toContainText('Dodge stroke applied');
  const committed = await digest(page);
  expect(committed).toBe(result.previewed);
  expect(committed).not.toBe(before);
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device', { timeout: 60_000 });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await settled(page);
  expect(await digest(page)).toBe(committed);
});
