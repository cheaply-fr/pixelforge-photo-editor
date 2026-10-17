import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

type Asset = { url: string; w: number; h: number };
type Project = {
  settings: Record<string, unknown>;
  history: Array<{ layers: Array<{ asset?: string; locked?: boolean }> }>;
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
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
};

const project = async (page: Page): Promise<Project> => {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as Project;
};

const fixture = async (page: Page) => page.evaluate(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = 60;
  const context = canvas.getContext('2d')!;
  for (let x = 0; x < canvas.width; x += 1) {
    const value = x < 60 ? 36 : 220;
    context.fillStyle = `rgba(${value},${value},${value},1)`;
    context.fillRect(x, 0, 1, canvas.height);
  }
  return canvas.toDataURL().split(',')[1];
});

const importFixture = async (page: Page) => {
  await page.getByTestId('file-input').setInputFiles({
    name: 'retouch-edge.png',
    mimeType: 'image/png',
    buffer: Buffer.from(await fixture(page), 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '120');
};

const activeAsset = (value: Project) => {
  const layer = value.history[value.index].layers.at(-1)!;
  return value.assets[layer.asset!]!;
};

const sample = async (page: Page, asset: Asset, x: number) => page.evaluate(async ({ asset, x }) => {
  const image = new Image();
  image.src = asset.url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = asset.w;
  canvas.height = asset.h;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  return Array.from(context.getImageData(Math.floor(asset.w * x), Math.floor(asset.h / 2), 1, 1).data);
}, { asset, x });

const stroke = async (page: Page, startX = 0.35, endX = 0.65, pointerId = 401) => {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  const start = { clientX: box.x + box.width * startX, clientY: box.y + box.height * 0.5 };
  const end = { clientX: box.x + box.width * endX, clientY: box.y + box.height * 0.5 };
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', { pointerId, pointerType: 'mouse', pressure: 1, ...start, buttons: 1, isPrimary: true });
  await page.waitForTimeout(80);
  await canvas.dispatchEvent('pointermove', { pointerId, pointerType: 'mouse', pressure: 1, ...end, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointerup', { pointerId, pointerType: 'mouse', pressure: 1, ...end, buttons: 0, isPrimary: true });
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
};

test.beforeEach(async ({ page }) => openEditor(page));

test('Blur and Sharpen share the Photoshop R flyout with visible subtool icons', async ({ page }) => {
  await importFixture(page);
  await selectTool(page, 'Blur');
  await expect(page.getByRole('button', { name: 'Blur tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Blur tool', exact: true }).click({ button: 'right' });
  const flyout = page.locator('.tool-flyout[role="menu"]');
  await expect(flyout).toBeVisible();
  await expect(flyout.getByRole('menuitem', { name: 'Sharpen', exact: true }).locator('svg')).toBeVisible();
  await flyout.getByRole('menuitem', { name: 'Sharpen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sharpen tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('r');
  await expect(page.getByRole('button', { name: 'Rotate View tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Shift+r');
  await expect(page.getByRole('button', { name: 'Sharpen tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('Blur changes a raster edge, creates one undo step, and reloads safely', async ({ page }) => {
  await importFixture(page);
  const before = await project(page);
  const beforeAsset = activeAsset(before);
  const beforeEdge = await sample(page, beforeAsset, 0.5);
  await selectTool(page, 'Blur');
  await page.getByLabel('Size', { exact: true }).fill('36');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Flow', { exact: true }).fill('100');
  await stroke(page);
  const after = await project(page);
  const afterAsset = activeAsset(after);
  expect(after.history.length).toBe(before.history.length + 1);
  expect(afterAsset.url).not.toBe(beforeAsset.url);
  expect(await sample(page, afterAsset, 0.5)).not.toEqual(beforeEdge);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  expect(activeAsset(await project(page)).url).toBe(beforeAsset.url);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await page.reload();
  expect(activeAsset(await project(page)).url).toBe(afterAsset.url);
});

test('Sharpen keeps the source immutable and refuses locked layers without history changes', async ({ page }) => {
  await importFixture(page);
  await selectTool(page, 'Sharpen');
  await page.getByLabel('Size', { exact: true }).fill('36');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Flow', { exact: true }).fill('100');
  const before = await project(page);
  const sourceUrl = activeAsset(before).url;
  await stroke(page);
  const after = await project(page);
  expect(after.history.length).toBe(before.history.length + 1);
  expect(after.assets[before.history[before.index].layers.at(-1)!.asset!].url).toBe(sourceUrl);
  await page.getByLabel('Lock layer', { exact: true }).check();
  const locked = await project(page);
  await stroke(page, 0.4, 0.6, 402);
  await expect(page.locator('footer')).toContainText('visible, unlocked raster layer');
  expect((await project(page)).history.length).toBe(locked.history.length);
});
