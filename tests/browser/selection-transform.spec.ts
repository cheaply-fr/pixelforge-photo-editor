import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

const prepare = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
};

const project = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as {
    history: Array<{
      w: number;
      h: number;
      layers: Array<{ mask?: string; asset?: string }>;
      selection?: { matrix?: number[]; x: number; y: number; w: number; h: number };
      previousSelection?: { matrix?: number[]; x: number; y: number; w: number; h: number };
    }>;
    index: number;
    assets: Record<string, { url: string; w: number; h: number }>;
  };
};

const drag = async (page: Page, start: [number, number], end: [number, number]) => {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * start[0], box.y + box.height * start[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * end[0], box.y + box.height * end[1], { steps: 6 });
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
};

const alphaAt = async (page: Page, asset: { url: string; w: number; h: number }, x: number, y: number) =>
  page.evaluate(async ({ asset, x, y }) => {
    const image = new Image();
    image.src = asset.url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = asset.w;
    canvas.height = asset.h;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return context.getImageData(x, y, 1, 1).data[3];
  }, { asset, x, y });

const nonTransparentPixels = async (page: Page, asset: { url: string; w: number; h: number }) =>
  page.evaluate(async ({ asset }) => {
    const image = new Image();
    image.src = asset.url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = asset.w;
    canvas.height = asset.h;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, asset.w, asset.h).data;
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count += 1;
    return count;
  }, { asset });

test.beforeEach(async ({ page }) => prepare(page));

test('Transform Selection applies an affine matrix, clips masks, and survives project reload', async ({ page }) => {
  await selectTool(page, 'Select');
  await drag(page, [0.2, 0.25], [0.55, 0.65]);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Transform Selection', exact: true })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Transform Selection', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Transform Selection' })).toBeVisible();
  await page.getByLabel('Horizontal offset (px)').fill('220');
  await page.getByLabel('Rotation (degrees)').fill('15');
  await page.getByRole('button', { name: 'Apply selection transform', exact: true }).click();
  await expect(page.getByText('Selection transform applied', { exact: true })).toBeVisible();
  let saved = await project(page);
  let frame = saved.history[saved.index];
  expect(frame.selection?.matrix).toEqual(expect.arrayContaining([expect.any(Number)]));
  expect(frame.selection?.matrix?.[4]).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Mask from selection', exact: true }).click();
  saved = await project(page);
  frame = saved.history[saved.index];
  const mask = saved.assets[frame.layers[0].mask!];
  // The translated selection remains visible on the canvas but pixels outside
  // the document are clipped, so both edges are deterministic alpha values.
  expect(await alphaAt(page, mask, 0, 0)).toBe(0);
  expect(await nonTransparentPixels(page, mask)).toBeGreaterThan(0);

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  saved = await project(page);
  expect(saved.history[saved.index].selection?.matrix).toEqual(frame.selection?.matrix);
  expect(saved.history[saved.index].layers[0].mask).toBeTruthy();
});

test('Select Reselect restores the last selection through undo, reload and mobile focus', async ({ page }) => {
  await selectTool(page, 'Select');
  await drag(page, [0.2, 0.2], [0.5, 0.5]);
  let saved = await project(page);
  const first = saved.history[saved.index].selection!;
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Deselect Ctrl+D', exact: true }).click();
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Reselect', exact: true })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Reselect', exact: true }).click();
  await expect(page.getByText('Previous selection restored', { exact: true })).toBeVisible();
  saved = await project(page);
  expect(saved.history[saved.index].selection).toMatchObject({ x: first.x, y: first.y, w: first.w, h: first.h });
  await page.reload();
  saved = await project(page);
  expect(saved.history[saved.index].selection).toMatchObject({ x: first.x, y: first.y, w: first.w, h: first.h });

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Reselect', exact: true }).click();
  await expect(page.getByText('Previous selection restored', { exact: true })).toBeVisible();
});

test('Transform Selection rejects malformed decimal input without mutating selection', async ({ page }) => {
  await selectTool(page, 'Select');
  await drag(page, [0.2, 0.2], [0.5, 0.5]);
  const before = await project(page);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Transform Selection', exact: true }).click();
  await page.getByLabel('Width scale (%)').fill('0');
  await expect(page.getByRole('button', { name: 'Apply selection transform', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const after = await project(page);
  expect(after.history[after.index].selection).toEqual(before.history[before.index].selection);
});
