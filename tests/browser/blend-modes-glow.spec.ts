import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { blendRgb, type LayerBlendMode } from '../../src/blendModes.ts';

type Layer = { name: string; blend: string; styles?: Record<string, Record<string, unknown>> };
type Project = { history: Array<{ layers: Layer[] }>; index: number };

const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await saved(page);
});

const drawShape = async (page: Page, x: number, y: number, width: number, height: number, color: string) => {
  await selectTool(page, 'Shape');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * (x + width), box.y + box.height * (y + height), { steps: 4 });
  await page.mouse.up();
  await page.getByLabel('Filled shape', { exact: true }).check();
  await page.getByLabel('Shape color', { exact: true }).fill(color);
};

/** Sample document pixels at fractional positions once rendering settles. */
const samples = async (page: Page, points: Array<[number, number]>) => {
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  return page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement, list) => {
    const context = canvas.getContext('2d')!;
    return list.map(([x, y]) =>
      Array.from(context.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data),
    );
  }, points);
};

/** Download the PNG export and sample the same document pixels from the file. */
const exportedSamples = async (page: Page, points: Array<[number, number]>) => {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Export format', { exact: true }).selectOption('png');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download image', exact: true }).click();
  const bytes = await readFile((await (await pending).path())!);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  return page.evaluate(async ({ base64, list }) => {
    const binary = atob(base64), data = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) data[i] = binary.charCodeAt(i);
    const bitmap = await createImageBitmap(new Blob([data], { type: 'image/png' }), {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    return list.map(([x, y]) =>
      Array.from(context.getImageData(Math.floor(bitmap.width * x), Math.floor(bitmap.height * y), 1, 1).data),
    );
  }, { base64: bytes.toString('base64'), list: points });
};

const project = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const path = (await (await pending).path())!;
  return { path, value: (await downloadedProject(path)) as Project };
};

const hex = (value: string) => [1, 3, 5].map((i) => Number.parseInt(value.slice(i, i + 2), 16) / 255);

const expectedOpaque = (mode: LayerBlendMode, backdrop: string, source: string) => {
  const out: [number, number, number] = [0, 0, 0];
  blendRgb(mode, ...(hex(backdrop) as [number, number, number]), ...(hex(source) as [number, number, number]), out);
  return [...out.map((value) => Math.round(value * 255)), 255];
};

const near = (actual: number[], expected: number[], tolerance: number) =>
  actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);

const NEW_MODES: LayerBlendMode[] = [
  'color-burn', 'linear-burn', 'darker-color', 'color-dodge', 'linear-dodge', 'lighter-color',
  'soft-light', 'hard-light', 'vivid-light', 'linear-light', 'pin-light', 'hard-mix',
  'exclusion', 'subtract', 'divide', 'hue', 'saturation', 'color', 'luminosity',
];

test('new layer blend modes match the reference formulas, export identically and persist', async ({ page }) => {
  test.setTimeout(180_000);
  const backdrop = '#3366cc', source = '#cc8833';
  const overlap: [number, number] = [0.52, 0.52];
  await drawShape(page, 0.22, 0.22, 0.52, 0.52, backdrop);
  await drawShape(page, 0.38, 0.38, 0.52, 0.52, source);
  const blend = page.getByLabel('Blend mode', { exact: true });
  await expect(blend).toHaveValue('source-over');
  // The compact menu groups modes and names them like common editors.
  await expect(blend.locator('optgroup')).toHaveCount(5);
  await expect(blend.locator('option[value="linear-dodge"]')).toHaveText('Linear Dodge (Add)');

  for (const mode of NEW_MODES) {
    await blend.selectOption(mode);
    const expected = expectedOpaque(mode, backdrop, source);
    // Canvas-native and software modes share one reference within rounding.
    await expect
      .poll(async () => near((await samples(page, [overlap]))[0], expected, 3), { message: mode })
      .toBe(true);
  }

  await blend.selectOption('vivid-light');
  const canvasVivid = await samples(page, [overlap, [0.3, 0.3], [0.8, 0.8]]);
  expect(await exportedSamples(page, [overlap, [0.3, 0.3], [0.8, 0.8]])).toEqual(canvasVivid);
  await blend.selectOption('color-dodge');
  const canvasDodge = await samples(page, [overlap]);
  expect(await exportedSamples(page, [overlap])).toEqual(canvasDodge);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(blend).toHaveValue('vivid-light');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await expect(blend).toHaveValue('color-dodge');

  await blend.selectOption('linear-light');
  const linearLight = await samples(page, [overlap]);
  await saved(page);
  const exported = await project(page);
  expect(exported.value.history[exported.value.index].layers.at(-1)!.blend).toBe('linear-light');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Blend mode', { exact: true })).toHaveValue('linear-light');
  await expect.poll(async () => (await samples(page, [overlap]))[0]).toEqual(linearLight[0]);
  await page.getByTestId('project-input').setInputFiles(exported.path);
  await saved(page);
  await expect(page.getByLabel('Blend mode', { exact: true })).toHaveValue('linear-light');
  await expect.poll(async () => (await samples(page, [overlap]))[0]).toEqual(linearLight[0]);
});

test('folders accept software blend modes over lower layers', async ({ page }) => {
  const backdrop = '#3366cc', source = '#cc8833';
  await drawShape(page, 0.22, 0.22, 0.52, 0.52, backdrop);
  await drawShape(page, 0.38, 0.38, 0.52, 0.52, source);
  await page.getByRole('button', { name: 'Group active layer', exact: true }).click();
  await page.getByLabel('Group blend mode Group 1', { exact: true }).selectOption('linear-burn');
  const expected = expectedOpaque('linear-burn', backdrop, source);
  await expect.poll(async () => near((await samples(page, [[0.52, 0.52]]))[0], expected, 3)).toBe(true);
});

test('Outer and Inner Glow render a falloff, export identically and survive undo, reload and project round trip', async ({ page }) => {
  test.setTimeout(180_000);
  // Shape spans x 0.3..0.5 and y 0.3..0.6 of the document.
  await drawShape(page, 0.3, 0.3, 0.2, 0.3, '#2040a0');
  const row = 0.45;
  const outside: Array<[number, number]> = [0.505, 0.512, 0.52, 0.53, 0.545, 0.6].map((x) => [x, row]);
  const before = await samples(page, outside);

  await page.getByLabel('Enable outer glow', { exact: true }).check();
  await page.getByLabel('Outer glow color', { exact: true }).fill('#ff0000');
  await page.getByLabel('Outer glow blend mode', { exact: true }).selectOption('source-over');
  await page.getByLabel('Outer glow opacity', { exact: true }).fill('100');
  await page.getByLabel('Outer glow size', { exact: true }).fill('48');
  await expect(page.getByLabel('Outer glow size', { exact: true })).toHaveAttribute('max', '250');
  const glow = await samples(page, outside);
  expect(glow).not.toEqual(before);
  // A Normal red glow over the photo background: recover the glow coverage
  // from the red channel (out = a * 255 + (1 - a) * backdrop). Coverage falls
  // off with distance from the edge and pixels beyond the extent are untouched.
  const coverage = (pixels: number[][]) =>
    pixels.map((value, index) => (value[0] - before[index][0]) / Math.max(1, 255 - before[index][0]));
  const falloff = coverage(glow);
  // Allow one rounding step on the near-edge plateau of the box passes.
  for (let i = 1; i < falloff.length; i += 1) expect(falloff[i]).toBeLessThanOrEqual(falloff[i - 1] + 0.02);
  expect(falloff[0]).toBeGreaterThan(0.2);
  expect(falloff[0]).toBeGreaterThan(falloff[2] + 0.1);
  expect(glow.at(-1)).toEqual(before.at(-1));

  await page.getByLabel('Outer glow spread', { exact: true }).fill('60');
  const spread = coverage(await samples(page, outside));
  expect(spread[0]).toBeGreaterThan(falloff[0] + 0.1);
  expect(spread[1]).toBeGreaterThan(falloff[1]);

  const inside: Array<[number, number]> = [[0.302, row], [0.4, row]];
  const insideBefore = await samples(page, inside);
  await page.getByLabel('Enable inner glow', { exact: true }).check();
  await page.getByLabel('Inner glow color', { exact: true }).fill('#ffff00');
  await page.getByLabel('Inner glow size', { exact: true }).fill('30');
  const insideGlow = await samples(page, inside);
  expect(insideGlow[0]).not.toEqual(insideBefore[0]);
  expect(insideGlow[0][0]).toBeGreaterThan(insideBefore[0][0]);
  expect(insideGlow[1]).toEqual(insideBefore[1]);

  // Drop shadow blur now scales to large documents.
  await expect(page.getByLabel('Drop shadow blur', { exact: true })).toHaveAttribute('max', '250');
  await expect(page.getByLabel('Inner shadow distance', { exact: true })).toHaveAttribute('max', '250');

  const points = [...outside, ...inside];
  const canvasPixels = await samples(page, points);
  expect(await exportedSamples(page, points)).toEqual(canvasPixels);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByLabel('Inner glow size', { exact: true })).toHaveValue('16');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await expect(page.getByLabel('Inner glow size', { exact: true })).toHaveValue('30');

  await saved(page);
  const exported = await project(page);
  expect(exported.value.history[exported.value.index].layers.at(-1)!.styles).toMatchObject({
    outerGlow: { enabled: true, color: '#ff0000', opacity: 1, size: 48, spread: 60, blend: 'source-over' },
    innerGlow: { enabled: true, color: '#ffff00', size: 30, choke: 0, source: 'edge', blend: 'screen' },
  });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Enable outer glow', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Outer glow size', { exact: true })).toHaveValue('48');
  await expect.poll(() => samples(page, points)).toEqual(canvasPixels);
  await page.getByTestId('project-input').setInputFiles(exported.path);
  await saved(page);
  await expect(page.getByLabel('Inner glow size', { exact: true })).toHaveValue('30');
  await expect.poll(() => samples(page, points)).toEqual(canvasPixels);

  await page.getByLabel('Lock layer', { exact: true }).check();
  await expect(page.getByLabel('Enable outer glow', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Outer glow size', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Inner glow blend mode', { exact: true })).toBeDisabled();
});
