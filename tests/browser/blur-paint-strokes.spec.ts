import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';

// Regression for "Gaussian Blur has no visible effect on a paint layer made
// only of brush strokes". Thin plain-brush strokes on a transparent paint
// layer (clipped to a filled base, and unclipped) must soften and widen with
// the blur radius, keep that after Release Clipping Mask, Rasterize and
// reload, and spread past a tightly trimmed layer's stored bounds.

type Asset = { url: string; w: number; h: number };
type ProjectLayer = {
  id: string;
  kind: string;
  asset?: string;
  matrix: number[];
  clippingTo?: string;
  adjustments: { filterEffects?: { type?: string; radius?: number; amount?: number } };
};
type Project = {
  history: Array<{ w: number; h: number; layers: ProjectLayer[]; active: string }>;
  index: number;
  assets: Record<string, Asset>;
};

const WIDTH = 400;
const HEIGHT = 300;
const COLUMN = 200;
const STROKE_ROWS = [50, 110, 170, 230];

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const footer = (page: Page) => page.locator('footer');
const settled = (page: Page) =>
  expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });
const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device', {
    timeout: 30_000,
  });

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

async function newDocument(page: Page, background: 'white' | 'transparent', width = WIDTH, height = HEIGHT) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('New document width (px)').fill(String(width));
  await dialog.getByLabel('New document height (px)').fill(String(height));
  await dialog.getByLabel('Background contents').selectOption(background);
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(canvas(page)).toHaveJSProperty('width', width);
  await settled(page);
}

async function setColor(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).evaluate((input: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function at(page: Page, x: number, y: number) {
  return canvas(page).evaluate((element: HTMLCanvasElement, point) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + (point.x / element.width) * rect.width, y: rect.top + (point.y / element.height) * rect.height };
  }, { x, y });
}

async function mouseStroke(page: Page, from: [number, number], to: [number, number]) {
  await canvas(page).scrollIntoViewIfNeeded();
  const a = await at(page, ...from), b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  await expect(footer(page)).toContainText('Paint layer updated', { timeout: 10_000 });
  await settled(page);
}

/** Plain red brush, 7 px, hardness 40, thin horizontal strokes across the canvas. */
async function paintStrokes(page: Page, rows = STROKE_ROWS, from = 40, to = 360, size = 7) {
  await selectTool(page, 'Brush');
  await setColor(page, 'Drawing color', '#ff0000');
  await page.getByLabel('Size', { exact: true }).fill(String(size));
  await page.getByLabel('Size', { exact: true }).press('Enter');
  const hardness = page.getByLabel('Hardness', { exact: true });
  await hardness.fill('40');
  await expect(hardness).toHaveValue('40');
  for (const row of rows) await mouseStroke(page, [from, row], [to, row]);
}

/** RGBA down one composite column. */
const column = (page: Page, x = COLUMN) =>
  canvas(page).evaluate(
    (element: HTMLCanvasElement, cx) => Array.from(element.getContext('2d')!.getImageData(cx, 0, 1, element.height).data),
    x,
  );

/**
 * Edge profile of red strokes down a column: rows touched by the stroke (on
 * white: G below 250; on transparent: alpha above 0) and the strongest
 * coverage (255 = a fully opaque red pixel).
 */
function profile(data: number[], background: 'white' | 'transparent') {
  let touched = 0, peak = 0;
  for (let y = 0; y < data.length / 4; y += 1) {
    const coverage = background === 'white' ? 255 - data[y * 4 + 1] : data[y * 4 + 3];
    if (coverage > 5) touched += 1;
    peak = Math.max(peak, coverage);
  }
  return { touched, peak };
}

async function project(page: Page): Promise<Project> {
  await saved(page);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return (await downloadedProject((await download.path())!)) as Project;
}

async function activeLayer(page: Page) {
  const value = await project(page);
  const frame = value.history[value.index];
  const layer = frame.layers.find((item) => item.id === frame.active)!;
  return { frame, layer, asset: value.assets[layer.asset!]! };
}

async function gaussian(page: Page, radius: number) {
  const radiusInput = page.getByLabel('Blur radius', { exact: true });
  if (!(await radiusInput.count())) {
    await menu(page, 'Filter', 'Gaussian Blur…');
    await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('gaussian-blur');
    await expect(footer(page)).toContainText(/Gaussian Blur applied; remains editable/i);
    await settled(page);
    await page.getByLabel('Effect amount', { exact: true }).fill('100');
    await settled(page);
  }
  await radiusInput.fill(String(radius));
  await settled(page);
}

test('Gaussian Blur softens brush strokes on a clipped paint layer and keeps it through release, Rasterize and reload', async ({ page }) => {
  test.setTimeout(180_000);
  await newDocument(page, 'white');
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await menu(page, 'Layer', 'Create Clipping Mask');
  await expect(page.getByText(/Clipping mask created/).first()).toBeVisible();
  await paintStrokes(page);

  const sharp = profile(await column(page), 'white');
  expect(sharp.peak).toBeGreaterThan(240);
  expect(sharp.touched).toBeLessThan(STROKE_ROWS.length * 12);
  const clipped = await activeLayer(page);
  expect(clipped.layer.clippingTo).toBeTruthy();

  await gaussian(page, 7);
  const r7 = profile(await column(page), 'white');
  await gaussian(page, 40);
  const r40 = profile(await column(page), 'white');
  // The edge widens with the radius and the peak drops: no longer razor sharp.
  expect(r7.touched).toBeGreaterThan(sharp.touched + STROKE_ROWS.length * 4);
  expect(r40.touched).toBeGreaterThan(r7.touched + 40);
  expect(r7.peak).toBeLessThan(sharp.peak);
  expect(r40.peak).toBeLessThan(r7.peak - 40);
  const blurred = await column(page);

  const stored = await activeLayer(page);
  expect(stored.layer.adjustments.filterEffects).toMatchObject({ type: 'gaussian-blur', radius: 40, amount: 100 });

  // Releasing the clip over an opaque base changes nothing.
  await menu(page, 'Layer', 'Release Clipping Mask');
  await settled(page);
  expect(await column(page)).toEqual(blurred);

  // Rasterize bakes the softened strokes, not the sharp source.
  await menu(page, 'Layer', 'Rasterize');
  await settled(page);
  const baked = await column(page);
  for (let index = 0; index < baked.length; index += 1)
    expect(Math.abs(baked[index] - blurred[index]), `byte ${index}`).toBeLessThanOrEqual(2);
  const rasterized = await activeLayer(page);
  expect(rasterized.layer.adjustments.filterEffects?.type ?? 'none').toBe('none');

  await saved(page);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false', { timeout: 60_000 });
  await settled(page);
  const reloaded = profile(await column(page), 'white');
  expect(reloaded.touched).toBe(profile(baked, 'white').touched);
  expect(Math.abs(reloaded.peak - profile(baked, 'white').peak)).toBeLessThanOrEqual(2);
});

test('an unclipped stroke layer blurs, survives reload, and Box/Motion/Lens blur spread too', async ({ page }) => {
  test.setTimeout(180_000);
  await newDocument(page, 'transparent');
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await paintStrokes(page);
  const sharp = profile(await column(page), 'transparent');
  expect(sharp.peak).toBe(255);

  await gaussian(page, 7);
  const r7 = profile(await column(page), 'transparent');
  await gaussian(page, 40);
  const r40 = profile(await column(page), 'transparent');
  expect(r7.touched).toBeGreaterThan(sharp.touched);
  expect(r40.touched).toBeGreaterThan(r7.touched + 40);
  expect(r40.peak).toBeLessThan(200);

  await saved(page);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false', { timeout: 60_000 });
  await settled(page);
  expect(profile(await column(page), 'transparent')).toEqual(r40);

  for (const [item, type] of [
    ['Box Blur…', 'box-blur'],
    ['Motion Blur…', 'motion-blur'],
    ['Lens Blur…', 'lens-blur'],
  ] as const) {
    await page.getByLabel('Filter effect', { exact: true }).selectOption(type);
    await settled(page);
    await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue(type);
    await page.getByLabel('Effect amount', { exact: true }).fill('100');
    // Motion Blur runs along the strokes at angle 0; turn it across them.
    if (type === 'motion-blur') await page.getByLabel('Motion angle', { exact: true }).fill('90');
    await page.getByLabel('Blur radius', { exact: true }).fill('12');
    await settled(page);
    const spread = profile(await column(page), 'transparent');
    expect(spread.touched, item).toBeGreaterThan(sharp.touched + STROKE_ROWS.length * 6);
    expect(spread.peak, item).toBeLessThan(255);
  }
});

test('a 2646×4096 stroke layer (tiled render path) blurs and the radius changes the edge profile', async ({ page }) => {
  test.setTimeout(300_000);
  await newDocument(page, 'transparent', 2646, 4096);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await paintStrokes(page, [900, 1700, 2500, 3300], 300, 2300, 9);
  const x = 1300;
  const sharp = profile(await column(page, x), 'transparent');
  expect(sharp.peak).toBe(255);
  await gaussian(page, 7);
  const r7 = profile(await column(page, x), 'transparent');
  await gaussian(page, 40);
  const r40 = profile(await column(page, x), 'transparent');
  expect(r7.touched).toBeGreaterThan(sharp.touched);
  expect(r40.touched).toBeGreaterThan(r7.touched + 4 * 40);
  expect(r40.peak).toBeLessThan(r7.peak);
  await saved(page);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false', { timeout: 60_000 });
  await settled(page);
  expect(profile(await column(page, x), 'transparent')).toEqual(r40);
});

test('a tightly trimmed stroke layer grows so the blur spreads past its stored bounds', async ({ page }) => {
  test.setTimeout(180_000);
  await newDocument(page, 'transparent');
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await paintStrokes(page, [150], 120, 280);
  await menu(page, 'Layer', 'Trim Layer to Content');
  await expect(footer(page)).toContainText(/Layer trimmed to/);
  await settled(page);
  const trimmed = await activeLayer(page);
  // Tight: the stored asset is only the stroke (7 px brush, soft edge).
  expect(trimmed.asset.h).toBeLessThan(20);
  const top = trimmed.layer.matrix[5], bottom = top + trimmed.asset.h;

  await gaussian(page, 24);
  // Choosing the filter first grows the trimmed layer (pixel-identically) to the canvas.
  await expect.poll(async () => (await activeLayer(page)).asset.h, { timeout: 20_000 }).toBeGreaterThan(trimmed.asset.h + 40);
  await settled(page);
  const data = await column(page);
  const alphaAt = (y: number) => data[y * 4 + 3];
  // Visible blur above and below the old stored rows.
  expect(alphaAt(top - 6)).toBeGreaterThan(0);
  expect(alphaAt(bottom + 5)).toBeGreaterThan(0);
  const grown = await activeLayer(page);
  expect(grown.layer.adjustments.filterEffects).toMatchObject({ type: 'gaussian-blur', radius: 24 });

  // Undo steps back through the radius edit; the blur stays editable.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await settled(page);
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('gaussian-blur');
  const undone = await activeLayer(page);
  expect(undone.layer.adjustments.filterEffects?.radius).not.toBe(24);
});
