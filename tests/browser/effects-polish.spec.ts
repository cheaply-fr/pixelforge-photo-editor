import { readFile, writeFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { writePortableBundle } from '../../src/portableBundle';

type Styles = Record<string, Record<string, unknown>>;
type Layer = { name: string; blend: string; styles?: Styles; smartFilters?: Array<Record<string, unknown>>; adjustments: { filterEffects?: Record<string, unknown> } };
type Project = { history: Array<{ layers: Layer[] }>; index: number };

const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');

const settled = (page: Page) =>
  expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });

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
  await settled(page);
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

const undo = async (page: Page) => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
};
const redo = async (page: Page) => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
};

/**
 * W3C source-over with a separable blend: the effect colour `c` at coverage
 * `a` over an opaque backdrop `b` (all 0..1).
 */
const screenOver = (b: number, c: number, a: number) => (1 - a) * b + a * (1 - (1 - b) * (1 - c));

test('Screen Outer Glow and Drop Shadow blend with the layers beneath, export identically and persist', async ({ page }) => {
  test.setTimeout(240_000);
  // A dark backdrop on the left and a bright one on the right, then a shape
  // straddling both. Its outer effects fall on both backdrops.
  await drawShape(page, 0.04, 0.05, 0.46, 0.9, '#101828');
  await drawShape(page, 0.5, 0.05, 0.46, 0.9, '#f8f8f8');
  await drawShape(page, 0.35, 0.35, 0.3, 0.3, '#2040a0');
  const dark: [number, number] = [0.343, 0.5], bright: [number, number] = [0.657, 0.5];
  const before = await samples(page, [dark, bright]);

  await page.getByLabel('Enable outer glow', { exact: true }).check();
  await expect(page.getByLabel('Outer glow blend mode', { exact: true })).toHaveValue('screen');
  await page.getByLabel('Outer glow color', { exact: true }).fill('#ff8000');
  await page.getByLabel('Outer glow opacity', { exact: true }).fill('100');
  await page.getByLabel('Outer glow size', { exact: true }).fill('48');
  const [screenDark, screenBright] = await samples(page, [dark, bright]);
  // Over the dark backdrop Screen brightens: recover the glow coverage from
  // the red channel (glow red = 1) and predict green and blue from it.
  const b = before[0].map((value) => value / 255);
  const coverage = (screenDark[0] / 255 - b[0]) / (1 - b[0]);
  expect(coverage).toBeGreaterThan(0.15);
  expect(Math.abs(screenDark[1] - 255 * screenOver(b[1], 0x80 / 255, coverage))).toBeLessThanOrEqual(4);
  expect(Math.abs(screenDark[2] - 255 * screenOver(b[2], 0, coverage))).toBeLessThanOrEqual(4);
  // Over the bright backdrop Screen can only brighten: green and blue stay
  // near white. Before this change the glow reduced to Normal over the
  // layer's transparent area and tinted the bright backdrop orange.
  for (let channel = 0; channel < 3; channel += 1)
    expect(screenBright[channel]).toBeGreaterThanOrEqual(before[1][channel] - 1);

  // Multiply darkens instead: the bright side turns orange, the dark side cannot lighten.
  await page.getByLabel('Outer glow blend mode', { exact: true }).selectOption('multiply');
  const [multiplyDark, multiplyBright] = await samples(page, [dark, bright]);
  expect(multiplyBright[2]).toBeLessThan(before[1][2] - 40);
  for (let channel = 0; channel < 3; channel += 1)
    expect(multiplyDark[channel]).toBeLessThanOrEqual(before[0][channel] + 1);

  // Undo restores Screen pixels; the PNG export matches the canvas.
  await undo(page);
  await expect(page.getByLabel('Outer glow blend mode', { exact: true })).toHaveValue('screen');
  await expect.poll(() => samples(page, [dark, bright])).toEqual([screenDark, screenBright]);
  expect(await exportedSamples(page, [dark, bright])).toEqual([screenDark, screenBright]);

  // Drop Shadow gains its own mode with the same backdrop semantics.
  await page.getByLabel('Enable outer glow', { exact: true }).uncheck();
  await expect.poll(() => samples(page, [dark, bright])).toEqual(before);
  await expect(page.getByLabel('Drop shadow blend mode', { exact: true })).toHaveValue('source-over');
  await page.getByLabel('Enable drop shadow', { exact: true }).check();
  await page.getByLabel('Drop shadow color', { exact: true }).fill('#ff0000');
  await page.getByLabel('Drop shadow opacity', { exact: true }).fill('100');
  await page.getByLabel('Shadow X', { exact: true }).fill('0');
  await page.getByLabel('Shadow X', { exact: true }).press('Enter');
  await page.getByLabel('Shadow Y', { exact: true }).fill('0');
  await page.getByLabel('Shadow Y', { exact: true }).press('Enter');
  await page.getByLabel('Drop shadow blur', { exact: true }).fill('40');
  const [normalShadowDark, normalShadowBright] = await samples(page, [dark, bright]);
  expect(normalShadowBright[1]).toBeLessThan(before[1][1] - 20);
  await page.getByLabel('Drop shadow blend mode', { exact: true }).selectOption('screen');
  const [screenShadowDark, screenShadowBright] = await samples(page, [dark, bright]);
  expect(screenShadowDark[0]).toBeGreaterThan(before[0][0] + 20);
  expect(Math.abs(screenShadowDark[0] - normalShadowDark[0])).toBeLessThanOrEqual(3);
  for (let channel = 0; channel < 3; channel += 1)
    expect(screenShadowBright[channel]).toBeGreaterThanOrEqual(before[1][channel] - 1);
  expect(normalShadowBright).not.toEqual(screenShadowBright);

  await saved(page);
  const exported = await project(page);
  expect(exported.value.history[exported.value.index].layers.at(-1)!.styles!.dropShadow).toMatchObject({
    enabled: true, color: '#ff0000', blend: 'screen', falloff: 'gaussian',
  });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Drop shadow blend mode', { exact: true })).toHaveValue('screen');
  await expect.poll(() => samples(page, [dark, bright])).toEqual([screenShadowDark, screenShadowBright]);
  expect(await exportedSamples(page, [dark, bright])).toEqual([screenShadowDark, screenShadowBright]);
});

/** Shadow coverage along one document row, starting at the shape's right edge. */
const shadowProfile = (page: Page, row: number, from: number, length: number) =>
  page.getByTestId('editor-canvas').evaluate(
    (canvas: HTMLCanvasElement, { row, from, length }) => {
      const context = canvas.getContext('2d')!;
      const y = Math.floor(canvas.height * row);
      const data = context.getImageData(0, y, canvas.width, 1).data;
      // The shape is #2040a0; find its last pixel on this row.
      let edge = Math.floor(canvas.width * from);
      while (edge < canvas.width && !(data[edge * 4] < 60 && data[edge * 4 + 2] > 120)) edge -= 1;
      while (edge + 1 < canvas.width && data[(edge + 1) * 4] < 60 && data[(edge + 1) * 4 + 2] > 120) edge += 1;
      // White backdrop, black shadow: coverage = 1 - red / 255.
      return Array.from({ length }, (_, step) => 1 - data[(edge + 2 + step) * 4] / 255);
    },
    { row, from, length },
  );

test('Gaussian shadow falloff is the default for new layers; legacy shadows keep the linear falloff', async ({ page }) => {
  test.setTimeout(180_000);
  await drawShape(page, 0.02, 0.02, 0.96, 0.96, '#ffffff');
  // Shape spans x 0.3..0.5 and y 0.3..0.6.
  await drawShape(page, 0.3, 0.3, 0.2, 0.3, '#2040a0');
  const blur = 60, row = 0.45;
  await expect(page.getByLabel('Drop shadow falloff', { exact: true })).toHaveValue('gaussian');
  await expect(page.getByLabel('Inner shadow falloff', { exact: true })).toHaveValue('gaussian');
  await page.getByLabel('Enable drop shadow', { exact: true }).check();
  await page.getByLabel('Drop shadow opacity', { exact: true }).fill('100');
  await page.getByLabel('Shadow X', { exact: true }).fill('0');
  await page.getByLabel('Shadow X', { exact: true }).press('Enter');
  await page.getByLabel('Shadow Y', { exact: true }).fill('0');
  await page.getByLabel('Shadow Y', { exact: true }).press('Enter');
  await page.getByLabel('Drop shadow blur', { exact: true }).fill(String(blur));
  await settled(page);
  const gaussian = await shadowProfile(page, row, 0.5, blur + 4);

  await page.getByLabel('Drop shadow falloff', { exact: true }).selectOption('box');
  await settled(page);
  const linear = await shadowProfile(page, row, 0.5, blur + 4);
  // The legacy ramp falls by a near-constant step; the Gaussian is steep at
  // the edge, darker-free mid-way out and flat in its tail. Both end at the
  // same visible extent.
  const mid = Math.floor(blur / 2);
  expect(linear[mid]).toBeGreaterThan(0.18);
  expect(gaussian[mid]).toBeLessThan(linear[mid] - 0.1);
  expect(gaussian[2]).toBeGreaterThan(0.25);
  const linearSlopes = linear.slice(2, blur - 6).map((value, i) => value - linear[i + 3]);
  expect(Math.max(...linearSlopes) - Math.min(...linearSlopes)).toBeLessThan(0.03);
  expect(gaussian[blur]).toBeLessThan(0.01);
  expect(linear[blur]).toBeLessThan(0.01);

  // One undo step returns to Gaussian.
  await undo(page);
  await expect(page.getByLabel('Drop shadow falloff', { exact: true })).toHaveValue('gaussian');
  await settled(page);
  expect(await shadowProfile(page, row, 0.5, blur + 4)).toEqual(gaussian);

  // A project saved before the option existed has no falloff field: it loads
  // with the linear falloff and the same pixels as before.
  await saved(page);
  const exported = await project(page);
  const state = exported.value.history[exported.value.index];
  const shadow = state.layers.at(-1)!.styles!.dropShadow;
  expect(shadow).toMatchObject({ falloff: 'gaussian', blend: 'source-over' });
  delete shadow.falloff;
  delete shadow.blend;
  const legacyPath = `${exported.path}-legacy.pixelforge`;
  await writeFile(legacyPath, Buffer.from(await (await writePortableBundle(exported.value)).arrayBuffer()));
  await page.getByTestId('project-input').setInputFiles(legacyPath);
  await saved(page);
  await expect(page.getByLabel('Drop shadow falloff', { exact: true })).toHaveValue('box');
  await expect(page.getByLabel('Drop shadow blend mode', { exact: true })).toHaveValue('source-over');
  await settled(page);
  expect(await shadowProfile(page, row, 0.5, blur + 4)).toEqual(linear);
});

// ---------------------------------------------------------------------------
// Editing a stacked filter in place

const WIDTH = 201;
const HEIGHT = 121;

async function importFixture(page: Page) {
  const encoded = await page.evaluate(({ width, height }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        image.data[offset] = (x * 9) & 255;
        image.data[offset + 1] = (y * 13) & 255;
        image.data[offset + 2] = ((x ^ y) * 5) & 255;
        image.data[offset + 3] = 255;
      }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  }, { width: WIDTH, height: HEIGHT });
  await page.getByTestId('file-input').setInputFiles({
    name: 'stack-edit.png',
    mimeType: 'image/png',
    buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveJSProperty('width', WIDTH);
  await settled(page);
}

async function filter(page: Page, item: string) {
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
  await settled(page);
}

const digest = async (page: Page) => {
  await settled(page);
  return page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0x811c9dc5;
    for (let index = 0; index < data.length; index += 1) hash = Math.imul(hash ^ data[index], 0x01000193);
    return (hash >>> 0).toString(16);
  });
};

test('a stacked filter is edited in place with the Filter effects controls, one undo step per change', async ({ page }) => {
  test.setTimeout(180_000);
  await importFixture(page);
  await filter(page, 'Mosaic…');
  await page.getByRole('button', { name: /^Add filter to stack/ }).click();
  await settled(page);
  await filter(page, 'Emboss…');
  const filterType = page.getByLabel('Filter effect', { exact: true });
  await expect(filterType).toHaveValue('emboss');
  const both = await digest(page);

  const edit = page.getByRole('button', { name: 'Edit stacked filter 1. Mosaic', exact: true });
  await expect(edit).toHaveAttribute('aria-pressed', 'false');
  await edit.click();
  const banner = page.getByTestId('filter-stack-editing');
  await expect(banner).toContainText('Editing stacked filter 1. Mosaic');
  await expect(page.getByRole('button', { name: 'Stop editing stacked filter 1. Mosaic', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // The same controls now show the stacked entry's parameters.
  await expect(filterType).toHaveValue('mosaic');
  const cellSize = page.getByLabel('Cell size', { exact: true });
  await expect(cellSize).toHaveValue('10');

  await cellSize.fill('24');
  await expect(cellSize).toHaveValue('24');
  const edited = await digest(page);
  expect(edited).not.toBe(both);

  // Clear does not silently empty a stacked entry.
  await page.getByRole('region', { name: 'Filter effects' }).getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(filterType).toHaveValue('mosaic');
  expect(await digest(page)).toBe(edited);

  // One change, one undo step; the selection stays on the entry.
  await undo(page);
  await expect(cellSize).toHaveValue('10');
  await expect.poll(() => digest(page)).toBe(both);
  await redo(page);
  await expect(cellSize).toHaveValue('24');
  await expect.poll(() => digest(page)).toBe(edited);

  // Done returns the controls to the live filter, which never changed.
  await page.getByTestId('filter-stack-editing').getByRole('button', { name: 'Done', exact: true }).click();
  await expect(banner).toHaveCount(0);
  await expect(filterType).toHaveValue('emboss');

  await saved(page);
  const exported = await project(page);
  const layer = exported.value.history[exported.value.index].layers.at(-1)!;
  expect(layer.smartFilters).toHaveLength(1);
  expect(layer.smartFilters![0]).toMatchObject({ type: 'mosaic', radius: 24 });
  expect(layer.adjustments.filterEffects).toMatchObject({ type: 'emboss' });

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => digest(page)).toBe(edited);
  await page.getByRole('button', { name: 'Edit stacked filter 1. Mosaic', exact: true }).click();
  await expect(page.getByLabel('Cell size', { exact: true })).toHaveValue('24');
});
