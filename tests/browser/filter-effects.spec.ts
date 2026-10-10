import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

async function importPixels(page: Page) {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 9;
    canvas.height = 5;
    const context = canvas.getContext('2d')!;
    const data = context.createImageData(9, 5);
    for (let y = 0; y < 5; y += 1)
      for (let x = 0; x < 9; x += 1) {
        const offset = (y * 9 + x) * 4;
        data.data[offset] = x * 22;
        data.data[offset + 1] = y * 38;
        data.data[offset + 2] = (x + y) * 12;
        data.data[offset + 3] = x === 0 && y === 0 ? 0 : 255;
      }
    context.putImageData(data, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'filter-fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
}

async function downloadProject(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const path = await (await pending).path();
  return JSON.parse(await (await import('node:fs/promises')).readFile(path!, 'utf8')) as {
    assets: Record<string, unknown>;
    history: Array<{ layers: Array<{ asset?: string; adjustments: { filterEffects?: Record<string, unknown> } }> }>;
    index: number;
  };
}

async function openProject(page: Page, project: object) {
  await page.getByTestId('project-input').setInputFiles({
    name: 'radial-roundtrip.pixelforge.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
}

const pixel = (page: Page, x: number, y: number) =>
  page.getByTestId('editor-canvas').evaluate(
    (canvas: HTMLCanvasElement, point) =>
      Array.from(canvas.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data),
    { x, y },
  );

const pixels = (page: Page) =>
  page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) =>
    Array.from(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data),
  );

test('linear Shear retains source assets, supports undo and round-trips editable controls', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset!;
  const original = await pixel(page, 4, 0);
  const centre = await pixel(page, 4, 2);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Shear…', exact: true }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('shear');
  await expect(page.getByLabel('Shear direction', { exact: true })).toHaveValue('90');
  await expect.poll(() => pixel(page, 4, 0)).not.toEqual(original);
  expect(await pixel(page, 4, 2)).toEqual(centre);
  expect((await pixel(page, 0, 0))[3]).toBe(0);
  await page.getByLabel('Shear displacement', { exact: true }).press('ArrowRight');
  const adjusted = await downloadProject(page);
  const layer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(layer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset]).toEqual(before.assets[sourceAsset]);
  expect(layer.adjustments.filterEffects).toMatchObject({ type: 'shear', amount: 70, radius: 7, angle: 90 });
  const changed = await pixel(page, 4, 0);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Shear displacement', { exact: true })).toHaveValue('7');
  await expect.poll(() => pixel(page, 4, 0)).toEqual(changed);
  await openProject(page, adjusted);
  await expect(page.getByLabel('Shear direction', { exact: true })).toHaveValue('90');
  await expect.poll(() => pixel(page, 4, 0)).toEqual(changed);
  for (let index = 0; index < 2; index += 1) {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Undo/ }).click();
  }
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
  await expect.poll(() => pixel(page, 4, 0)).toEqual(original);
});

test('Gaussian Blur uses bounded tiled rendering and preserves the editable source', async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { __PIXELFORGE_FORCE_WORKER__?: boolean }).__PIXELFORGE_FORCE_WORKER__ = true;
  });
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset!;
  const original = await pixels(page);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Gaussian Blur…', exact: true }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('gaussian-blur');
  await page.getByLabel('Blur radius', { exact: true }).press('ArrowRight');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  const renderStatus = page.getByTestId('render-status');
  await expect(renderStatus).toHaveAttribute('data-tiled-effect', 'gaussian-blur');
  await expect(renderStatus).toHaveAttribute('data-tiled-tile-count', /[1-9]/);
  await expect(renderStatus).toHaveAttribute('data-tiled-peak-bytes', /[1-9]/);
  await expect(renderStatus).toHaveAttribute('data-tiled-working-bytes', /[1-9]/);
  await expect(renderStatus).toHaveAttribute('data-tiled-completed', /[1-9]/);
  await expect(renderStatus).toHaveAttribute('data-tiled-total', /[1-9]/);
  const changed = await pixels(page);
  expect(changed).not.toEqual(original);
  const after = await downloadProject(page);
  const layer = after.history[after.index].layers.at(-1)!;
  expect(layer.asset).toBe(sourceAsset);
  expect(after.assets[sourceAsset]).toEqual(before.assets[sourceAsset]);
  expect(layer.adjustments.filterEffects).toMatchObject({ type: 'gaussian-blur', radius: 7 });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Blur radius', { exact: true })).toHaveValue('7');
  await expect.poll(() => pixels(page)).toEqual(changed);
});

test('Path Blur is editable, source-safe and round-trips on desktop and mobile', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset!;
  const original = await pixel(page, 4, 0);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Path Blur…', exact: true }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('path-blur');
  await expect(page.getByLabel('Path direction', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Motion point 1 X', { exact: true })).toHaveValue('20');
  await expect.poll(() => pixel(page, 4, 0)).not.toEqual(original);
  await page.getByLabel('Path direction', { exact: true }).press('ArrowRight');
  await page.getByLabel('Motion point 1 X', { exact: true }).press('ArrowRight');
  const adjusted = await downloadProject(page);
  const layer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(layer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset]).toEqual(before.assets[sourceAsset]);
  const pathEffects = layer.adjustments.filterEffects as { type?: string; angle?: number; path?: Array<{ x?: number }> };
  expect(pathEffects).toMatchObject({ type: 'path-blur', angle: 1 });
  expect(pathEffects.path?.[0]?.x).toBeCloseTo(0.21);
  const changed = await pixel(page, 4, 0);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('path-blur');
  await expect(page.getByLabel('Path direction', { exact: true })).toHaveValue('1');
  await expect.poll(() => pixel(page, 4, 0)).toEqual(changed);
});

test('Spin Blur exposes an editable centre and preserves transparent padding', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset!;
  const original = await pixel(page, 8, 0);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Spin Blur…', exact: true }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('spin-blur');
  await expect(page.getByLabel('Angular sweep', { exact: true })).toHaveValue('18');
  await expect(page.getByLabel('Spin horizontal radius', { exact: true })).toHaveValue('80');
  await expect.poll(() => pixel(page, 8, 0)).not.toEqual(original);
  expect(await pixel(page, 0, 0)).toEqual([0, 0, 0, 0]);
  await page.getByLabel('Spin center X', { exact: true }).press('ArrowRight');
  await page.getByLabel('Spin ellipse rotation', { exact: true }).press('ArrowRight');
  const adjusted = await downloadProject(page);
  const layer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(layer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset]).toEqual(before.assets[sourceAsset]);
  expect(layer.adjustments.filterEffects).toMatchObject({ type: 'spin-blur', centerX: 0.51, spinEllipse: { rotation: 1 } });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('spin-blur');
  await expect(page.getByLabel('Spin center X', { exact: true })).toHaveValue('51');
});

test('Polar Coordinates is enabled, editable and round-trips nondestructively', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset!;
  const rightBefore = await pixel(page, 8, 2);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Polar Coordinates…', exact: true }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('polar-coordinates');
  await expect(page.getByLabel('Polar radius', { exact: true })).toHaveValue('64');
  await expect.poll(() => pixel(page, 8, 2)).not.toEqual(rightBefore);
  await page.getByLabel('Polar radius', { exact: true }).press('ArrowLeft');
  const adjusted = await downloadProject(page);
  const layer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(layer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset]).toEqual(before.assets[sourceAsset]);
  expect(layer.adjustments.filterEffects).toMatchObject({ type: 'polar-coordinates', amount: 70, radius: 63 });
  const changed = await pixel(page, 8, 2);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Polar radius', { exact: true })).toHaveValue('63');
  await expect.poll(() => pixel(page, 8, 2)).toEqual(changed);
  await openProject(page, adjusted);
  await expect.poll(() => pixel(page, 8, 2)).toEqual(changed);
  for (let index = 0; index < 2; index += 1) {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Undo/ }).click();
  }
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
});

test('ZigZag is enabled, editable and round-trips nondestructively', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset!;
  const beforePixel = await pixel(page, 6, 2);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'ZigZag…', exact: true }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('zigzag');
  await expect(page.getByLabel('ZigZag wavelength', { exact: true })).toHaveValue('6');
  await expect.poll(() => pixel(page, 6, 2)).not.toEqual(beforePixel);
  await page.getByLabel('ZigZag wavelength', { exact: true }).press('ArrowRight');
  const adjusted = await downloadProject(page);
  const layer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(layer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset]).toEqual(before.assets[sourceAsset]);
  expect(layer.adjustments.filterEffects).toMatchObject({ type: 'zigzag', amount: 70, radius: 7 });
  const changed = await pixel(page, 6, 2);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('ZigZag wavelength', { exact: true })).toHaveValue('7');
  await expect.poll(() => pixel(page, 6, 2)).toEqual(changed);
  await openProject(page, adjusted);
  await expect.poll(() => pixel(page, 6, 2)).toEqual(changed);
  for (let index = 0; index < 2; index += 1) {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Undo/ }).click();
  }
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
});

test('Displace is enabled, directional and round-trips nondestructively', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset!;
  const beforePixel = await pixel(page, 6, 2);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Displace…', exact: true }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('displace');
  await expect(page.getByLabel('Displace wavelength', { exact: true })).toHaveValue('6');
  await expect(page.getByLabel('Displace direction', { exact: true })).toHaveValue('0');
  await expect.poll(() => pixel(page, 6, 2)).not.toEqual(beforePixel);
  await page.getByLabel('Displace direction', { exact: true }).press('ArrowRight');
  const adjusted = await downloadProject(page);
  const layer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(layer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset]).toEqual(before.assets[sourceAsset]);
  expect(layer.adjustments.filterEffects).toMatchObject({ type: 'displace', amount: 70, radius: 6, angle: 1 });
  const changed = await pixel(page, 6, 2);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Displace direction', { exact: true })).toHaveValue('1');
  await expect.poll(() => pixel(page, 6, 2)).toEqual(changed);
  await openProject(page, adjusted);
  await expect.poll(() => pixel(page, 6, 2)).toEqual(changed);
  for (let index = 0; index < 2; index += 1) {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Undo/ }).click();
  }
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
});

test('Pointillize is enabled, editable and round-trips nondestructively', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset!;
  const beforePixel = await pixel(page, 4, 2);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Pointillize…', exact: true }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('pointillize');
  await expect(page.getByLabel('Cell size', { exact: true })).toHaveValue('10');
  await expect.poll(() => pixel(page, 4, 2)).not.toEqual(beforePixel);
  await page.getByLabel('Cell size', { exact: true }).press('ArrowRight');
  const adjusted = await downloadProject(page);
  const layer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(layer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset]).toEqual(before.assets[sourceAsset]);
  expect(layer.adjustments.filterEffects).toMatchObject({ type: 'pointillize', amount: 85, radius: 11 });
  const changed = await pixel(page, 4, 2);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Cell size', { exact: true })).toHaveValue('11');
  await expect.poll(() => pixel(page, 4, 2)).toEqual(changed);
  await openProject(page, adjusted);
  await expect.poll(() => pixel(page, 4, 2)).toEqual(changed);
  for (let index = 0; index < 2; index += 1) {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Undo/ }).click();
  }
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
});

test('Crystallize is enabled, seeded and round-trips nondestructively', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset!;
  const beforePixel = await pixel(page, 4, 2);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Crystallize…', exact: true }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('crystallize');
  await expect(page.getByLabel('Cell size', { exact: true })).toHaveValue('10');
  await expect.poll(() => pixel(page, 4, 2)).not.toEqual(beforePixel);
  await page.getByLabel('Cell size', { exact: true }).press('ArrowRight');
  const adjusted = await downloadProject(page);
  const layer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(layer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset]).toEqual(before.assets[sourceAsset]);
  expect(layer.adjustments.filterEffects).toMatchObject({ type: 'crystallize', amount: 85, radius: 11, seed: 0 });
  const changed = await pixel(page, 4, 2);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Cell size', { exact: true })).toHaveValue('11');
  await expect.poll(() => pixel(page, 4, 2)).toEqual(changed);
  await openProject(page, adjusted);
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('crystallize');
  await expect.poll(() => pixel(page, 4, 2)).toEqual(changed);
  for (let index = 0; index < 2; index += 1) {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Undo/ }).click();
  }
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
});

test('Facet is enabled, deterministic and round-trips nondestructively', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset!;
  const beforePixel = await pixel(page, 4, 2);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Facet…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('facet');
  await expect(page.getByLabel('Cell size', { exact: true })).toHaveValue('10');
  await expect.poll(() => pixel(page, 4, 2)).not.toEqual(beforePixel);
  await page.getByLabel('Cell size', { exact: true }).press('ArrowRight');
  const adjusted = await downloadProject(page);
  const layer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(layer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset]).toEqual(before.assets[sourceAsset]);
  expect(layer.adjustments.filterEffects).toMatchObject({ type: 'facet', amount: 85, radius: 11, seed: 0 });
  const changed = await pixel(page, 4, 2);
  expect((await pixel(page, 0, 0))[3]).toBe(0);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('facet');
  await expect(page.getByLabel('Cell size', { exact: true })).toHaveValue('11');
  await expect.poll(() => pixel(page, 4, 2)).toEqual(changed);
  await openProject(page, adjusted);
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('facet');
  await expect.poll(() => pixel(page, 4, 2)).toEqual(changed);
  for (let index = 0; index < 2; index += 1) {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Undo/ }).click();
  }
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
});

test('Color Halftone exposes CMYK screen controls and round-trips nondestructively', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset!;
  const original = await pixels(page);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Color Halftone…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText('Color Halftone applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('color-halftone');
  await expect(page.getByLabel('Cell size', { exact: true })).toHaveValue('10');
  await expect(page.getByLabel('Cyan screen angle', { exact: true })).toHaveValue('108');
  await expect(page.getByLabel('Magenta screen angle', { exact: true })).toHaveValue('162');
  await expect(page.getByLabel('Yellow screen angle', { exact: true })).toHaveValue('90');
  await expect(page.getByLabel('Black screen angle', { exact: true })).toHaveValue('45');
  await expect.poll(() => pixels(page)).not.toEqual(original);
  expect(await pixel(page, 0, 0)).toEqual([0, 0, 0, 0]);
  await page.getByLabel('Cyan screen angle', { exact: true }).press('ArrowRight');
  await page.getByLabel('Cell size', { exact: true }).press('ArrowRight');
  const changed = await pixels(page);
  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset]).toEqual(before.assets[sourceAsset]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({
    type: 'color-halftone', amount: 85, radius: 11,
    colorHalftone: { cyanAngle: 109, magentaAngle: 162, yellowAngle: 90, blackAngle: 45 },
  });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('color-halftone');
  await expect(page.getByLabel('Cell size', { exact: true })).toHaveValue('11');
  await expect(page.getByLabel('Cyan screen angle', { exact: true })).toHaveValue('109');
  await expect.poll(() => pixels(page)).toEqual(changed);
  await openProject(page, adjusted);
  await expect(page.getByLabel('Magenta screen angle', { exact: true })).toHaveValue('162');
  await expect.poll(() => pixels(page)).toEqual(changed);
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Undo/ }).click();
  }
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
  await expect.poll(() => pixels(page)).toEqual(original);
});

test('Lens Correction is enabled, editable and round-trips nondestructively', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset!;
  const beforePixel = await pixel(page, 8, 2);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Lens Correction…', exact: true }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('lens-correction');
  await expect(page.getByLabel('Correction radius', { exact: true })).toHaveValue('64');
  await expect(page.getByLabel('Correction centre X', { exact: true })).toHaveValue('50');
  await expect.poll(() => pixel(page, 8, 2)).not.toEqual(beforePixel);
  await page.getByLabel('Correction centre X', { exact: true }).press('ArrowRight');
  const adjusted = await downloadProject(page);
  const layer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(layer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset]).toEqual(before.assets[sourceAsset]);
  expect(layer.adjustments.filterEffects).toMatchObject({ type: 'lens-correction', amount: 75, radius: 64, centerX: 0.51 });
  const changed = await pixel(page, 8, 2);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Correction centre X', { exact: true })).toHaveValue('51');
  await expect.poll(() => pixel(page, 8, 2)).toEqual(changed);
  await openProject(page, adjusted);
  await expect.poll(() => pixel(page, 8, 2)).toEqual(changed);
  for (let index = 0; index < 2; index += 1) {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Undo/ }).click();
  }
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
});

test('Lens Correction direction is editable and survives reload and project round-trip', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset!;
  const beforePixels = await pixels(page);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Lens Correction…', exact: true }).click();
  await expect(page.getByLabel('Correction direction', { exact: true })).toHaveValue('inward');
  await page.getByLabel('Correction direction', { exact: true }).selectOption('outward');
  await expect.poll(async () => {
    const current = await pixels(page);
    return current.some((value, index) => value !== beforePixels[index]);
  }).toBe(true);
  const adjusted = await downloadProject(page);
  const layer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(layer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset]).toEqual(before.assets[sourceAsset]);
  expect(layer.adjustments.filterEffects).toMatchObject({ type: 'lens-correction', lensDirection: 'outward' });
  const changed = await pixels(page);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Correction direction', { exact: true })).toHaveValue('outward');
  await expect.poll(() => pixels(page)).toEqual(changed);
  await openProject(page, adjusted);
  await expect(page.getByLabel('Correction direction', { exact: true })).toHaveValue('outward');
  await expect.poll(() => pixels(page)).toEqual(changed);
});

test('Average Blur is a global nondestructive menu effect with alpha-safe pixels', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const sourcePixel = await pixel(page, 1, 0);

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const average = page.getByRole('menuitem', { name: 'Average', exact: true });
  await expect(average).toBeEnabled();
  await average.click();
  await expect(page.getByText('Average Blur applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('average-blur');
  await expect.poll(() => pixel(page, 1, 0)).not.toEqual(sourcePixel);
  expect((await pixel(page, 0, 0))[3]).toBe(0);

  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({ type: 'average-blur', amount: 85 });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect.poll(() => pixel(page, 1, 0)).toEqual(sourcePixel);
});

test('Blur More is an enabled stronger nondestructive blur preset', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const blurMore = page.getByRole('menuitem', { name: 'Blur More', exact: true });
  await expect(blurMore).toBeEnabled();
  await blurMore.click();
  await expect(page.getByText('Blur More applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('blur-more');

  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({ type: 'blur-more', amount: 85, radius: 6 });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
});

test('Field Blur is a nondestructive menu effect with source-safe persistence', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const sourcePixel = await pixel(page, 1, 0);

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const fieldBlur = page.getByRole('menuitem', { name: 'Field Blur…', exact: true });
  await expect(fieldBlur).toBeEnabled();
  await fieldBlur.click();
  await expect(page.getByText('Field Blur applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByText('Field pins', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Field pin 1 radius', { exact: true })).toHaveValue('18');
  await expect.poll(() => pixel(page, 1, 0)).not.toEqual(sourcePixel);
  expect((await pixel(page, 0, 0))[3]).toBe(0);

  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({
    type: 'field-blur',
    fieldPoints: [{ x: 0.5, y: 0.5, radius: 18 }],
  });
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('field-blur');

  await page.getByLabel('Field pin 1 radius', { exact: true }).press('ArrowRight');
  const pinAdjusted = await downloadProject(page);
  const pinLayer = pinAdjusted.history[pinAdjusted.index].layers.at(-1)!;
  expect(pinLayer.adjustments.filterEffects).toMatchObject({
    type: 'field-blur',
    fieldPoints: [{ radius: 19 }],
  });
  const changed = await pixel(page, 1, 0);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Field pin 1 radius', { exact: true })).toHaveValue('19');
  await expect.poll(() => pixel(page, 1, 0)).toEqual(changed);
  await openProject(page, pinAdjusted);
  await expect(page.getByLabel('Field pin 1 radius', { exact: true })).toHaveValue('19');
  await expect.poll(() => pixel(page, 1, 0)).toEqual(changed);

  for (let index = 0; index < 2; index += 1) {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Undo/ }).click();
  }
  await expect.poll(() => pixel(page, 1, 0)).toEqual(sourcePixel);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
});

test('Box Blur and Gaussian Blur are editable, source-safe and alpha-preserving on desktop and mobile', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const sourcePixel = await pixel(page, 1, 0);

  for (const [menuLabel, type, notice] of [
    ['Box Blur…', 'box-blur', 'Box Blur applied; remains editable in Filter effects'],
    ['Gaussian Blur…', 'gaussian-blur', 'Gaussian Blur applied; remains editable in Filter effects'],
  ] as const) {
    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    const command = page.getByRole('menuitem', { name: menuLabel, exact: true });
    await expect(command).toBeEnabled();
    await command.click();
    await expect(page.getByText(notice, { exact: true })).toBeVisible();
    await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue(type);
    await expect(page.getByLabel('Blur radius', { exact: true })).toHaveValue('6');
    await page.getByLabel('Blur radius', { exact: true }).press('ArrowRight');
    await expect(page.getByLabel('Blur radius', { exact: true })).toHaveValue('7');
    await expect.poll(() => pixel(page, 1, 0)).not.toEqual(sourcePixel);
    expect((await pixel(page, 0, 0))[3]).toBe(0);

    const adjusted = await downloadProject(page);
    const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
    expect(adjustedLayer.asset).toBe(sourceAsset);
    expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
    expect(adjustedLayer.adjustments.filterEffects).toMatchObject({
      type,
      amount: 85,
      radius: 7,
    });
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Undo/ }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Undo/ }).click();
    await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
    await expect.poll(() => pixel(page, 1, 0)).toEqual(sourcePixel);
  }
});

test('Motion Blur is directional, editable and source-safe on desktop and mobile', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const sourcePixel = await pixel(page, 4, 0);

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Motion Blur…', exact: true })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Motion Blur…', exact: true }).click();
  await expect(page.getByText('Motion Blur applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('motion-blur');
  await expect(page.getByLabel('Motion angle', { exact: true })).toHaveValue('0');
  await page.getByLabel('Motion angle', { exact: true }).press('ArrowRight');
  await expect(page.getByLabel('Motion angle', { exact: true })).toHaveValue('1');
  await page.getByLabel('Blur radius', { exact: true }).press('ArrowRight');
  await expect.poll(() => pixel(page, 4, 0)).not.toEqual(sourcePixel);
  // Motion Blur is one of the translation-invariant local effects routed
  // through the bounded tile adapter; the status exposes its measured
  // working-set counters without leaking pixels or source URLs.
  const renderStatus = page.getByTestId('render-status');
  await expect(renderStatus).toHaveAttribute('data-tiled-effect', 'motion-blur');
  await expect(renderStatus).toHaveAttribute('data-tiled-peak-bytes', /[1-9]/);
  await expect(renderStatus).toHaveAttribute('data-tiled-working-bytes', /[1-9]/);

  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({
    type: 'motion-blur',
    amount: 70,
    angle: 1,
  });

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect.poll(() => pixel(page, 4, 0)).toEqual(sourcePixel);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
});

test('Radial Blur is a nondestructive spin effect with editable centre', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const sourcePixel = await pixel(page, 1, 0);

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Radial Blur…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText('Radial Blur applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('radial-blur');
  await expect(page.getByLabel('Angular sweep', { exact: true })).toHaveValue('18');
  await expect(page.getByLabel('Blur center X', { exact: true })).toHaveValue('50');
  await expect(page.getByLabel('Blur center Y', { exact: true })).toHaveValue('50');
  await page.getByLabel('Angular sweep', { exact: true }).press('ArrowRight');
  await page.getByLabel('Blur center X', { exact: true }).press('ArrowRight');
  await expect(page.getByLabel('Angular sweep', { exact: true })).toHaveValue('19');
  await expect(page.getByLabel('Blur center X', { exact: true })).toHaveValue('51');
  await expect.poll(() => pixel(page, 1, 0)).not.toEqual(sourcePixel);
  expect((await pixel(page, 0, 0))[3]).toBe(0);

  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({
    type: 'radial-blur',
    amount: 70,
    radius: 19,
    centerX: 0.51,
  });

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('radial-blur');
  await expect(page.getByLabel('Blur center X', { exact: true })).toHaveValue('51');
  await openProject(page, adjusted);
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('radial-blur');
  await expect(page.getByLabel('Angular sweep', { exact: true })).toHaveValue('19');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect.poll(() => pixel(page, 1, 0)).toEqual(sourcePixel);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
});

test('Path Blur and Spin Blur are bounded gallery effects with source-safe round trips', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const original = await pixel(page, 1, 0);

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const pathCommand = page.getByRole('menuitem', { name: 'Path Blur…', exact: true });
  await expect(pathCommand).toBeEnabled();
  await pathCommand.click();
  await expect(page.getByText('Path Blur (local approximation) applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('path-blur');
  await expect(page.getByLabel('Blur radius', { exact: true })).toHaveValue('6');
  await expect(page.getByLabel('Path direction', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Path center X', { exact: true })).toHaveValue('50');
  await page.getByLabel('Blur radius', { exact: true }).press('ArrowRight');
  await page.getByLabel('Path direction', { exact: true }).press('ArrowRight');
  await page.getByLabel('Path center X', { exact: true }).press('ArrowRight');
  await expect.poll(() => pixel(page, 1, 0)).not.toEqual(original);
  const pathProject = await downloadProject(page);
  const pathLayer = pathProject.history[pathProject.index].layers.at(-1)!;
  expect(pathLayer.asset).toBe(sourceAsset);
  expect(pathProject.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(pathLayer.adjustments.filterEffects).toMatchObject({ type: 'path-blur', radius: 7, angle: 1, centerX: 0.51 });

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('path-blur');
  await expect(page.getByLabel('Path direction', { exact: true })).toHaveValue('1');

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const spinCommand = page.getByRole('menuitem', { name: 'Spin Blur…', exact: true });
  await expect(spinCommand).toBeEnabled();
  await spinCommand.click();
  await expect(page.getByText('Spin Blur (local approximation) applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('spin-blur');
  await expect(page.getByLabel('Angular sweep', { exact: true })).toHaveValue('18');
  await expect(page.getByLabel('Spin center X', { exact: true })).toHaveValue('51');
  await page.getByLabel('Angular sweep', { exact: true }).press('ArrowRight');
  await page.getByLabel('Spin center X', { exact: true }).press('ArrowRight');
  const spinProject = await downloadProject(page);
  const spinLayer = spinProject.history[spinProject.index].layers.at(-1)!;
  expect(spinLayer.asset).toBe(sourceAsset);
  expect(spinProject.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(spinLayer.adjustments.filterEffects).toMatchObject({ type: 'spin-blur', radius: 19, centerX: 0.52 });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('spin-blur');
  await expect(page.getByLabel('Angular sweep', { exact: true })).toHaveValue('19');
});

test('Mosaic, Tilt-Shift, Ripple and Twirl commands expose editable effect metadata', async ({ page }) => {
  await importPixels(page);
  for (const [menuLabel, type] of [
    ['Mosaic…', 'mosaic'],
    ['Tilt-Shift…', 'tilt-shift'],
    ['Ripple…', 'ripple'],
    ['Twirl…', 'twirl'],
  ] as const) {
    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await page.getByRole('menuitem', { name: menuLabel, exact: true }).click();
    await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue(type);
    const project = await downloadProject(page);
    expect(project.history[project.index].layers.at(-1)!.adjustments.filterEffects).toMatchObject({ type });
  }
});

test('Tilt-Shift exposes a bounded focal band and round-trips source-safe geometry', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset!;
  const original = await pixels(page);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Tilt-Shift…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText('Tilt-Shift applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('tilt-shift');
  await expect(page.getByLabel('Blur radius', { exact: true })).toHaveValue('6');
  await expect(page.getByLabel('Focus centre X', { exact: true })).toHaveValue('50');
  await expect(page.getByLabel('Focus height', { exact: true })).toHaveValue('50');
  await expect(page.getByLabel('Tilt angle', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Focus width', { exact: true })).toHaveValue('36');
  await expect(page.getByLabel('Transition feather', { exact: true })).toHaveValue('50');
  await expect.poll(() => pixels(page)).not.toEqual(original);
  expect(await pixel(page, 0, 0)).toEqual([0, 0, 0, 0]);

  await page.getByLabel('Focus centre X', { exact: true }).press('ArrowRight');
  await page.getByLabel('Tilt angle', { exact: true }).press('ArrowRight');
  await page.getByLabel('Focus width', { exact: true }).press('ArrowRight');
  await page.getByLabel('Transition feather', { exact: true }).press('ArrowRight');
  const changed = await pixels(page);
  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset]).toEqual(before.assets[sourceAsset]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({
    type: 'tilt-shift', amount: 70, radius: 6, centerX: 0.51, angle: 1,
    tiltShift: { focusWidth: 0.37, feather: 0.51 },
  });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('tilt-shift');
  await expect(page.getByLabel('Tilt angle', { exact: true })).toHaveValue('1');
  await expect(page.getByLabel('Focus width', { exact: true })).toHaveValue('37');
  await expect(page.getByLabel('Transition feather', { exact: true })).toHaveValue('51');
  await expect.poll(() => pixels(page)).toEqual(changed);
  await openProject(page, adjusted);
  await expect(page.getByLabel('Focus centre X', { exact: true })).toHaveValue('51');
  await expect.poll(() => pixels(page)).toEqual(changed);
  for (let index = 0; index < 5; index += 1) {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Undo/ }).click();
  }
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
  await expect.poll(() => pixels(page)).toEqual(original);
});

test('Ripple is enabled as an alpha-safe nondestructive Distort effect with centred controls', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const sourcePixel = await pixel(page, 4, 2);

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Ripple…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText('Ripple applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('ripple');
  await expect(page.getByLabel('Ripple center X', { exact: true })).toHaveValue('50');
  await expect(page.getByLabel('Ripple center Y', { exact: true })).toHaveValue('50');
  await page.getByLabel('Ripple center X', { exact: true }).press('ArrowRight');
  await page.getByLabel('Ripple center Y', { exact: true }).press('ArrowLeft');
  await expect(page.getByLabel('Ripple center X', { exact: true })).toHaveValue('51');
  await expect(page.getByLabel('Ripple center Y', { exact: true })).toHaveValue('49');
  await expect.poll(() => pixel(page, 4, 2)).not.toEqual(sourcePixel);
  expect((await pixel(page, 0, 0))[3]).toBe(0);

  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({
    type: 'ripple',
    centerX: 0.51,
    centerY: 0.49,
  });

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect.poll(() => pixel(page, 4, 2)).toEqual(sourcePixel);
});

test('Pinch is enabled as a nondestructive Distort effect with centred controls and round-trip persistence', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const sourcePixel = await pixel(page, 4, 2);

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Pinch…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText('Pinch applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('pinch');
  await expect(page.getByLabel('Pinch radius', { exact: true })).toHaveValue('40');
  await expect(page.getByLabel('Pinch center X', { exact: true })).toHaveValue('50');
  await expect(page.getByLabel('Pinch center Y', { exact: true })).toHaveValue('50');
  await page.getByLabel('Pinch center X', { exact: true }).press('ArrowRight');
  await page.getByLabel('Pinch radius', { exact: true }).press('ArrowRight');
  await expect(page.getByLabel('Pinch center X', { exact: true })).toHaveValue('51');
  await expect(page.getByLabel('Pinch radius', { exact: true })).toHaveValue('41');
  await expect.poll(() => pixel(page, 4, 2)).not.toEqual(sourcePixel);
  expect((await pixel(page, 0, 0))[3]).toBe(0);

  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({
    type: 'pinch',
    amount: 70,
    radius: 41,
    centerX: 0.51,
  });

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('pinch');
  await expect(page.getByLabel('Pinch center X', { exact: true })).toHaveValue('51');
  await openProject(page, adjusted);
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('pinch');
  await expect(page.getByLabel('Pinch radius', { exact: true })).toHaveValue('41');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
  await expect.poll(() => pixel(page, 4, 2)).toEqual(sourcePixel);
});

test('Wave is enabled as a directional Distort effect with editable wavelength and angle on desktop and mobile', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const sourcePixel = await pixel(page, 3, 2);

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Wave…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText('Wave applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('wave');
  await expect(page.getByLabel('Wave length', { exact: true })).toHaveValue('12');
  await expect(page.getByLabel('Wave angle', { exact: true })).toHaveValue('0');
  await page.getByLabel('Wave length', { exact: true }).press('ArrowRight');
  await page.getByLabel('Wave angle', { exact: true }).press('ArrowRight');
  await expect(page.getByLabel('Wave length', { exact: true })).toHaveValue('13');
  await expect(page.getByLabel('Wave angle', { exact: true })).toHaveValue('1');
  await expect.poll(() => pixel(page, 3, 2)).not.toEqual(sourcePixel);
  expect((await pixel(page, 0, 0))[3]).toBe(0);

  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({
    type: 'wave',
    amount: 70,
    radius: 13,
    angle: 1,
  });

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('wave');
  await expect(page.getByLabel('Wave length', { exact: true })).toHaveValue('13');
  await openProject(page, adjusted);
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('wave');
  await expect(page.getByLabel('Wave angle', { exact: true })).toHaveValue('1');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
  await expect.poll(() => pixel(page, 3, 2)).toEqual(sourcePixel);
});

test('Spherize is enabled as a nondestructive Distort effect with centred controls and round-trip persistence', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const sourcePixel = await pixel(page, 1, 2);

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Spherize…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText('Spherize applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('spherize');
  await expect(page.getByLabel('Spherize radius', { exact: true })).toHaveValue('40');
  await expect(page.getByLabel('Spherize center X', { exact: true })).toHaveValue('50');
  await expect(page.getByLabel('Spherize center Y', { exact: true })).toHaveValue('50');
  await page.getByLabel('Spherize radius', { exact: true }).press('ArrowRight');
  await page.getByLabel('Spherize center X', { exact: true }).press('ArrowRight');
  await expect(page.getByLabel('Spherize radius', { exact: true })).toHaveValue('41');
  await expect(page.getByLabel('Spherize center X', { exact: true })).toHaveValue('51');
  await expect.poll(() => pixel(page, 1, 2)).not.toEqual(sourcePixel);
  expect((await pixel(page, 0, 0))[3]).toBe(0);

  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({
    type: 'spherize',
    amount: 70,
    radius: 41,
    centerX: 0.51,
  });

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('spherize');
  await expect(page.getByLabel('Spherize center X', { exact: true })).toHaveValue('51');
  await openProject(page, adjusted);
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('spherize');
  await expect(page.getByLabel('Spherize radius', { exact: true })).toHaveValue('41');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
  await expect.poll(() => pixel(page, 1, 2)).toEqual(sourcePixel);
});

test('Lens Blur is editable, local, source-safe and alpha-preserving', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const sourcePixel = await pixel(page, 1, 0);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Lens Blur…', exact: true })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Lens Blur…', exact: true }).click();
  await expect(page.getByText('Lens Blur (local approximation) applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('lens-blur');
  await expect(page.getByLabel('Blur radius', { exact: true })).toHaveValue('6');
  await page.getByLabel('Blur radius', { exact: true }).press('ArrowRight');
  await expect.poll(() => pixel(page, 1, 0)).not.toEqual(sourcePixel);
  expect((await pixel(page, 0, 0))[3]).toBe(0);
  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({ type: 'lens-blur', radius: 7 });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('lens-blur');
});

test('Lens Flare exposes editable seeded geometry and preserves the source asset', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const sourcePixel = await pixel(page, 4, 2);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Lens Flare…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText('Lens Flare (local approximation) applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('lens-flare');
  await expect(page.getByLabel('Effect amount', { exact: true })).toHaveValue('75');
  await expect(page.getByLabel('Flare size', { exact: true })).toHaveValue('36');
  await expect(page.getByLabel('Flare centre X', { exact: true })).toHaveValue('50');
  await expect(page.getByLabel('Flare centre Y', { exact: true })).toHaveValue('50');
  await expect(page.getByLabel('Streak angle', { exact: true })).toHaveValue('0');
  await page.getByLabel('Flare centre X', { exact: true }).press('ArrowRight');
  await page.getByLabel('Streak angle', { exact: true }).press('ArrowRight');
  await expect.poll(() => pixel(page, 4, 2)).not.toEqual(sourcePixel);
  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({
    type: 'lens-flare', amount: 75, radius: 36, centerX: 0.51, angle: 1,
  });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('lens-flare');
  await expect(page.getByLabel('Streak angle', { exact: true })).toHaveValue('1');
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Undo/ }).click();
  }
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
  await expect.poll(() => pixel(page, 4, 2)).toEqual(sourcePixel);
});

test('Iris Blur exposes an editable elliptical focal plane and round-trips safely', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const sourcePixel = await pixel(page, 1, 0);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Iris Blur…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText('Iris Blur (elliptical focal approximation) applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('iris-blur');
  await expect(page.getByLabel('Blur radius', { exact: true })).toHaveValue('6');
  await expect(page.getByLabel('Focal centre X', { exact: true })).toHaveValue('50');
  await expect(page.getByLabel('Focal centre Y', { exact: true })).toHaveValue('50');
  await page.getByLabel('Focal centre X', { exact: true }).press('ArrowRight');
  await page.getByLabel('Blur radius', { exact: true }).press('ArrowRight');
  await expect(page.getByLabel('Focal centre X', { exact: true })).toHaveValue('51');
  await expect.poll(() => pixel(page, 1, 0)).not.toEqual(sourcePixel);
  expect((await pixel(page, 0, 0))[3]).toBe(0);
  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({ type: 'iris-blur', radius: 7, centerX: 0.51 });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('iris-blur');
});

test('Smart Blur exposes an editable edge-preserving effect and round-trips safely', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const sourcePixel = await pixel(page, 1, 0);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Smart Blur…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText('Smart Blur (edge-preserving approximation) applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('smart-blur');
  await expect(page.getByLabel('Blur radius', { exact: true })).toHaveValue('6');
  await page.getByLabel('Blur radius', { exact: true }).press('ArrowRight');
  await expect.poll(() => pixel(page, 1, 0)).not.toEqual(sourcePixel);
  expect((await pixel(page, 0, 0))[3]).toBe(0);
  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({ type: 'smart-blur', radius: 7 });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('smart-blur');
});

test('Surface Blur exposes an editable tonal-surface effect and round-trips safely', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const sourcePixel = await pixel(page, 1, 0);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Surface Blur…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText('Surface Blur (tonal-surface approximation) applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('surface-blur');
  await expect(page.getByLabel('Blur radius', { exact: true })).toHaveValue('6');
  await page.getByLabel('Blur radius', { exact: true }).press('ArrowRight');
  await expect.poll(() => pixel(page, 1, 0)).not.toEqual(sourcePixel);
  expect((await pixel(page, 0, 0))[3]).toBe(0);
  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({ type: 'surface-blur', radius: 7 });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('surface-blur');
});

test('Shape Blur exposes a deterministic aperture and round-trips safely', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const sourcePixel = await pixel(page, 1, 0);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Shape Blur…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText('Shape Blur (diamond aperture) applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('shape-blur');
  await expect(page.getByLabel('Blur radius', { exact: true })).toHaveValue('6');
  await page.getByLabel('Blur radius', { exact: true }).press('ArrowRight');
  await expect.poll(() => pixel(page, 1, 0)).not.toEqual(sourcePixel);
  expect((await pixel(page, 0, 0))[3]).toBe(0);
  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({ type: 'shape-blur', radius: 7 });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('shape-blur');
});

test('Fragment applies four offset copies and round-trips nondestructively', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const sourcePixel = await pixel(page, 4, 0);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Fragment', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText('Fragment applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('fragment');
  await expect(page.getByLabel('Fragment offset', { exact: true })).toHaveValue('1');
  await expect.poll(() => pixel(page, 4, 0)).not.toEqual(sourcePixel);
  expect((await pixel(page, 0, 0))[3]).toBe(0);
  await page.getByLabel('Fragment offset', { exact: true }).press('ArrowRight');
  await expect(page.getByLabel('Fragment offset', { exact: true })).toHaveValue('2');
  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({ type: 'fragment', amount: 100, radius: 2 });
  const changed = await pixel(page, 4, 0);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('fragment');
  await expect(page.getByLabel('Fragment offset', { exact: true })).toHaveValue('2');
  await expect.poll(() => pixel(page, 4, 0)).toEqual(changed);
  await openProject(page, adjusted);
  await expect.poll(() => pixel(page, 4, 0)).toEqual(changed);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('fragment');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
  await expect.poll(() => pixel(page, 4, 0)).toEqual(sourcePixel);
});

test('Mezzotint exposes seeded grain controls and round-trips nondestructively', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const original = await pixels(page);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Mezzotint…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText('Mezzotint applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('mezzotint');
  await expect(page.getByLabel('Cell size', { exact: true })).toHaveValue('10');
  await expect(page.getByLabel('Grain mode', { exact: true })).toHaveValue('medium');
  await expect(page.getByLabel('Random seed', { exact: true })).toHaveValue('0');
  await expect.poll(() => pixels(page)).not.toEqual(original);
  await page.getByLabel('Grain mode', { exact: true }).selectOption('coarse');
  await page.getByLabel('Random seed', { exact: true }).fill('1');
  await page.getByLabel('Cell size', { exact: true }).press('ArrowRight');
  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({
    type: 'mezzotint', amount: 85, radius: 11, seed: 1,
    mezzotint: { grain: 'coarse' },
  });
  expect((await pixel(page, 0, 0))[3]).toBe(0);
  const changed = await pixels(page);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('mezzotint');
  await expect(page.getByLabel('Cell size', { exact: true })).toHaveValue('11');
  await expect(page.getByLabel('Grain mode', { exact: true })).toHaveValue('coarse');
  await expect(page.getByLabel('Random seed', { exact: true })).toHaveValue('1');
  await expect.poll(() => pixels(page)).toEqual(changed);
  await openProject(page, adjusted);
  await expect(page.getByLabel('Grain mode', { exact: true })).toHaveValue('coarse');
  await expect.poll(() => pixels(page)).toEqual(changed);
  const highSeedProject = JSON.parse(JSON.stringify(adjusted));
  highSeedProject.history[highSeedProject.index].layers.at(-1)!.adjustments.filterEffects.seed = 4294967295;
  await openProject(page, highSeedProject);
  await expect(page.getByLabel('Random seed', { exact: true })).toHaveValue('4294967295');
  await openProject(page, adjusted);
  for (let index = 0; index < 4; index += 1) {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Undo/ }).click();
  }
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
  await expect.poll(() => pixels(page)).toEqual(original);
});
