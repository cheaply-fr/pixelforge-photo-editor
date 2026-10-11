import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

const startEditor = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Saved on this device');
};

const downloadProject = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const download = await pending;
  const path = await download.path();
  return {
    path: path!,
    value: await downloadedProject(path!),
  } as {
    path: string;
    value: {
      history: Array<{
        layers: Array<{
          kind: string;
          asset?: string;
          mask?: string;
          maskEnabled?: boolean;
          maskInverted?: boolean;
        }>;
      }>;
      index: number;
      assets: Record<string, { url: string; w: number; h: number }>;
    };
  };
};

const createSelectionMask = async (page: Page) => {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await selectTool(page, 'Select');
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, {
    steps: 5,
  });
  await page.mouse.up();
  await page
    .getByRole('button', { name: 'Mask from selection', exact: true })
    .click();
  await expect(
    page.getByText('Nondestructive mask active', { exact: true }),
  ).toBeVisible();
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
};

test.beforeEach(async ({ page }) => startEditor(page));

test('layer mask metadata is nondestructive, invertible and source-stable across history and reload', async ({
  page,
}) => {
  await createSelectionMask(page);
  let exported = await downloadProject(page);
  let frame = exported.value.history[exported.value.index];
  const layer = frame.layers[0],
    sourceAsset = exported.value.assets[layer.asset!];
  const sourceUrl = sourceAsset.url;
  expect(layer.mask).toEqual(expect.any(String));
  expect(layer.maskEnabled).toBe(true);
  expect(layer.maskInverted).toBe(false);
  const maskAsset = exported.value.assets[layer.mask!];
  const canvas = page.getByTestId('editor-canvas');
  const before = await canvas.evaluate((item: HTMLCanvasElement) => ({
    inside: item
      .getContext('2d')!
      .getImageData(
        Math.floor(item.width * 0.45),
        Math.floor(item.height * 0.45),
        1,
        1,
      ).data[3],
    outside: item
      .getContext('2d')!
      .getImageData(
        Math.floor(item.width * 0.05),
        Math.floor(item.height * 0.05),
        1,
        1,
      ).data[3],
  }));
  expect(before.inside).toBeGreaterThan(0);
  expect(before.outside).toBe(0);

  await page.getByRole('button', { name: 'Invert mask', exact: true }).click();
  await expect(
    page.getByText('Layer mask inverted', { exact: true }),
  ).toBeVisible();
  exported = await downloadProject(page);
  frame = exported.value.history[exported.value.index];
  expect(frame.layers[0].mask).toBe(layer.mask);
  expect(frame.layers[0].maskInverted).toBe(true);
  expect(exported.value.assets[frame.layers[0].asset!].url).toBe(sourceUrl);
  expect(exported.value.assets[frame.layers[0].mask!].url).toBe(maskAsset.url);
  const inverted = await canvas.evaluate((item: HTMLCanvasElement) => ({
    inside: item
      .getContext('2d')!
      .getImageData(
        Math.floor(item.width * 0.45),
        Math.floor(item.height * 0.45),
        1,
        1,
      ).data[3],
    outside: item
      .getContext('2d')!
      .getImageData(
        Math.floor(item.width * 0.05),
        Math.floor(item.height * 0.05),
        1,
        1,
      ).data[3],
  }));
  expect(inverted.inside).toBe(0);
  expect(inverted.outside).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Disable mask', exact: true }).click();
  await expect(
    page.getByText('Layer mask disabled', { exact: true }),
  ).toBeVisible();
  exported = await downloadProject(page);
  frame = exported.value.history[exported.value.index];
  expect(frame.layers[0].maskEnabled).toBe(false);
  const disabled = await canvas.evaluate(
    (item: HTMLCanvasElement) =>
      item.getContext('2d')!.getImageData(2, 2, 1, 1).data[3],
  );
  expect(disabled).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(
    page.getByText('Layer mask disabled', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Disable mask', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText('Nondestructive mask active', { exact: true }),
  ).toBeVisible();
  exported = await downloadProject(page);
  frame = exported.value.history[exported.value.index];
  expect(frame.layers[0].maskInverted).toBe(true);
  expect(frame.layers[0].maskEnabled).toBe(true);
  await page.getByTestId('project-input').setInputFiles(exported.path);
  await expect(
    page.getByText('Nondestructive mask active', { exact: true }),
  ).toBeVisible();
  const imported = await downloadProject(page);
  expect(imported.value.history[imported.value.index].layers[0].mask).toBe(
    layer.mask,
  );
});

test('mask controls are guarded for locked, hidden and non-raster layers and removal clears metadata', async ({
  page,
}) => {
  await createSelectionMask(page);
  await page.getByLabel('Lock layer', { exact: true }).check();
  await expect(
    page.getByRole('button', { name: 'Invert mask', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Disable mask', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Remove mask', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Lock layer', { exact: true }).uncheck();
  await page.getByLabel('Visible', { exact: true }).uncheck();
  await expect(
    page.getByRole('button', { name: 'Invert mask', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Visible', { exact: true }).check();
  await page.getByRole('button', { name: 'Invert mask', exact: true }).click();
  await expect(
    page.getByText('Layer mask inverted', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Visible', { exact: true }).check();
  await page.getByRole('button', { name: 'Remove mask', exact: true }).click();
  await expect(
    page.getByText('Nondestructive mask active', { exact: true }),
  ).toHaveCount(0);
  const removed = await downloadProject(page);
  const removedLayer = removed.value.history[removed.value.index].layers[0];
  expect(removedLayer.mask).toBeUndefined();
  expect(removedLayer.maskEnabled).toBeUndefined();
  expect(removedLayer.maskInverted).toBeUndefined();

  await selectTool(page, 'Text');
  await page.getByTestId('editor-canvas').click({ position: { x: 50, y: 50 } });
  await expect(
    page.getByRole('button', { name: 'Mask from selection', exact: true }),
  ).toBeDisabled();
});

test('Layer menu commands invert, disable and remove a raster mask', async ({
  page,
}) => {
  await createSelectionMask(page);
  const openLayerMenu = async () => {
    await page.getByRole('button', { name: 'Layer', exact: true }).click();
    await expect(page.getByRole('menu', { name: 'Layer menu' })).toBeVisible();
  };
  await openLayerMenu();
  await page
    .getByRole('menuitem', { name: 'Invert Layer Mask', exact: true })
    .click();
  await expect(
    page.getByText('Layer mask inverted', { exact: true }),
  ).toBeVisible();
  await openLayerMenu();
  await page
    .getByRole('menuitem', { name: 'Disable Layer Mask', exact: true })
    .click();
  await expect(
    page.getByText('Layer mask disabled', { exact: true }),
  ).toBeVisible();
  await openLayerMenu();
  await page
    .getByRole('menuitem', { name: 'Remove Layer Mask', exact: true })
    .click();
  await expect(
    page.getByText('Nondestructive mask active', { exact: true }),
  ).toHaveCount(0);
  await openLayerMenu();
  await expect(
    page.getByRole('menuitem', { name: 'Invert Layer Mask', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
});
