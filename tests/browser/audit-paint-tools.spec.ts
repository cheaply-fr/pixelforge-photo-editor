import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';

// Toolbar audit 2026-11 (paint family): Opacity is a per-stroke ceiling
// (B-08), Red Eye and Mixer Brush change pixels or add no history (B-09,
// B-10), the Adjustment Brush creates its mask (B-11), the Background layer
// is position-locked and erases to the background colour (I-01), and Silk
// strands use Size as the ribbon width (I-21). Pixels are read from the
// composited editor canvas, whose bitmap is in document pixels.

type Project = {
  settings: Record<string, unknown>;
  history: Array<{ layers: Array<{ name: string; kind: string; mask?: string; maskEnabled?: boolean; background?: boolean }> }>;
  index: number;
};

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const settled = (page: Page) => expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
const footer = (page: Page) => page.locator('footer');

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
});

async function project(page: Page): Promise<Project> {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return await downloadedProject((await (await pending).path())!) as Project;
}

async function newDocument(page: Page, background: 'white' | 'black' = 'white', width = 400, height = 300) {
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

async function setValue(page: Page, label: string, value: string) {
  const control = page.getByLabel(label, { exact: true });
  await control.fill(value);
  await control.press('Enter');
  await expect(control).toHaveValue(value);
}

/** Client position of a document pixel. */
async function at(page: Page, x: number, y: number) {
  return canvas(page).evaluate((element: HTMLCanvasElement, point) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + (point.x / element.width) * rect.width, y: rect.top + (point.y / element.height) * rect.height };
  }, { x, y });
}

async function pixel(page: Page, x: number, y: number) {
  await settled(page);
  return canvas(page).evaluate((element: HTMLCanvasElement, point) =>
    Array.from(element.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data), { x, y });
}

/** A real mouse drag through many pointer moves (overlapping dabs). */
async function drag(page: Page, from: [number, number], to: [number, number], options: { alt?: boolean; steps?: number } = {}) {
  await canvas(page).scrollIntoViewIfNeeded();
  const start = await at(page, ...from), end = await at(page, ...to);
  if (options.alt) await page.keyboard.down('Alt');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: options.steps ?? 24 });
  await page.mouse.up();
  if (options.alt) await page.keyboard.up('Alt');
  await settled(page);
}

async function click(page: Page, x: number, y: number, alt = false) {
  await canvas(page).scrollIntoViewIfNeeded();
  const point = await at(page, x, y);
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.click(point.x, point.y);
  if (alt) await page.keyboard.up('Alt');
  await settled(page);
}

const near = (actual: number[], expected: number[], tolerance = 3) =>
  expect(actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance), `${actual.join(',')} ≈ ${expected.join(',')}`).toBe(true);

test('Brush, Eraser and Clone at Opacity 50 % stay at 50 % for a whole overlapping stroke (B-08)', async ({ page }) => {
  await newDocument(page, 'white');
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await selectTool(page, 'Brush');
  await setColor(page, 'Drawing color', '#ff0000');
  await setValue(page, 'Size', '40');
  await page.getByLabel('Opacity', { exact: true }).fill('50');
  await page.getByLabel('Flow', { exact: true }).fill('100');
  await drag(page, [60, 60], [340, 60]);
  await expect(footer(page)).toContainText('Paint layer updated');
  // 50 % red over white everywhere along the stroke, not 1 − 0.5ⁿ.
  for (const x of [100, 200, 300]) near(await pixel(page, x, 60), [255, 128, 128, 255]);

  // Full-opacity blue band, then a 50 % eraser stroke removes half of it.
  await setColor(page, 'Drawing color', '#0000ff');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await drag(page, [60, 150], [340, 150]);
  await selectTool(page, 'Eraser');
  await page.getByLabel('Opacity', { exact: true }).fill('50');
  await drag(page, [60, 150], [340, 150]);
  for (const x of [120, 240]) near(await pixel(page, x, 150), [128, 128, 255, 255]);

  // Clone the blue band at 50 % into the white area below it.
  await selectTool(page, 'Brush');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await drag(page, [60, 150], [340, 150]);
  near(await pixel(page, 120, 150), [0, 0, 255, 255], 1);
  await selectTool(page, 'Clone');
  await setValue(page, 'Size', '20');
  await page.getByLabel('Opacity', { exact: true }).fill('50');
  await click(page, 100, 150, true);
  await expect(footer(page)).toContainText('Clone source set');
  await drag(page, [100, 240], [300, 240]);
  for (const x of [150, 250]) near(await pixel(page, x, 240), [128, 128, 255, 255]);
});

test('Red Eye neutralises a pure red stroke and adds no history when nothing matches (B-09)', async ({ page }) => {
  await newDocument(page, 'white');
  await selectTool(page, 'Brush');
  await setColor(page, 'Drawing color', '#ff0000');
  await setValue(page, 'Size', '60');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await drag(page, [60, 150], [340, 150]);
  near(await pixel(page, 200, 150), [255, 0, 0, 255], 0);
  await selectTool(page, 'Red Eye');
  await setValue(page, 'Size', '40');
  await click(page, 200, 150);
  await expect(footer(page)).toContainText('Red Eye correction applied');
  // Pure red (255,0,0) → (green + blue) / 2 = 0.
  near(await pixel(page, 200, 150), [0, 0, 0, 255], 1);
  near(await pixel(page, 300, 150), [255, 0, 0, 255], 0);
  const before = await project(page);
  await click(page, 200, 40);
  await expect(footer(page)).toContainText('No red-eye pixels found under the brush');
  const after = await project(page);
  expect(after.history.length).toBe(before.history.length);
  expect(after.index).toBe(before.index);
});

test('Mixer Brush drags sky colour into the sun and refuses a no-op stroke (B-10)', async ({ page }) => {
  // The sample image: sky gradient with the sun (201,129,79) at (1120,260).
  await selectTool(page, 'Mixer Brush');
  await setValue(page, 'Size', '60');
  await page.getByLabel('Wet', { exact: true }).fill('45');
  await page.getByLabel('Load', { exact: true }).fill('55');
  await page.getByLabel('Mix', { exact: true }).fill('50');
  await page.getByLabel('Flow', { exact: true }).fill('65');
  const sun = await pixel(page, 1060, 260);
  const before = await project(page);
  await drag(page, [880, 260], [1120, 260]);
  await expect(footer(page)).toContainText('Mixer Brush stroke applied');
  const mixed = await pixel(page, 1060, 260);
  expect(mixed[2], `blue rises: ${sun.join(',')} → ${mixed.join(',')}`).toBeGreaterThan(sun[2] + 5);
  expect(mixed[0]).toBeLessThan(sun[0]);
  const after = await project(page);
  expect(after.history.length).toBe(before.history.length + 1);

  // An empty paint layer has no paint to mix: no history step.
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await selectTool(page, 'Mixer Brush');
  const empty = await project(page);
  await drag(page, [200, 600], [500, 600]);
  await expect(footer(page)).toContainText('No Mixer Brush change');
  expect((await project(page)).history.length).toBe(empty.history.length);
});

test('Adjustment Brush creates the mask on a fresh adjustment layer and paints it in and out (B-11)', async ({ page }) => {
  const a: [number, number] = [300, 720], b: [number, number] = [1300, 820];
  const baseA = await pixel(page, ...a), baseB = await pixel(page, ...b);
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Adjustment Layer', exact: true }).click();
  await page.getByLabel('Hue', { exact: true }).fill('120');
  await expect.poll(async () => (await pixel(page, ...a)).join(',')).not.toBe(baseA.join(','));
  const adjustedA = await pixel(page, ...a), adjustedB = await pixel(page, ...b);

  await selectTool(page, 'Adjustment Brush');
  await expect(page.getByLabel('Adjustment Brush mode', { exact: true })).toHaveValue('reveal');
  await setValue(page, 'Size', '40');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await click(page, ...a);
  await expect(footer(page)).toContainText('Adjustment Brush applied to the adjustment mask');
  // The first Reveal stroke limits the adjustment to the painted area.
  near(await pixel(page, ...a), adjustedA, 2);
  near(await pixel(page, ...b), baseB, 2);
  const masked = await project(page);
  const layer = masked.history[masked.index].layers.at(-1)!;
  expect(layer.kind).toBe('adjustment');
  expect(layer.mask).toEqual(expect.any(String));
  expect(layer.maskEnabled).toBe(true);

  // Conceal paints it out again; Alt flips the mode for one stroke.
  await page.getByLabel('Adjustment Brush mode', { exact: true }).selectOption('conceal');
  await click(page, ...a);
  await expect(footer(page)).toContainText('Adjustment Brush concealed the adjustment');
  near(await pixel(page, ...a), baseA, 2);
  await click(page, ...b, true);
  await expect(footer(page)).toContainText('Adjustment Brush applied to the adjustment mask');
  near(await pixel(page, ...b), adjustedB, 2);
});

test('the Background layer is position-locked and erases to the background colour until converted (I-01)', async ({ page }) => {
  let doc = await project(page);
  expect(doc.history[doc.index].layers[0]).toMatchObject({ name: 'Background', background: true });
  await expect(page.getByTestId('background-layer-status')).toBeVisible();
  const sky = await pixel(page, 400, 150);

  await selectTool(page, 'Move');
  await drag(page, [400, 300], [600, 400]);
  await expect(footer(page)).toContainText('Background layer is position-locked');
  expect(await pixel(page, 400, 150)).toEqual(sky);
  expect((await project(page)).history.length).toBe(doc.history.length);

  await selectTool(page, 'Eraser');
  await setValue(page, 'Size', '40');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await drag(page, [340, 150], [460, 150]);
  near(await pixel(page, 400, 150), [255, 255, 255, 255], 1);

  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Layer from Background', exact: true }).click();
  await expect(footer(page)).toContainText('Background converted to a normal layer');
  doc = await project(page);
  expect(doc.history[doc.index].layers[0].name).toBe('Layer 0');
  expect(doc.history[doc.index].layers[0].background).toBeUndefined();
  await expect(page.getByTestId('background-layer-status')).toHaveCount(0);
  await selectTool(page, 'Move');
  await drag(page, [400, 300], [600, 400]);
  await expect(footer(page)).toContainText('Layer moved');
});

/** Separate bright runs (strands) in one canvas column. */
async function strandRuns(page: Page, x: number) {
  await settled(page);
  const values = await canvas(page).evaluate((element: HTMLCanvasElement, columnX) => {
    const data = element.getContext('2d')!.getImageData(columnX, 0, 1, element.height).data,
      out: number[] = [];
    for (let index = 0; index < data.length; index += 4) out.push(Math.max(data[index], data[index + 1], data[index + 2]));
    return out;
  }, x);
  const runs: { start: number; end: number }[] = [];
  values.forEach((value, y) => {
    if (value < 40) return;
    const last = runs[runs.length - 1];
    if (last && y - last.end <= 1) last.end = y;
    else runs.push({ start: y, end: y });
  });
  return runs;
}

test('Silk strands: Size is the ribbon width and Strand thickness is a persisted option (I-21)', async ({ page }) => {
  await newDocument(page, 'black');
  await selectTool(page, 'Brush');
  await setColor(page, 'Drawing color', '#ffffff');
  await setValue(page, 'Size', '80');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await page.getByLabel('Silk strands', { exact: true }).check();
  await page.getByLabel('Strands', { exact: true }).fill('8');
  await page.getByLabel('Twists', { exact: true }).fill('0');
  await page.getByLabel('Wobble', { exact: true }).fill('0');
  await page.getByLabel('Strand opacity jitter', { exact: true }).fill('0');
  await expect(page.getByLabel('Strand thickness', { exact: true })).toHaveValue('2');
  await expect(page.getByLabel('Ribbon width', { exact: true })).toHaveCount(0);
  const points: [number, number][] = Array.from({ length: 17 }, (_, i) => [40 + i * 20, 150]);
  await canvas(page).scrollIntoViewIfNeeded();
  const first = await at(page, ...points[0]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const point of points.slice(1)) {
    const next = await at(page, ...point);
    await page.mouse.move(next.x, next.y, { steps: 2 });
  }
  await page.mouse.up();
  await expect(footer(page)).toContainText(/Silk strands painted \(\d+ strands\)/, { timeout: 15000 });
  // Size 80 spreads fine 2 px strands across an 80 px ribbon, not solid blobs.
  const runs = await strandRuns(page, 200);
  expect(runs.length).toBeGreaterThanOrEqual(4);
  for (const run of runs) expect(run.end - run.start).toBeLessThanOrEqual(6);
  expect(Math.max(...runs.map((run) => run.end)) - Math.min(...runs.map((run) => run.start))).toBeLessThanOrEqual(84);

  await page.getByLabel('Strand thickness', { exact: true }).fill('4.5');
  const saved = await project(page);
  expect(saved.settings.brushStrands).toMatchObject({ enabled: true, thickness: 4.5 });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Brush');
  await expect(page.getByLabel('Strand thickness', { exact: true })).toHaveValue('4.5');
});
