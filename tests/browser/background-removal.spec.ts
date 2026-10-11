import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

type Asset = { url: string; w: number; h: number };
type Project = {
  settings: Record<string, unknown>;
  history: Array<{
    layers: Array<{ kind: string; asset?: string; mask?: string }>;
  }>;
  index: number;
  assets: Record<string, Asset>;
};

const openEditor = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
};

const project = async (page: Page): Promise<Project> => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const file = await (await pending).path();
  return await downloadedProject(file!) as Project;
};

const fixture = [
  [40, 40, 40, 255], [40, 40, 40, 255], [40, 40, 40, 255], [40, 40, 40, 255], [40, 40, 40, 255],
  [40, 40, 40, 255], [210, 40, 30, 255], [210, 40, 30, 255], [210, 40, 30, 255], [40, 40, 40, 255],
  [40, 40, 40, 255], [210, 40, 30, 255], [210, 40, 30, 180], [210, 40, 30, 255], [40, 40, 40, 255],
  [40, 40, 40, 255], [210, 40, 30, 255], [210, 40, 30, 255], [210, 40, 30, 255], [40, 40, 40, 255],
  [40, 40, 40, 255], [40, 40, 40, 255], [40, 40, 40, 255], [40, 40, 40, 255], [40, 40, 40, 255],
];

const importFixture = async (page: Page) => {
  const encoded = await page.evaluate((values) => {
    const canvas = document.createElement('canvas');
    canvas.width = 5;
    canvas.height = 5;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(5, 5);
    values.flat().forEach((value, index) => { image.data[index] = value; });
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  }, fixture);
  await page.getByTestId('file-input').setInputFiles({
    name: 'background-removal-fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
};

const sampleAsset = async (page: Page, asset: Asset, points: Array<[number, number]>) =>
  page.evaluate(async ({ asset, points }) => {
    const image = new Image();
    image.src = asset.url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = asset.w;
    canvas.height = asset.h;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return points.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data));
  }, { asset, points });

const sampleCanvasPixel = (page: Page, x: number, y: number) =>
  page.getByTestId('editor-canvas').evaluate(
    (canvas: HTMLCanvasElement, point) =>
      Array.from(canvas.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data),
    { x, y },
  );

test.beforeEach(async ({ page }) => openEditor(page));

test('Remove Background creates a local nondestructive mask, preserves source pixels and survives reload', async ({ page }) => {
  await importFixture(page);
  const before = await project(page);
  const beforeLayer = before.history[before.index].layers.at(-1)!;
  expect(beforeLayer.mask).toBeUndefined();

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Remove Background…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.locator('footer')).toContainText('Background removed nondestructively', { timeout: 10000 });

  const after = await project(page);
  const afterLayer = after.history[after.index].layers.at(-1)!;
  expect(afterLayer.asset).toBe(beforeLayer.asset);
  expect(afterLayer.mask).toBeTruthy();
  expect(after.assets[afterLayer.asset!]).toEqual(before.assets[beforeLayer.asset!]);
  const [edge, subject] = await sampleAsset(page, after.assets[afterLayer.mask!], [[0, 0], [2, 2]]);
  expect(edge[3]).toBe(0);
  expect(subject[3]).toBe(255);
  // Mask alpha is coverage. It must not attenuate the source's existing 180
  // alpha a second time in the compositor.
  expect((await sampleCanvasPixel(page, 2, 2))[3]).toBe(180);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  const undone = await project(page);
  expect(undone.history[undone.index].layers.at(-1)!.mask).toBeUndefined();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Remove Background…', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  // Mobile IndexedDB restore can finish a render one frame after the saved
  // label changes; let the restored document settle before exporting it.
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  await page.waitForTimeout(100);
  const reloaded = await project(page);
  expect(reloaded.history[reloaded.index].layers.at(-1)!.mask).toBeTruthy();
});

test('Remove Background is disabled for locked layers and remains local', async ({ page }) => {
  await importFixture(page);
  await page.getByLabel('Lock layer', { exact: true }).check();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Remove Background…', exact: true })).toBeDisabled();
});

test('Remove Background segments native raster bounds before mapping a translated layer mask', async ({ page }) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  const encoded = await page.evaluate((values) => {
    const canvas = document.createElement('canvas');
    canvas.width = 5;
    canvas.height = 5;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(5, 5);
    values.flat().forEach((value, index) => { image.data[index] = value; });
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  }, fixture);
  await page.getByTestId('layer-input').setInputFiles({
    name: 'small-background-fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  await page.getByLabel('Layer X', { exact: true }).fill('300');
  await page.getByLabel('Layer X', { exact: true }).press('Enter');
  await page.getByLabel('Layer Y', { exact: true }).fill('200');
  await page.getByLabel('Layer Y', { exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Remove Background…', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Background removed nondestructively', { timeout: 10000 });
  const after = await project(page);
  const layer = after.history[after.index].layers.at(-1)!;
  const mask = after.assets[layer.mask!];
  expect(mask.w).toBe(1200);
  expect(mask.h).toBe(800);
  const [edge, subject] = await sampleAsset(page, mask, [[300, 200], [302, 202]]);
  expect(edge[3]).toBe(0);
  expect(subject[3]).toBe(255);
  expect((await sampleCanvasPixel(page, 302, 202))[3]).toBe(180);
});
