import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { openPanel } from './sidebar-panels';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const WIDTH = 201;
const HEIGHT = 121;

const settled = (page: Page) =>
  expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });

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
    name: 'centres-and-stacks.png',
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

const digest = (page: Page) =>
  page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0x811c9dc5;
    for (let index = 0; index < data.length; index += 1) hash = Math.imul(hash ^ data[index], 0x01000193);
    return (hash >>> 0).toString(16);
  });

async function project(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return downloadedProject((await (await pending).path())!);
}

const stackNames = (page: Page) =>
  page.getByRole('list', { name: 'Stacked filters' }).getByRole('listitem').locator('span').allTextContents();

test('several filters stack on one raster layer with toggle, reorder, remove, undo and reload', async ({ page }) => {
  test.setTimeout(120_000);
  await importFixture(page);
  const original = await digest(page);
  const add = page.getByRole('button', { name: /^Add filter to stack/ });
  await expect(add).toBeDisabled();

  await filter(page, 'Mosaic…');
  await expect(add).toHaveText('Add filter to stack (0/8)');
  await add.click();
  await settled(page);
  await openPanel(page, 'Filters');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
  await expect.poll(() => stackNames(page)).toEqual(['1. Mosaic']);

  // A second, different filter on the same layer without rasterizing.
  await filter(page, 'Emboss…');
  await add.click();
  await settled(page);
  await expect.poll(() => stackNames(page)).toEqual(['1. Mosaic', '2. Emboss']);
  const both = await digest(page);
  expect(both).not.toBe(original);

  const hideEmboss = page.getByRole('button', { name: 'Hide stacked filter 2. Emboss', exact: true });
  await hideEmboss.click();
  await settled(page);
  const showEmboss = page.getByRole('button', { name: 'Show stacked filter 2. Emboss', exact: true });
  await expect(showEmboss).toHaveAttribute('aria-pressed', 'false');
  const mosaicOnly = await digest(page);
  expect(mosaicOnly).not.toBe(both);
  await showEmboss.click();
  await settled(page);
  await expect.poll(() => digest(page)).toBe(both);

  await page.getByRole('button', { name: 'Apply stacked filter 2. Emboss earlier', exact: true }).click();
  await settled(page);
  await expect.poll(() => stackNames(page)).toEqual(['1. Emboss', '2. Mosaic']);
  await expect(page.getByRole('button', { name: 'Apply stacked filter 1. Emboss earlier', exact: true })).toBeDisabled();
  const reordered = await digest(page);
  expect(reordered).not.toBe(both);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await settled(page);
  await expect.poll(() => stackNames(page)).toEqual(['1. Mosaic', '2. Emboss']);
  await expect.poll(() => digest(page)).toBe(both);

  await page.getByRole('button', { name: 'Remove stacked filter 1. Mosaic', exact: true }).click();
  await settled(page);
  await expect.poll(() => stackNames(page)).toEqual(['1. Emboss']);
  const embossOnly = await digest(page);
  await page.getByRole('button', { name: 'Hide stacked filter 1. Emboss', exact: true }).click();
  await settled(page);
  await expect.poll(() => digest(page)).toBe(original);

  const saved = await project(page);
  const layer = saved.history[saved.index].layers.at(-1);
  expect(layer.smartFilters).toHaveLength(1);
  expect(layer.smartFilters[0]).toMatchObject({ type: 'emboss', enabled: false });
  const sourceAsset = layer.asset;

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await settled(page);
  await expect.poll(() => stackNames(page)).toEqual(['1. Emboss']);
  await expect(page.getByRole('button', { name: 'Show stacked filter 1. Emboss', exact: true })).toBeVisible();
  await expect.poll(() => digest(page)).toBe(original);
  await page.getByRole('button', { name: 'Show stacked filter 1. Emboss', exact: true }).click();
  await settled(page);
  await expect.poll(() => digest(page)).toBe(embossOnly);
  const after = await project(page);
  expect(after.history[after.index].layers.at(-1).asset).toBe(sourceAsset);
});

test('Radial Blur centre is placed on the canvas with sub-percent precision and keyboard nudges', async ({ page }) => {
  test.setTimeout(120_000);
  await importFixture(page);
  await filter(page, 'Radial Blur…');
  const handle = page.getByTestId('filter-center-handle');
  await expect(handle).toBeVisible();
  await expect(handle).toHaveAttribute('data-center-x', '0.5');

  // Drag to roughly one quarter across and three quarters down.
  const canvasBox = (await page.getByTestId('editor-canvas').boundingBox())!;
  const handleBox = (await handle.boundingBox())!;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.4, canvasBox.y + canvasBox.height * 0.6, { steps: 4 });
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.25, canvasBox.y + canvasBox.height * 0.75, { steps: 4 });
  await page.mouse.up();
  await settled(page);
  const dragged = Number(await handle.getAttribute('data-center-x'));
  const draggedY = Number(await handle.getAttribute('data-center-y'));
  expect(Math.abs(dragged - 0.25)).toBeLessThan(0.03);
  expect(Math.abs(draggedY - 0.75)).toBeLessThan(0.03);
  const afterDrag = await digest(page);

  // Keyboard: one pixel, then ten pixels, both exact in layer pixels.
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => Number(await handle.getAttribute('data-center-x'))).toBeCloseTo(dragged + 1 / (WIDTH - 1), 5);
  await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(async () => Number(await handle.getAttribute('data-center-x'))).toBeCloseTo(dragged - 9 / (WIDTH - 1), 5);
  await settled(page);
  expect(await digest(page)).not.toBe(afterDrag);
  await page.keyboard.press('Home');
  await expect(handle).toHaveAttribute('data-center-x', '0.5');
  await expect(handle).toHaveAttribute('data-center-y', '0.5');

  // Exact sub-pixel entry: 66.6 px of a 200 px span is 33.3 %, not 33 %.
  await page.getByLabel('Filter center X in pixels', { exact: true }).fill('66.6');
  await expect(handle).toHaveAttribute('data-center-x', '0.333');
  await settled(page);
  const saved = await project(page);
  expect(saved.history[saved.index].layers.at(-1).adjustments.filterEffects).toMatchObject({
    type: 'radial-blur',
    centerX: 0.333,
    centerY: 0.5,
  });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByTestId('filter-center-handle')).toHaveAttribute('data-center-x', '0.333');
  await expect(page.getByLabel('Filter center X in pixels', { exact: true })).toHaveValue('66.6');
});
