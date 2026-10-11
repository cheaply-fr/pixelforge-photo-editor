import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

const beforeEachEditor = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );
};

const project = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const download = await pending;
  const path = await download.path();
  return await downloadedProject(path!) as {
    history: Array<{
      w: number;
      h: number;
      layers: Array<{ kind: string; asset?: string; mask?: string }>;
      selection?: {
        feather: number;
        parts?: Array<{ operation: string }>;
      };
    }>;
    index: number;
    assets: Record<string, { url: string; w: number; h: number }>;
  };
};

const saved = async (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );

const dragCanvas = async (
  page: Page,
  start: [number, number],
  end: [number, number],
) => {
  const canvas = page.getByTestId('editor-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * start[0], box.y + box.height * start[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * end[0], box.y + box.height * end[1], {
    steps: 5,
  });
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
};

const assetPixel = async (
  page: Page,
  asset: { url: string; w: number; h: number },
  xRatio = 0.5,
  yRatio = 0.5,
) =>
  page.evaluate(
    async ({ asset, xRatio, yRatio }) => {
      const image = new Image();
      image.src = asset.url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = asset.w;
      canvas.height = asset.h;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const x = Math.max(0, Math.min(asset.w - 1, Math.floor(asset.w * xRatio)));
      const y = Math.max(0, Math.min(asset.h - 1, Math.floor(asset.h * yRatio)));
      return Array.from(context.getImageData(x, y, 1, 1).data);
    },
    { asset, xRatio, yRatio },
  );

const maskAlphaAt = async (
  page: Page,
  asset: { url: string; w: number; h: number },
  xRatio: number,
  yRatio = 0.5,
) => (await assetPixel(page, asset, xRatio, yRatio))[3];

test.beforeEach(async ({ page }) => beforeEachEditor(page));

test('eraser removes raster alpha, supports undo/redo, and persists through reload', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'New transparent document', exact: true })
    .click();
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await page.getByLabel('Drawing color', { exact: true }).fill('#e11a2b');
  await selectTool(page, 'Brush');
  await page.getByLabel('Size', { exact: true }).fill('80');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await dragCanvas(page, [0.35, 0.5], [0.65, 0.5]);
  await saved(page);
  let exported = await project(page);
  let frame = exported.history[exported.index];
  const painted = frame.layers.at(-1)!;
  const paintedAsset = exported.assets[painted.asset!];
  expect(painted.kind).toBe('raster');
  expect((await assetPixel(page, paintedAsset))[3]).toBeGreaterThan(200);

  await selectTool(page, 'Eraser');
  await dragCanvas(page, [0.35, 0.5], [0.65, 0.5]);
  await saved(page);
  exported = await project(page);
  frame = exported.history[exported.index];
  const erased = frame.layers.at(-1)!;
  expect((await assetPixel(page, exported.assets[erased.asset!]))[3]).toBe(0);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await saved(page);
  exported = await project(page);
  frame = exported.history[exported.index];
  expect((await assetPixel(page, exported.assets[frame.layers.at(-1)!.asset!]))[3]).toBeGreaterThan(200);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await saved(page);
  await page.reload();
  await saved(page);
  exported = await project(page);
  frame = exported.history[exported.index];
  expect((await assetPixel(page, exported.assets[frame.layers.at(-1)!.asset!]))[3]).toBe(0);
});

test('selection subtract and intersect compose deterministic alpha masks', async ({
  page,
}) => {
  const buildSelection = async (operation: 'subtract' | 'intersect') => {
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page
      .getByRole('menuitem', { name: /^New white document/ })
      .click();
    await selectTool(page, 'Select');
    await dragCanvas(page, [0.1, 0.15], [0.6, 0.85]);
    await page.getByLabel('Selection mode', { exact: true }).selectOption(operation);
    await dragCanvas(page, [0.4, 0.15], [0.9, 0.85]);
    await page.getByRole('button', { name: 'Mask from selection', exact: true }).click();
    await expect(page.getByText('Nondestructive mask active', { exact: true })).toBeVisible();
    await saved(page);
    const exported = await project(page);
    const frame = exported.history[exported.index];
    const selection = frame.selection as {
      parts: Array<{ operation: string }>;
    };
    expect(selection.parts.map((part) => part.operation)).toEqual([
      'replace',
      operation,
    ]);
    const layer = frame.layers[0];
    return exported.assets[layer.mask!];
  };

  const subtractMask = await buildSelection('subtract');
  expect(await maskAlphaAt(page, subtractMask, 0.2)).toBeGreaterThan(200);
  expect(await maskAlphaAt(page, subtractMask, 0.5)).toBe(0);

  const intersectMask = await buildSelection('intersect');
  expect(await maskAlphaAt(page, intersectMask, 0.2)).toBe(0);
  expect(await maskAlphaAt(page, intersectMask, 0.5)).toBeGreaterThan(200);
  expect(await maskAlphaAt(page, intersectMask, 0.8)).toBe(0);
  await page.reload();
  await saved(page);
  const roundTrip = await project(page);
  expect(roundTrip.history[roundTrip.index].selection?.parts?.map((part) => part.operation)).toEqual([
    'replace',
    'intersect',
  ]);
});

test('feathered selections preserve intermediate edge alpha and survive reload', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page
    .getByRole('menuitem', { name: /^New white document/ })
      .click();
  await selectTool(page, 'Select');
  await dragCanvas(page, [0.25, 0.2], [0.75, 0.8]);
  await page.getByLabel('Selection feather', { exact: true }).fill('40');
  await expect(page.getByText('Selection feather set to 40 px', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mask from selection', exact: true }).click();
  await saved(page);
  let exported = await project(page);
  let frame = exported.history[exported.index];
  const selection = frame.selection!;
  expect(selection.feather).toBe(40);
  const mask = exported.assets[frame.layers[0].mask!];
  const samples = await Promise.all([
    maskAlphaAt(page, mask, 0.2),
    maskAlphaAt(page, mask, 0.25),
    maskAlphaAt(page, mask, 0.5),
    maskAlphaAt(page, mask, 0.8),
  ]);
  // Canvas blur has a soft tail outside the geometric edge; it must remain
  // substantially weaker than the interior rather than being hard-clipped.
  expect(samples[0]).toBeLessThan(100);
  expect(samples[2]).toBeGreaterThan(200);
  expect(samples.some((value) => value > 0 && value < 255)).toBe(true);
  await page.reload();
  await saved(page);
  exported = await project(page);
  frame = exported.history[exported.index];
  expect(frame.selection?.feather).toBe(40);
  expect(frame.layers[0].mask).toBeTruthy();
});
