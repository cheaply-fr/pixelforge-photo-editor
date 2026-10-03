import { test, expect, type Page } from '@playwright/test';

const openEditor = async (page: Page) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
};
const project = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  const file = await download.path();
  return JSON.parse(await (await import('node:fs/promises')).readFile(file!, 'utf8')) as {
    settings: Record<string, unknown>;
    history: Array<{ layers: Array<{ kind: string; asset?: string }> }>;
    index: number;
    assets: Record<string, { url: string; w: number; h: number }>;
  };
};
type Asset = { url: string; w: number; h: number };

const newTransparentPaintLayer = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await expect(page.locator('footer')).toContainText('New transparent document');
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
};

/** Read only the pixels needed by an assertion; do not compare opaque asset URLs. */
const samplePixels = async (
  page: Page,
  asset: Asset,
  points: Array<{ xRatio: number; yRatio?: number }>,
) => page.evaluate(async ({ asset, points }) => {
  const image = new Image();
  image.src = asset.url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = asset.w;
  canvas.height = asset.h;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  return points.map(({ xRatio, yRatio = 0.5 }) => {
    const x = Math.max(0, Math.min(asset.w - 1, Math.floor(asset.w * xRatio)));
    const y = Math.max(0, Math.min(asset.h - 1, Math.floor(asset.h * yRatio)));
    return Array.from(context.getImageData(x, y, 1, 1).data);
  });
}, { asset, points });

const radialMetrics = async (
  page: Page,
  asset: Asset,
  xRatio: number,
  yRatio: number,
  radius: number,
) => page.evaluate(async ({ asset, xRatio, yRatio, radius }) => {
  const image = new Image();
  image.src = asset.url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = asset.w;
  canvas.height = asset.h;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  const centerX = Math.max(0, Math.min(asset.w - 1, Math.floor(asset.w * xRatio)));
  const centerY = Math.max(0, Math.min(asset.h - 1, Math.floor(asset.h * yRatio)));
  const alphaAt = (x: number, y: number) => context.getImageData(
    Math.max(0, Math.min(asset.w - 1, Math.round(x))),
    Math.max(0, Math.min(asset.h - 1, Math.round(y))),
    1,
    1,
  ).data[3];
  // A vertical slice through the stamp is more stable than counting all
  // pixels: it measures the actual rendered diameter at this canvas point.
  const slice = [] as number[];
  for (let y = Math.max(0, Math.floor(centerY - radius * 1.5)); y <= Math.min(asset.h - 1, Math.ceil(centerY + radius * 1.5)); y += 1)
    slice.push(alphaAt(centerX, y));
  const occupied = slice.map((alpha, index) => alpha > 16 ? index : -1).filter((index) => index >= 0);
  const centerIndex = Math.max(0, Math.min(slice.length - 1, Math.floor(centerY - Math.floor(centerY - radius * 1.5))));
  let min = centerIndex, max = centerIndex;
  for (let index = centerIndex - 1; index >= 0 && slice[index] > 16; index -= 1) min = index;
  for (let index = centerIndex + 1; index < slice.length && slice[index] > 16; index += 1) max = index;
  const edgeOffset = radius * 0.75;
  return {
    center: alphaAt(centerX, centerY),
    interior: alphaAt(centerX, centerY + radius * 0.5),
    edge: alphaAt(centerX, centerY + edgeOffset),
    outside: alphaAt(centerX, centerY + radius + 3),
    span: occupied.length ? max - min + 1 : 0,
  };
}, { asset, xRatio, yRatio, radius });
const saved = (page: Page) => expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
const paintUpdated = (page: Page) => expect(page.locator('footer')).toContainText('Paint layer updated', { timeout: 10000 });
const canvasPoint = async (page: Page, fraction = 0.5) => {
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  return { clientX: box.x + box.width * fraction, clientY: box.y + box.height * 0.5 };
};
const pointerStroke = async (page: Page, pressure: number, fraction = 0.5, pointerType = 'pen') => {
  const point = await canvasPoint(page, fraction);
  const canvas = page.getByTestId('editor-canvas');
  // Locator.dispatchEvent creates synthetic pointers with no active browser
  // pointer stream, so setPointerCapture would reject their ids. Keep the
  // editor's real pointer path while making the synthetic pressure explicit.
  await canvas.evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  await canvas.dispatchEvent('pointerdown', { pointerId: 9, pointerType, pressure, clientX: point.clientX, clientY: point.clientY, buttons: 1, isPrimary: true });
  await page.waitForTimeout(100);
  await canvas.dispatchEvent('pointermove', { pointerId: 9, pointerType, pressure, clientX: point.clientX + 12, clientY: point.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointerup', { pointerId: 9, pointerType, pressure, clientX: point.clientX + 12, clientY: point.clientY, buttons: 0, isPrimary: true });
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  await paintUpdated(page);
  await page.waitForTimeout(150);
  await saved(page);
};
const pointerStrokeWithReleasePressure = async (
  page: Page,
  pressure: number,
  startFraction: number,
  endFraction: number,
  releasePressure: number,
  pointerType = 'pen',
) => {
  const start = await canvasPoint(page, startFraction);
  const end = await canvasPoint(page, endFraction);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 29,
    pointerType,
    pressure,
    clientX: start.clientX,
    clientY: start.clientY,
    buttons: 1,
    isPrimary: true,
  });
  await page.waitForTimeout(100);
  await canvas.dispatchEvent('pointermove', {
    pointerId: 29,
    pointerType,
    pressure,
    clientX: end.clientX,
    clientY: end.clientY,
    buttons: 1,
    isPrimary: true,
  });
  await canvas.dispatchEvent('pointerup', {
    pointerId: 29,
    pointerType,
    pressure: releasePressure,
    clientX: end.clientX,
    clientY: end.clientY,
    buttons: 0,
    isPrimary: true,
  });
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  await paintUpdated(page);
  await page.waitForTimeout(150);
  await saved(page);
};
const toolStroke = async (page: Page, tool: string, notice: string, fraction: number, select = true) => {
  if (select) await page.getByRole('button', { name: `${tool} tool`, exact: true }).click();
  const point = await canvasPoint(page, fraction);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  await canvas.dispatchEvent('pointerdown', { pointerId: 17, pointerType: 'mouse', pressure: 1, clientX: point.clientX, clientY: point.clientY, buttons: 1, isPrimary: true });
  await page.waitForTimeout(100);
  await canvas.dispatchEvent('pointermove', { pointerId: 17, pointerType: 'mouse', pressure: 1, clientX: point.clientX + 12, clientY: point.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointerup', { pointerId: 17, pointerType: 'mouse', pressure: 1, clientX: point.clientX + 12, clientY: point.clientY, buttons: 0, isPrimary: true });
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  await expect(page.locator('footer')).toContainText(notice, { timeout: 10000 });
  await saved(page);
};

 test.beforeEach(async ({ page }) => openEditor(page));

test('brush pressure controls are accessible, opt-in, persisted, and backward-compatible', async ({ page }) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  await expect(page.getByLabel('Pressure affects size', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Pressure affects opacity', { exact: true })).not.toBeChecked();
  await page.getByLabel('Size', { exact: true }).fill('44');
  await page.getByLabel('Hardness', { exact: true }).fill('0');
  await page.getByLabel('Opacity', { exact: true }).fill('63');
  await page.getByLabel('Pressure affects size', { exact: true }).check();
  await page.getByLabel('Pressure affects opacity', { exact: true }).check();
  await saved(page);
  const out = await project(page);
  expect(out.settings).toMatchObject({ size: 44, hardness: 0, brushOpacity: 63, pressureSize: true, pressureOpacity: true });
  await page.reload();
  await expect(page.getByLabel('Size', { exact: true })).toHaveValue('44');
  await expect(page.getByLabel('Hardness', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Opacity', { exact: true })).toHaveValue('63');
  await expect(page.getByLabel('Pressure affects size', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Pressure affects opacity', { exact: true })).toBeChecked();

  // Drafts created before pressure controls existed omit both optional keys;
  // importing one must preserve the document and use the safe off defaults.
  const legacy = JSON.parse(JSON.stringify(out)) as typeof out;
  delete legacy.settings.pressureSize;
  delete legacy.settings.pressureOpacity;
  await page.getByTestId('project-input').setInputFiles({
    name: 'legacy-pressure.pixelforge',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect(page.locator('footer')).toContainText('Project opened with editable layers and history');
  await expect(page.getByLabel('Pressure affects size', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Pressure affects opacity', { exact: true })).not.toBeChecked();

  const invalid = JSON.parse(JSON.stringify(legacy)) as typeof out;
  invalid.settings.pressureSize = 'enabled' as unknown as boolean;
  await page.getByTestId('project-input').setInputFiles({
    name: 'invalid-pressure.pixelforge',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await expect(page.locator('footer')).toContainText('Saved document is not supported');
});

test('pressure-off fallback keeps pen strokes at configured size and opacity', async ({ page }) => {
  await newTransparentPaintLayer(page);
  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  await page.getByLabel('Size', { exact: true }).fill('60');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await pointerStroke(page, 0.15, 0.24);
  const low = await project(page);
  await pointerStroke(page, 0.85, 0.68);
  const high = await project(page);
  const lowLayer = low.history[low.index].layers.at(-1)!;
  const highLayer = high.history[high.index].layers.at(-1)!;
  expect(lowLayer.kind).toBe('raster'); expect(highLayer.kind).toBe('raster');
  const lowAsset = low.assets[lowLayer.asset!], highAsset = high.assets[highLayer.asset!];
  const lowMetrics = await radialMetrics(page, lowAsset, 0.24, 0.5, 36);
  const highMetrics = await radialMetrics(page, highAsset, 0.68, 0.5, 36);
  // Pointer pressure is intentionally ignored unless the user opts in. The
  // two strokes therefore have the same pixel diameter and center alpha even
  // though the synthetic pen pressures differ substantially.
  expect(Math.abs(lowMetrics.span - highMetrics.span)).toBeLessThanOrEqual(2);
  expect(Math.abs(lowMetrics.center - highMetrics.center)).toBeLessThanOrEqual(2);
  expect(lowMetrics.center).toBeGreaterThan(240);
  expect(highMetrics.center).toBeGreaterThan(240);
});

test('pressure size and opacity flags operate independently on committed pixels', async ({ page }) => {
  await newTransparentPaintLayer(page);
  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  await page.getByLabel('Size', { exact: true }).fill('54');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await page.getByLabel('Pressure affects size', { exact: true }).check();
  await pointerStroke(page, 0.2, 0.22);
  const sizeLow = await project(page);
  await pointerStroke(page, 0.8, 0.42);
  const sizeHigh = await project(page);
  const sizeLowAsset = sizeLow.assets[sizeLow.history[sizeLow.index].layers.at(-1)!.asset!];
  const sizeHighAsset = sizeHigh.assets[sizeHigh.history[sizeHigh.index].layers.at(-1)!.asset!];
  const sizeLowMetrics = await radialMetrics(page, sizeLowAsset, 0.22, 0.5, 36);
  const sizeHighMetrics = await radialMetrics(page, sizeHighAsset, 0.42, 0.5, 36);
  expect(sizeHighMetrics.span).toBeGreaterThan(sizeLowMetrics.span + 12);
  expect(Math.abs(sizeHighMetrics.center - sizeLowMetrics.center)).toBeLessThanOrEqual(2);

  // Start a clean transparent layer so the opacity comparison cannot be
  // explained by overlap with the size-only strokes above.
  await newTransparentPaintLayer(page);
  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  await page.getByLabel('Size', { exact: true }).fill('54');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await page.getByLabel('Pressure affects size', { exact: true }).uncheck();
  await expect(page.getByLabel('Pressure affects size', { exact: true })).not.toBeChecked();
  await page.getByLabel('Pressure affects opacity', { exact: true }).check();
  await pointerStroke(page, 0.2, 0.58);
  const opacityLow = await project(page);
  await pointerStroke(page, 0.8, 0.78);
  const opacityHigh = await project(page);
  const opacityLowAsset = opacityLow.assets[opacityLow.history[opacityLow.index].layers.at(-1)!.asset!];
  const opacityHighAsset = opacityHigh.assets[opacityHigh.history[opacityHigh.index].layers.at(-1)!.asset!];
  const opacityLowMetrics = await radialMetrics(page, opacityLowAsset, 0.58, 0.5, 36);
  const opacityHighMetrics = await radialMetrics(page, opacityHighAsset, 0.78, 0.5, 36);
  expect(Math.abs(opacityHighMetrics.span - opacityLowMetrics.span)).toBeLessThanOrEqual(2);
  expect(opacityHighMetrics.center).toBeGreaterThan(opacityLowMetrics.center + 80);
  expect(opacityLowMetrics.center).toBeGreaterThan(20);
});

test('hardness zero produces a soft edge and pencil remains a hard-edge tool', async ({ page }) => {
  await newTransparentPaintLayer(page);
  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  await page.getByLabel('Size', { exact: true }).fill('80');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await page.getByLabel('Hardness', { exact: true }).fill('0');
  await expect(page.getByLabel('Hardness', { exact: true })).toHaveValue('0');
  await pointerStroke(page, 1, 0.5, 'mouse');
  const soft = await project(page);
  const softAsset = soft.assets[soft.history[soft.index].layers.at(-1)!.asset!];
  const softMetrics = await radialMetrics(page, softAsset, 0.5, 0.5, 44);
  expect(softMetrics.center).toBeGreaterThan(220);
  expect(softMetrics.edge).toBeGreaterThan(4);
  expect(softMetrics.edge).toBeLessThan(220);
  expect(softMetrics.outside).toBe(0);

  await newTransparentPaintLayer(page);
  await page.getByRole('button', { name: 'Pencil tool', exact: true }).click();
  await expect(page.getByLabel('Hardness', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Pressure affects size', { exact: true })).toHaveCount(0);
  await page.getByLabel('Size', { exact: true }).fill('80');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await pointerStroke(page, 1, 0.5, 'mouse');
  const pencil = await project(page);
  const pencilAsset = pencil.assets[pencil.history[pencil.index].layers.at(-1)!.asset!];
  const pencilMetrics = await radialMetrics(page, pencilAsset, 0.5, 0.5, 44);
  expect(pencilMetrics.center).toBeGreaterThan(220);
  expect(pencilMetrics.edge).toBeGreaterThan(220);
  expect(pencilMetrics.outside).toBe(0);

  // Pressure controls are deliberately unavailable for tools whose pixel
  // contract does not use the brush stamp (replace and vector shapes).
  await page.getByRole('button', { name: 'Color Replace tool', exact: true }).click();
  await expect(page.getByLabel('Pressure affects opacity', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Shape tool', exact: true }).click();
  await expect(page.getByLabel('Pressure affects size', { exact: true })).toHaveCount(0);
});

test('eraser honors opacity and restores through undo', async ({ page }) => {
  await newTransparentPaintLayer(page);
  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  await page.getByLabel('Size', { exact: true }).fill('80');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await pointerStroke(page, 1, 0.5, 'mouse');
  const painted = await project(page);
  const paintedLayer = painted.history[painted.index].layers.at(-1)!;
  const paintedAsset = painted.assets[paintedLayer.asset!];
  const paintedMetrics = await radialMetrics(page, paintedAsset, 0.5, 0.5, 44);
  await page.getByRole('button', { name: 'Eraser tool', exact: true }).click();
  await page.getByLabel('Opacity', { exact: true }).fill('25');
  await pointerStroke(page, 1, 0.5, 'mouse');
  const erased = await project(page);
  const erasedLayer = erased.history[erased.index].layers.at(-1)!;
  const erasedAsset = erased.assets[erasedLayer.asset!];
  const erasedMetrics = await radialMetrics(page, erasedAsset, 0.5, 0.5, 44);
  expect(erasedLayer.asset).not.toBe(paintedLayer.asset);
  // destination-out must reduce alpha monotonically while preserving some
  // pixels at 25% opacity; this catches an accidental full erase or source-over.
  expect(erasedMetrics.center).toBeGreaterThan(0);
  expect(erasedMetrics.center).toBeLessThan(paintedMetrics.center);
  expect(erasedMetrics.interior).toBeLessThanOrEqual(paintedMetrics.interior);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await saved(page);
  const restored = await project(page);
  expect(restored.history[restored.index].layers.at(-1)!.asset).toBe(paintedLayer.asset);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await saved(page);
  const redone = await project(page);
  expect(redone.history[redone.index].layers.at(-1)!.asset).toBe(erasedLayer.asset);
  await page.reload();
  await saved(page);
  const reloaded = await project(page);
  expect(reloaded.history[reloaded.index].layers.at(-1)!.asset).toBe(erasedLayer.asset);
});

test('clone source stays fixed and healing commits through the shared stamp path', async ({ page }) => {
  await newTransparentPaintLayer(page);
  await page.getByLabel('Drawing color', { exact: true }).fill('#d91c5b');
  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  await page.getByLabel('Size', { exact: true }).fill('64');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  // Keep the source interior while placing the destination against the left
  // edge. The destination patch is clipped, so the source range must map to
  // the same global pixels rather than restarting at the source center.
  await pointerStroke(page, 1, 0.3, 'mouse');
  const painted = await project(page);
  const paintedAsset = painted.assets[painted.history[painted.index].layers.at(-1)!.asset!];
  const sourcePixel = (await samplePixels(page, paintedAsset, [{ xRatio: 0.3 }]))[0];
  expect(sourcePixel[3]).toBeGreaterThan(180);

  await page.getByRole('button', { name: 'Clone tool', exact: true }).click();
  const sourcePoint = await canvasPoint(page, 0.3);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.dispatchEvent('pointerdown', { pointerId: 18, pointerType: 'mouse', pressure: 1, clientX: sourcePoint.clientX, clientY: sourcePoint.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointerup', { pointerId: 18, pointerType: 'mouse', pressure: 1, clientX: sourcePoint.clientX, clientY: sourcePoint.clientY, buttons: 0, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Clone source set; drag on the image to paint it');
  await toolStroke(page, 'Clone', 'Clone stroke applied', 0.01, false);
  const cloned = await project(page);
  expect(cloned.history.length).toBeGreaterThan(painted.history.length);
  const clonedAsset = cloned.assets[cloned.history[cloned.index].layers.at(-1)!.asset!];
  const [retainedSource, clonedDestination, clippedDestination] = await samplePixels(page, clonedAsset, [
    { xRatio: 0.3 },
    { xRatio: 0.01 },
    { xRatio: 0.03 },
  ]);
  expect(clonedDestination[3]).toBeGreaterThan(180);
  expect(clonedDestination.slice(0, 3)).toEqual(sourcePixel.slice(0, 3));
  expect(clonedDestination[3]).toBe(sourcePixel[3]);
  expect(clippedDestination.slice(0, 3)).toEqual(sourcePixel.slice(0, 3));
  expect(clippedDestination[3]).toBe(sourcePixel[3]);
  expect(retainedSource).toEqual(sourcePixel);

  await page.getByRole('button', { name: 'Healing tool', exact: true }).click();
  const healingSource = await canvasPoint(page, 0.3);
  await canvas.dispatchEvent('pointerdown', { pointerId: 19, pointerType: 'mouse', pressure: 1, clientX: healingSource.clientX, clientY: healingSource.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointerup', { pointerId: 19, pointerType: 'mouse', pressure: 1, clientX: healingSource.clientX, clientY: healingSource.clientY, buttons: 0, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Clone source set; drag on the image to paint it');
  await toolStroke(page, 'Healing', 'Healing stroke applied', 0.84, false);
  const healed = await project(page);
  expect(healed.history.length).toBeGreaterThan(cloned.history.length);
  const healedAsset = healed.assets[healed.history[healed.index].layers.at(-1)!.asset!];
  const healedDestination = (await samplePixels(page, healedAsset, [{ xRatio: 0.84 }]))[0];
  // Healing uses the fixed source with its bounded 0.65 blend. It should add
  // visible source pixels while remaining below a full clone stamp.
  expect(healedDestination[3]).toBeGreaterThan(20);
  expect(healedDestination[3]).toBeLessThan(sourcePixel[3]);
  expect(healedDestination.slice(0, 3)).toEqual(sourcePixel.slice(0, 3));
});

test('pen pointer-up pressure zero does not create a full-pressure endpoint', async ({ page }) => {
  await newTransparentPaintLayer(page);
  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  await page.getByLabel('Size', { exact: true }).fill('80');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await page.getByLabel('Pressure affects size', { exact: true }).check();
  await page.getByLabel('Pressure affects opacity', { exact: true }).check();
  await pointerStrokeWithReleasePressure(page, 0.2, 0.25, 0.45, 0, 'pen');
  const committed = await project(page);
  const asset = committed.assets[committed.history[committed.index].layers.at(-1)!.asset!];
  const startMetrics = await radialMetrics(page, asset, 0.25, 0.5, 48);
  const endMetrics = await radialMetrics(page, asset, 0.45, 0.5, 48);
  // A release event reports zero pressure. The stroke must retain the last
  // non-zero pen pressure, so the endpoint stays a small/low-opacity stamp.
  expect(endMetrics.span).toBeLessThan(26);
  expect(endMetrics.center).toBeLessThan(180);
  expect(Math.abs(endMetrics.span - startMetrics.span)).toBeLessThanOrEqual(4);
});

test('touch stroke commits once and pointer cancellation leaves the draft unchanged', async ({ page }) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  const before = await project(page);
  const point = await canvasPoint(page, 0.3);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.dispatchEvent('pointerdown', { pointerId: 11, pointerType: 'touch', pressure: 0, clientX: point.clientX, clientY: point.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointermove', { pointerId: 11, pointerType: 'touch', pressure: 0, clientX: point.clientX + 80, clientY: point.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointercancel', { pointerId: 11, pointerType: 'touch', pressure: 0, clientX: point.clientX + 80, clientY: point.clientY, buttons: 0, isPrimary: true });
  await saved(page);
  const afterCancel = await project(page);
  expect(afterCancel.history.length).toBe(before.history.length);
  await pointerStroke(page, 0, 0.3, 'touch');
  const afterTouch = await project(page);
  expect(afterTouch.history.length).toBe(before.history.length + 1);
});
