import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';
import { answerPrompt } from './prompt-dialog';

// Smudge Strength, Mode, Finger Painting, Sample All Layers, tip/dynamics
// controls and brush presets, on desktop and mobile.

type Asset = { url: string; w: number; h: number };
type Layer = { kind: string; name?: string; asset?: string; matrix?: number[] };
type Project = {
  settings: Record<string, unknown>;
  history: Array<{ layers: Layer[] }>;
  index: number;
  assets: Record<string, Asset>;
};

const settled = async (page: Page) => {
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
};

const openEditor = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
};

const project = async (page: Page): Promise<Project> => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as Project;
};

/** Opaque 200 x 60 image: red for x < 80, white elsewhere. */
const importRedWhite = async (page: Page) => {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 60;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 200, 60);
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 80, 60);
    return canvas.toDataURL().split(',')[1];
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'smudge-red-white.png',
    mimeType: 'image/png',
    buffer: Buffer.from(data, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '200');
  await settled(page);
};

/** Pixels of a layer asset at document points (the asset is placed by its matrix). */
const pixelsAt = async (page: Page, asset: Asset, matrix: number[] | undefined, points: Array<[number, number]>) =>
  page.evaluate(async ({ asset, matrix, points }) => {
    const image = new Image();
    image.src = asset.url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = asset.w;
    canvas.height = asset.h;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const offsetX = matrix?.[4] ?? 0, offsetY = matrix?.[5] ?? 0;
    return points.map(([x, y]) => {
      const px = Math.round(x - offsetX), py = Math.round(y - offsetY);
      if (px < 0 || py < 0 || px >= asset.w || py >= asset.h) return [0, 0, 0, 0];
      return Array.from(context.getImageData(px, py, 1, 1).data);
    });
  }, { asset, matrix, points });

const topLayer = (value: Project) => value.history[value.index].layers.at(-1)!;
const layerPixels = async (page: Page, value: Project, layer: Layer, points: Array<[number, number]>) =>
  pixelsAt(page, value.assets[layer.asset!]!, layer.matrix, points);

/** Drag across the canvas in document pixels (200 x 60 fixture). */
const stroke = async (page: Page, from: [number, number], to: [number, number], pointerType = 'mouse') => {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  const client = ([x, y]: [number, number]) => ({ clientX: box.x + (box.width * x) / 200, clientY: box.y + (box.height * y) / 60 });
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  const base = { pointerId: 211, pointerType, pressure: pointerType === 'mouse' ? 1 : 0.8, isPrimary: true };
  await canvas.dispatchEvent('pointerdown', { ...base, ...client(from), buttons: 1 });
  await page.waitForTimeout(90);
  for (let step = 1; step <= 4; step += 1) {
    const t = step / 4;
    await canvas.dispatchEvent('pointermove', {
      ...base, ...client([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]), buttons: 1,
    });
  }
  await canvas.dispatchEvent('pointerup', { ...base, ...client(to), buttons: 0 });
  await settled(page);
};

const redness = (pixel: number[]) => 255 - pixel[1];

test.beforeEach(async ({ page }) => openEditor(page));

test('Smudge options are labelled, keyboard reachable and persist', async ({ page }) => {
  await importRedWhite(page);
  await selectTool(page, 'Smudge');
  const options = page.getByTestId('smudge-options');
  await expect(options).toBeVisible();
  for (const label of ['Strength', 'Angle', 'Roundness', 'Scatter', 'Count', 'Count jitter', 'Size jitter', 'Angle jitter', 'Strength jitter', 'Bristle', 'Texture'])
    await expect(options.getByLabel(label, { exact: true })).toBeVisible();
  for (const label of ['Sample all layers', 'Finger painting', 'Pressure affects size', 'Pressure affects strength', 'Scatter both axes'])
    await expect(options.getByRole('checkbox', { name: label, exact: true })).toBeVisible();
  await expect(options.getByRole('checkbox', { name: 'Ignore adjustment layers', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Strength', { exact: true })).toHaveValue('50');
  await expect(page.getByRole('combobox', { name: 'Smudge mode' })).toHaveValue('normal');
  await expect(page.getByRole('combobox', { name: 'Saved brush preset' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Paint symmetry' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Smudge mode' }).locator('option')).toHaveText(
    ['Normal', 'Darken', 'Lighten', 'Hue', 'Saturation', 'Color', 'Luminosity'],
  );

  // Keyboard: arrow keys step Strength; [ and ] step the brush size.
  await page.getByLabel('Strength', { exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('Strength', { exact: true })).toHaveValue('51');
  await page.getByRole('checkbox', { name: 'Finger painting', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('checkbox', { name: 'Finger painting', exact: true })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Sample all layers', exact: true }).check();
  await expect(page.getByRole('checkbox', { name: 'Ignore adjustment layers', exact: true })).toBeEnabled();
  await page.getByRole('combobox', { name: 'Smudge mode' }).selectOption('luminosity');
  await page.getByLabel('Size', { exact: true }).fill('40');
  // Shortcuts are ignored while a text field has focus.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press(']');
  const grown = Number(await page.getByLabel('Size', { exact: true }).inputValue());
  expect(grown).toBeGreaterThan(40);
  await page.keyboard.press('[');
  await expect(page.getByLabel('Size', { exact: true })).toHaveValue('40');

  await settled(page);
  const saved = await project(page);
  expect(saved.settings.smudge).toEqual({
    strength: 51, mode: 'luminosity', fingerPainting: true, sampleAllLayers: true, ignoreAdjustments: false, pressureStrength: false,
  });
  await page.reload();
  await selectTool(page, 'Smudge');
  await expect(page.getByLabel('Strength', { exact: true })).toHaveValue('51');
  await expect(page.getByRole('combobox', { name: 'Smudge mode' })).toHaveValue('luminosity');
  await expect(page.getByRole('checkbox', { name: 'Finger painting', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Sample all layers', exact: true })).toBeChecked();
});

test('red dragged into white travels further at Strength 75 than at 50, with undo and redo', async ({ page }) => {
  await importRedWhite(page);
  const before = await project(page);
  await selectTool(page, 'Smudge');
  await page.getByLabel('Size', { exact: true }).fill('16');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Strength', { exact: true }).fill('50');
  await stroke(page, [60, 15], [180, 15]);
  await page.getByLabel('Strength', { exact: true }).fill('75');
  await stroke(page, [60, 45], [180, 45]);
  const after = await project(page);
  expect(after.index).toBe(before.index + 2);
  const xs = [90, 110, 130];
  const [fifty, seventyFive] = await Promise.all([
    layerPixels(page, after, topLayer(after), xs.map((x) => [x, 15])),
    layerPixels(page, after, topLayer(after), xs.map((x) => [x, 45])),
  ]);
  // Both strokes pull red into the white, and the colour fades with distance.
  expect(redness(fifty[0])).toBeGreaterThan(60);
  expect(redness(fifty[0])).toBeGreaterThanOrEqual(redness(fifty[2]));
  // Strength 75 drags the red further than Strength 50.
  for (let index = 0; index < xs.length; index += 1)
    expect(redness(seventyFive[index])).toBeGreaterThanOrEqual(redness(fifty[index]));
  expect(redness(seventyFive[1])).toBeGreaterThan(redness(fifty[1]) + 40);
  // Away from the strokes the image is untouched.
  expect((await layerPixels(page, after, topLayer(after), [[150, 30]]))[0]).toEqual([255, 255, 255, 255]);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await settled(page);
  const undone = await project(page);
  expect(undone.index).toBe(after.index - 1);
  expect(redness((await layerPixels(page, undone, topLayer(undone), [[110, 45]]))[0])).toBe(0);
  expect((await layerPixels(page, undone, topLayer(undone), [[110, 15]]))[0]).toEqual(fifty[1]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await settled(page);
  const redone = await project(page);
  expect((await layerPixels(page, redone, topLayer(redone), [[110, 45]]))[0]).toEqual(seventyFive[1]);
});

test('Finger Painting starts with the foreground colour and modes gate the result', async ({ page }) => {
  await importRedWhite(page);
  await selectTool(page, 'Smudge');
  await page.getByLabel('Size', { exact: true }).fill('14');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Strength', { exact: true }).fill('60');
  // Darken: dragging white into red cannot darken anything.
  await page.getByRole('combobox', { name: 'Smudge mode' }).selectOption('darken');
  const before = await project(page);
  await stroke(page, [150, 30], [40, 30]);
  await expect(page.locator('footer')).toContainText('No Smudge change applied');
  expect((await project(page)).history.length).toBe(before.history.length);
  // Lighten: the same stroke lightens the red.
  await page.getByRole('combobox', { name: 'Smudge mode' }).selectOption('lighten');
  await stroke(page, [150, 30], [40, 30]);
  await expect(page.locator('footer')).toContainText('Smudge stroke applied');
  const lightened = await project(page);
  expect((await layerPixels(page, lightened, topLayer(lightened), [[70, 30]]))[0][1]).toBeGreaterThan(40);

  // Finger Painting deposits the (default #ff5c35) foreground at the start of a stroke on white.
  await page.getByRole('combobox', { name: 'Smudge mode' }).selectOption('normal');
  await page.getByRole('checkbox', { name: 'Finger painting', exact: true }).check();
  await stroke(page, [120, 10], [190, 10]);
  const painted = await project(page);
  const [start, end] = await layerPixels(page, painted, topLayer(painted), [[122, 10], [188, 10]]);
  expect(start[2]).toBeLessThan(180);
  expect(start[0]).toBeGreaterThan(240);
  expect(end[2]).toBeGreaterThan(start[2]);
});

test('Sample All Layers smudges the visible image onto a new empty layer', async ({ page }) => {
  await importRedWhite(page);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await selectTool(page, 'Smudge');
  await page.getByLabel('Size', { exact: true }).fill('16');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Strength', { exact: true }).fill('70');
  // Without sampling all layers the empty layer has nothing to smudge.
  const before = await project(page);
  await stroke(page, [60, 30], [160, 30]);
  await expect(page.locator('footer')).toContainText('No Smudge change applied');
  expect((await project(page)).history.length).toBe(before.history.length);

  await page.getByRole('checkbox', { name: 'Sample all layers', exact: true }).check();
  await stroke(page, [60, 30], [160, 30]);
  await expect(page.locator('footer')).toContainText('Smudge stroke applied');
  const after = await project(page);
  const layers = after.history[after.index].layers;
  expect(layers.length).toBe(2);
  const top = layers.at(-1)!, background = layers[0];
  const [onTop] = await layerPixels(page, after, top, [[95, 30]]);
  expect(onTop[3]).toBeGreaterThan(0);
  expect(onTop[0]).toBe(255);
  expect(onTop[1]).toBeLessThan(120);
  expect((await layerPixels(page, after, top, [[100, 5]]))[0][3]).toBe(0);
  // The background layer is untouched.
  expect((await layerPixels(page, after, background, [[95, 30]]))[0]).toEqual([255, 255, 255, 255]);
});

test('Smudge settings are saved in and applied from the brush preset library', async ({ page }) => {
  await importRedWhite(page);
  await selectTool(page, 'Smudge');
  await page.getByLabel('Strength', { exact: true }).fill('82');
  await page.getByRole('combobox', { name: 'Smudge mode' }).selectOption('color');
  await page.getByRole('checkbox', { name: 'Finger painting', exact: true }).check();
  await page.getByLabel('Roundness', { exact: true }).fill('35');
  await page.getByRole('button', { name: 'Save brush preset', exact: true }).click();
  await answerPrompt(page, 'Name this brush preset', { 'Preset name': 'Smear' });
  await expect(page.locator('footer')).toContainText('Brush preset “Smear” saved on this device');
  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('pixelforge.brush-presets.v1') ?? 'null'));
  expect(stored.presets.find((preset: { label: string }) => preset.label === 'Smear').smudge).toMatchObject({
    strength: 82, mode: 'color', fingerPainting: true,
  });

  await page.getByLabel('Strength', { exact: true }).fill('20');
  await page.getByRole('combobox', { name: 'Smudge mode' }).selectOption('normal');
  await page.getByRole('checkbox', { name: 'Finger painting', exact: true }).uncheck();
  await page.getByLabel('Roundness', { exact: true }).fill('100');
  const library = page.getByRole('combobox', { name: 'Saved brush preset' });
  // A built-in preset sets the shared tip but leaves Smudge options alone.
  await library.selectOption({ label: 'Soft glow' });
  await expect(page.getByLabel('Strength', { exact: true })).toHaveValue('20');
  await library.selectOption({ label: 'Smear' });
  await expect(page.getByLabel('Strength', { exact: true })).toHaveValue('82');
  await expect(page.getByRole('combobox', { name: 'Smudge mode' })).toHaveValue('color');
  await expect(page.getByRole('checkbox', { name: 'Finger painting', exact: true })).toBeChecked();
  await expect(page.getByLabel('Roundness', { exact: true })).toHaveValue('35');
});
