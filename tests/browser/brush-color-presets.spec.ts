import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';

// Colour dynamics and the brush preset library on a small 400×200 document,
// read back from the composited editor canvas (desktop and mobile projects).

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const settled = (page: Page) => expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
const librarySelect = (page: Page) => page.getByLabel('Saved brush preset', { exact: true });

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

async function newDocument(page: Page, background: 'white' | 'black') {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('New document width (px)').fill('400');
  await dialog.getByLabel('New document height (px)').fill('200');
  await dialog.getByLabel('Background contents').selectOption(background);
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(canvas(page)).toHaveJSProperty('width', 400);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
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

const area = (page: Page, x: number, y: number, width: number, height: number) =>
  canvas(page).evaluate((element: HTMLCanvasElement, rect) =>
    Array.from(element.getContext('2d')!.getImageData(rect.x, rect.y, rect.width, rect.height).data),
  { x, y, width, height });

async function mouseStroke(page: Page, from: [number, number], to: [number, number]) {
  await canvas(page).scrollIntoViewIfNeeded();
  const a = await at(page, ...from), b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('footer')).toContainText('Paint layer updated', { timeout: 10000 });
  await settled(page);
}

async function setSlider(page: Page, label: string, value: string) {
  const slider = page.getByLabel(label, { exact: true });
  await slider.fill(value);
  await expect(slider).toHaveValue(value);
}

/** Hue (0–360) of a saturated RGB pixel, or undefined for near-grey/white pixels. */
function saturatedHue(r: number, g: number, b: number): number | undefined {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  if (max < 80 || delta / max < 0.6) return undefined;
  let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

async function hueBuckets(page: Page, x: number, y: number, width: number, height: number) {
  const data = await area(page, x, y, width, height), buckets = new Set<number>();
  let saturated = 0;
  for (let index = 0; index < data.length; index += 4) {
    const hue = saturatedHue(data[index], data[index + 1], data[index + 2]);
    if (hue === undefined) continue;
    saturated += 1;
    buckets.add(Math.floor(hue / 30) % 12);
  }
  return { buckets, saturated };
}

test('Hue jitter paints varied colours while a plain stroke keeps the exact colour', async ({ page }) => {
  await newDocument(page, 'white');
  await selectTool(page, 'Brush');
  await setColor(page, 'Drawing color', '#ff0000');
  await page.getByLabel('Size', { exact: true }).fill('14');
  await page.getByLabel('Size', { exact: true }).press('Enter');
  await setSlider(page, 'Hardness', '100');
  await setSlider(page, 'Spacing', '150');
  // Colour dynamics sit next to the other jitter controls, at 0 by default.
  for (const label of ['Hue jitter', 'Saturation jitter', 'Brightness jitter', 'Foreground/background jitter'])
    await expect(page.getByLabel(label, { exact: true })).toHaveValue('0');
  await mouseStroke(page, [30, 50], [370, 50]);
  const plain = await hueBuckets(page, 0, 20, 400, 60);
  expect(plain.saturated).toBeGreaterThan(200);
  expect([...plain.buckets].every((bucket) => bucket === 0 || bucket === 11)).toBe(true);
  // The plain stroke's centre is exactly the foreground colour.
  const centre = await area(page, 200, 50, 1, 1);
  expect(centre.slice(0, 3)).toEqual([255, 0, 0]);

  await setSlider(page, 'Hue jitter', '100');
  await mouseStroke(page, [30, 150], [370, 150]);
  const jittered = await hueBuckets(page, 0, 120, 400, 60);
  expect(jittered.saturated).toBeGreaterThan(200);
  expect(jittered.buckets.size).toBeGreaterThanOrEqual(4);
  // The first stroke is untouched by later settings.
  expect(await hueBuckets(page, 0, 20, 400, 60)).toEqual(plain);
});

test('foreground/background jitter mixes towards the background colour', async ({ page }) => {
  await newDocument(page, 'white');
  await selectTool(page, 'Brush');
  await setColor(page, 'Drawing color', '#ff0000');
  await setColor(page, 'Background color', '#0000ff');
  await page.getByLabel('Size', { exact: true }).fill('14');
  await page.getByLabel('Size', { exact: true }).press('Enter');
  await setSlider(page, 'Hardness', '100');
  await setSlider(page, 'Spacing', '150');
  await setSlider(page, 'Foreground/background jitter', '100');
  await mouseStroke(page, [30, 100], [370, 100]);
  const { buckets } = await hueBuckets(page, 0, 80, 400, 40);
  // Red, purples and blue: a spread of hues between the two colours, never green.
  expect(buckets.size).toBeGreaterThanOrEqual(3);
  for (const bucket of buckets) expect(bucket === 0 || bucket >= 7).toBe(true);
});

test('save, apply, rename and delete a brush preset; it survives reload and exports with the project', async ({ page }) => {
  await selectTool(page, 'Brush');
  const select = librarySelect(page);
  await expect(page.getByRole('button', { name: 'Rename brush preset', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Delete brush preset', exact: true })).toBeDisabled();
  await setSlider(page, 'Hue jitter', '37');
  await setSlider(page, 'Brightness jitter', '21');
  await setSlider(page, 'Size jitter', '15');
  page.once('dialog', (dialog) => dialog.accept('Cosmic dust'));
  await page.getByRole('button', { name: 'Save brush preset', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Brush preset “Cosmic dust” saved on this device');
  await expect(select.locator('option:checked')).toHaveText('Cosmic dust');

  // Change the brush, then apply the preset again.
  await setSlider(page, 'Hue jitter', '0');
  await setSlider(page, 'Brightness jitter', '0');
  await select.selectOption({ label: 'Smoke wisp' });
  await expect(page.getByLabel('Hardness', { exact: true })).toHaveValue('0');
  await expect(page.getByRole('button', { name: 'Rename brush preset', exact: true })).toBeDisabled();
  await select.selectOption({ label: 'Cosmic dust' });
  await expect(page.getByLabel('Hue jitter', { exact: true })).toHaveValue('37');
  await expect(page.getByLabel('Brightness jitter', { exact: true })).toHaveValue('21');
  await expect(page.getByLabel('Size jitter', { exact: true })).toHaveValue('15');

  page.once('dialog', (dialog) => dialog.accept('Cosmic haze'));
  await page.getByRole('button', { name: 'Rename brush preset', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Brush preset renamed to “Cosmic haze”');
  await expect(select.locator('option:checked')).toHaveText('Cosmic haze');
  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('pixelforge.brush-presets.v1') ?? 'null'));
  expect(stored.version).toBe(1);
  expect(stored.presets.map((preset: { label: string }) => preset.label)).toEqual(['Cosmic haze']);
  expect(stored.presets[0].brushDynamics).toMatchObject({ hueJitter: 37, brightnessJitter: 21, sizeJitter: 15 });

  await saved(page);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  expect(project.settings.customBrushPresets?.map((preset: { label: string }) => preset.label)).toEqual(['Cosmic haze']);

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Brush');
  await expect(librarySelect(page).locator('option')).toContainText(['Star field', 'Soft glow', 'Dust / nebula', 'Smoke wisp', 'Cosmic haze']);
  await librarySelect(page).selectOption({ label: 'Cosmic haze' });
  await expect(page.getByLabel('Hue jitter', { exact: true })).toHaveValue('37');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete brush preset', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Brush preset “Cosmic haze” deleted from this device');
  await expect(librarySelect(page).locator('option', { hasText: 'Cosmic haze' })).toHaveCount(0);
  await saved(page);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Brush');
  await expect(librarySelect(page).locator('option', { hasText: 'Star field' })).toHaveCount(1);
  await expect(librarySelect(page).locator('option', { hasText: 'Cosmic haze' })).toHaveCount(0);
});

test('saved presets persist on this device for a new document, and corrupt storage is ignored', async ({ page }) => {
  await selectTool(page, 'Brush');
  await setSlider(page, 'Saturation jitter', '44');
  page.once('dialog', (dialog) => dialog.accept('Device brush'));
  await page.getByRole('button', { name: 'Save brush preset', exact: true }).click();
  await expect(page.locator('footer')).toContainText('saved on this device');
  // A brand-new document still offers the device library.
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Brush');
  await librarySelect(page).selectOption({ label: 'Device brush' });
  await expect(page.getByLabel('Saturation jitter', { exact: true })).toHaveValue('44');

  // Corrupt storage falls back to the built-ins without breaking the editor.
  await page.evaluate(() => window.localStorage.setItem('pixelforge.brush-presets.v1', '{not json'));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Brush');
  await expect(librarySelect(page).locator('option', { hasText: 'Star field' })).toHaveCount(1);
});

test('built-in Star field paints small scattered dots in varied brightness', async ({ page }) => {
  await newDocument(page, 'black');
  await selectTool(page, 'Brush');
  await setColor(page, 'Drawing color', '#ffffff');
  await librarySelect(page).selectOption({ label: 'Star field' });
  await expect(page.locator('footer')).toContainText('Brush preset “Star field” applied');
  await expect(page.getByLabel('Hardness', { exact: true })).toHaveValue('100');
  await expect(page.getByLabel('Scatter', { exact: true })).toHaveValue('1000');
  await expect(page.getByLabel('Count', { exact: true })).not.toHaveValue('1');
  await expect(page.getByLabel('Brightness jitter', { exact: true })).not.toHaveValue('0');
  await expect(page.getByLabel('Hue jitter', { exact: true })).not.toHaveValue('0');
  await mouseStroke(page, [40, 100], [360, 100]);
  const data = await area(page, 0, 0, 400, 200);
  const lit: Array<{ x: number; y: number; value: number }> = [];
  for (let index = 0; index < data.length; index += 4) {
    const value = Math.max(data[index], data[index + 1], data[index + 2]);
    if (value > 40) lit.push({ x: (index / 4) % 400, y: Math.floor(index / 4 / 400), value });
  }
  // Dots, not a line: a small share of pixels, many of them far from the stroke.
  expect(lit.length).toBeGreaterThan(20);
  expect(lit.length).toBeLessThan(400 * 200 * 0.05);
  expect(lit.filter((point) => Math.abs(point.y - 100) > 8).length).toBeGreaterThan(10);
  const row = Array.from({ length: 280 }, (_, x) => data[((100 * 400) + 60 + x) * 4]);
  expect(row.filter((value) => value > 40).length).toBeLessThan(140);
  // Brightness jitter: the dots' peak values vary.
  const peaks = new Set(lit.map((point) => Math.round(point.value / 16)));
  expect(peaks.size).toBeGreaterThanOrEqual(4);
});
