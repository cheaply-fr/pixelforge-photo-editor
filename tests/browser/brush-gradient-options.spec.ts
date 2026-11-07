import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';

// Sparse spacing, Count/Scatter, pen lift and Gradient Mode/Opacity on a
// small 400×200 document, read back from the composited editor canvas.

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const settled = (page: Page) => expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');

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

/** Client coordinates of a document pixel. */
async function at(page: Page, x: number, y: number) {
  return canvas(page).evaluate((element: HTMLCanvasElement, point) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + (point.x / element.width) * rect.width, y: rect.top + (point.y / element.height) * rect.height };
  }, { x, y });
}

/** Composited RGBA for a rectangle of document pixels. */
const area = (page: Page, x: number, y: number, width: number, height: number) =>
  canvas(page).evaluate((element: HTMLCanvasElement, rect) =>
    Array.from(element.getContext('2d')!.getImageData(rect.x, rect.y, rect.width, rect.height).data),
  { x, y, width, height });

/** Dark (painted) pixels in a rectangle of a white document. */
async function darkPixels(page: Page, x: number, y: number, width: number, height: number) {
  const data = await area(page, x, y, width, height);
  const points: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < data.length; index += 4)
    if (data[index] < 128) points.push({ x: x + ((index / 4) % width), y: y + Math.floor(index / 4 / width) });
  return points;
}

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

async function penStroke(page: Page, pressure: number, from: [number, number], to: [number, number], id: number) {
  await canvas(page).scrollIntoViewIfNeeded();
  const a = await at(page, ...from), b = await at(page, ...to);
  // Synthetic pointers have no browser pointer stream for setPointerCapture.
  await canvas(page).evaluate((element) => { element.setPointerCapture = () => undefined; });
  const event = { pointerId: id, pointerType: 'pen', pressure, buttons: 1, isPrimary: true };
  await canvas(page).dispatchEvent('pointerdown', { ...event, clientX: a.x, clientY: a.y });
  await page.waitForTimeout(100);
  for (let step = 1; step <= 6; step += 1)
    await canvas(page).dispatchEvent('pointermove', {
      ...event, clientX: a.x + ((b.x - a.x) * step) / 6, clientY: a.y + ((b.y - a.y) * step) / 6,
    });
  await canvas(page).dispatchEvent('pointerup', { ...event, pressure: 0, buttons: 0, clientX: b.x, clientY: b.y });
  await settled(page);
}

async function brushSetup(page: Page, size: string) {
  await selectTool(page, 'Brush');
  await setColor(page, 'Drawing color', '#000000');
  await page.getByLabel('Size', { exact: true }).fill(size);
  await page.getByLabel('Size', { exact: true }).press('Enter');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
}

test('500% spacing paints separated dabs with clear pixel gaps', async ({ page }) => {
  await newDocument(page, 'white');
  await brushSetup(page, '10');
  await page.getByLabel('Spacing', { exact: true }).fill('500');
  await expect(page.getByLabel('Spacing', { exact: true })).toHaveValue('500');
  await mouseStroke(page, [50, 100], [350, 100]);
  const row = await area(page, 0, 100, 400, 1);
  const dark = Array.from({ length: 400 }, (_, x) => row[x * 4] < 128);
  const runs: Array<[number, number]> = [];
  dark.forEach((value, x) => {
    if (!value) return;
    const last = runs.at(-1);
    if (last && last[1] === x - 1) last[1] = x;
    else runs.push([x, x]);
  });
  // Dabs land every 50 px: about seven 10 px dabs separated by ~40 px gaps.
  expect(runs.length).toBeGreaterThanOrEqual(5);
  for (const [start, end] of runs) expect(end - start + 1).toBeLessThanOrEqual(13);
  for (let index = 1; index < runs.length; index += 1)
    expect(runs[index][0] - runs[index - 1][1]).toBeGreaterThan(30);
});

test('Count adds scattered dabs that stay within the scatter bounds', async ({ page }) => {
  await newDocument(page, 'white');
  await brushSetup(page, '6');
  await page.getByLabel('Spacing', { exact: true }).fill('1000');
  await page.getByLabel('Scatter', { exact: true }).fill('300');
  await mouseStroke(page, [60, 50], [340, 50]);
  const single = await darkPixels(page, 0, 0, 400, 100);
  await page.getByLabel('Count', { exact: true }).fill('4');
  await expect(page.getByLabel('Count', { exact: true })).toHaveValue('4');
  await mouseStroke(page, [60, 150], [340, 150]);
  const counted = await darkPixels(page, 0, 100, 400, 100);
  // Scatter 300% of 6 px moves a dab centre at most 13.5 px; plus its 3 px radius.
  const reach = 13.5 + 3 + 1.5;
  for (const point of single) expect(Math.abs(point.y - 50)).toBeLessThanOrEqual(reach);
  for (const point of counted) expect(Math.abs(point.y - 150)).toBeLessThanOrEqual(reach);
  expect(single.length).toBeGreaterThan(0);
  expect(counted.length).toBeGreaterThan(single.length * 2);
});

test('pen pressure 0 paints nothing with pressure mapping while pressure 1 paints', async ({ page }) => {
  await newDocument(page, 'white');
  await brushSetup(page, '20');
  await page.getByLabel('Pressure affects opacity', { exact: true }).check();
  await page.getByLabel('Pressure affects size', { exact: true }).check();
  await penStroke(page, 0, [60, 60], [340, 60], 41);
  await page.waitForTimeout(400);
  await settled(page);
  expect(await darkPixels(page, 0, 0, 400, 200)).toHaveLength(0);
  await penStroke(page, 1, [60, 140], [340, 140], 42);
  await expect(page.locator('footer')).toContainText('Paint layer updated', { timeout: 10000 });
  await settled(page);
  const painted = await darkPixels(page, 0, 0, 400, 200);
  expect(painted.length).toBeGreaterThan(1000);
  expect(painted.every((point) => Math.abs(point.y - 140) <= 11)).toBe(true);
});

async function gradientDrag(page: Page, from: [number, number], to: [number, number]) {
  await canvas(page).scrollIntoViewIfNeeded();
  const a = await at(page, ...from), b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('footer')).toContainText('Gradient applied');
  await settled(page);
}

const pixel = async (page: Page, x: number, y: number) => (await area(page, x, y, 1, 1)).slice(0, 3);

for (const mode of ['normal', 'replace'] as const)
  test(`a second gradient in ${mode} mode ${mode === 'normal' ? 'paints over' : 'replaces'} the painted layer`, async ({ page }) => {
    await newDocument(page, 'black');
    await selectTool(page, 'Gradient');
    await page.getByLabel('Gradient end', { exact: true }).selectOption('transparent');
    // First gradient: opaque red across the whole layer (red at both ends via a far drag).
    await setColor(page, 'Drawing color', '#ff0000');
    await gradientDrag(page, [0, 100], [399, 100]);
    expect((await pixel(page, 10, 100))[0]).toBeGreaterThan(230);
    // Second gradient: blue fading to transparent towards the left.
    await page.getByLabel('Gradient mode', { exact: true }).selectOption(mode);
    await setColor(page, 'Drawing color', '#0000ff');
    await gradientDrag(page, [399, 100], [200, 100]);
    const left = await pixel(page, 10, 100), right = await pixel(page, 395, 100);
    expect(right[2]).toBeGreaterThan(230);
    if (mode === 'normal') expect(left[0]).toBeGreaterThan(200);
    // Replace discards the red layer pixels, exposing the black background.
    else expect(Math.max(...left)).toBeLessThan(10);
  });

test('Screen mode at reduced opacity builds a glow over existing paint', async ({ page }) => {
  await newDocument(page, 'black');
  await selectTool(page, 'Gradient');
  await setColor(page, 'Drawing color', '#800000');
  await gradientDrag(page, [0, 100], [399, 100]);
  const before = await pixel(page, 20, 100);
  await page.getByLabel('Gradient mode', { exact: true }).selectOption('screen');
  await page.getByLabel('Gradient opacity', { exact: true }).fill('50');
  await setColor(page, 'Drawing color', '#0080ff');
  await gradientDrag(page, [0, 100], [399, 100]);
  const after = await pixel(page, 20, 100);
  // Screen never darkens: red is kept, blue and green brighten.
  expect(after[0]).toBeGreaterThanOrEqual(before[0] - 2);
  expect(after[2]).toBeGreaterThan(before[2] + 60);
  expect(after[2]).toBeLessThan(200);
});

test('brush dynamics and gradient mode persist across reload; older projects load defaults', async ({ page }) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await selectTool(page, 'Brush');
  await page.getByLabel('Spacing', { exact: true }).fill('600');
  await page.getByLabel('Scatter', { exact: true }).fill('900');
  await page.getByLabel('Scatter both axes', { exact: true }).uncheck();
  await page.getByLabel('Count', { exact: true }).fill('5');
  await page.getByLabel('Count jitter', { exact: true }).fill('40');
  await page.getByLabel('Size jitter', { exact: true }).fill('30');
  await page.getByLabel('Angle jitter', { exact: true }).fill('20');
  await page.getByLabel('Opacity jitter', { exact: true }).fill('10');
  await selectTool(page, 'Gradient');
  await page.getByLabel('Gradient mode', { exact: true }).selectOption('linear-dodge');
  await page.getByLabel('Gradient opacity', { exact: true }).fill('55');
  await saved(page);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!) as { settings: Record<string, unknown> };
  expect(project.settings).toMatchObject({
    spacing: 600,
    brushScatter: 900,
    brushDynamics: { scatterBothAxes: false, count: 5, countJitter: 40, sizeJitter: 30, angleJitter: 20, opacityJitter: 10 },
    gradientBlend: 'linear-dodge',
    gradientOpacity: 55,
  });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Gradient mode', { exact: true })).toHaveValue('linear-dodge');
  await expect(page.getByLabel('Gradient opacity', { exact: true })).toHaveValue('55');
  await selectTool(page, 'Brush');
  await expect(page.getByLabel('Spacing', { exact: true })).toHaveValue('600');
  await expect(page.getByLabel('Scatter', { exact: true })).toHaveValue('900');
  await expect(page.getByLabel('Scatter both axes', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Count', { exact: true })).toHaveValue('5');
  await expect(page.getByLabel('Count jitter', { exact: true })).toHaveValue('40');
  await expect(page.getByLabel('Size jitter', { exact: true })).toHaveValue('30');
  await expect(page.getByLabel('Angle jitter', { exact: true })).toHaveValue('20');
  await expect(page.getByLabel('Opacity jitter', { exact: true })).toHaveValue('10');

  // A project saved before these options existed omits them and loads defaults.
  const legacy = JSON.parse(JSON.stringify(project)) as typeof project;
  delete legacy.settings.brushDynamics;
  delete legacy.settings.gradientBlend;
  delete legacy.settings.gradientOpacity;
  legacy.settings.spacing = 25;
  legacy.settings.brushScatter = 0;
  await page.getByTestId('project-input').setInputFiles({
    name: 'legacy-brush.pixelforge', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect(page.locator('footer')).toContainText('Project opened with editable layers and history');
  await selectTool(page, 'Brush');
  await expect(page.getByLabel('Count', { exact: true })).toHaveValue('1');
  await expect(page.getByLabel('Scatter both axes', { exact: true })).toBeChecked();
  await selectTool(page, 'Gradient');
  await expect(page.getByLabel('Gradient mode', { exact: true })).toHaveValue('normal');
  await expect(page.getByLabel('Gradient opacity', { exact: true })).toHaveValue('100');

  // Out-of-range values are rejected rather than clamped silently.
  const invalid = JSON.parse(JSON.stringify(legacy)) as typeof project;
  invalid.settings.spacing = 1001;
  await page.getByTestId('project-input').setInputFiles({
    name: 'invalid-brush.pixelforge', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await expect(page.locator('footer')).toContainText('Saved document is not supported');
});
