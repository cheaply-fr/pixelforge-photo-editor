import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

type TextLayer = {
  kind: 'text';
  text: string;
  orientation?: 'horizontal' | 'vertical';
  fontSize: number;
  matrix: number[];
};
type Project = {
  history: Array<{ layers: TextLayer[] }>;
  index: number;
};

const prepare = async (page: Page) => {
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
  const download = await pending;
  return await downloadedProject((await download.path())!) as Project;
};

const bounds = async (page: Page) => page.getByTestId('editor-canvas').evaluate((node) => {
  const canvas = node as HTMLCanvasElement;
  const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
  for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
    if (data[(y * canvas.width + x) * 4 + 3] === 0) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return right < 0 ? { width: 0, height: 0 } : { width: right - left + 1, height: bottom - top + 1 };
});

const saved = async (page: Page) => {
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
};

const addText = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await selectTool(page, 'Text');
  await page.getByLabel('Text content', { exact: true }).fill('ABCD');
  const canvas = page.getByTestId('editor-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await expect(page.getByLabel('Text orientation', { exact: true })).toBeVisible();
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
};

test.beforeEach(async ({ page }) => prepare(page));

test('vertical type changes glyph flow, is menu-addressable, and round-trips on desktop and mobile', async ({ page }) => {
  await addText(page);
  await page.getByLabel('Layer font size', { exact: true }).fill('32');
  await page.getByLabel('Layer font size', { exact: true }).press('Enter');
  const horizontal = await bounds(page);
  expect(horizontal.width).toBeGreaterThan(horizontal.height);

  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Vertical Type', exact: true }).click();
  await expect(page.getByText('Layer updated', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Text orientation', { exact: true })).toHaveValue('vertical');
  await saved(page);
  const vertical = await bounds(page);
  expect(vertical.height).toBeGreaterThan(vertical.width);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByLabel('Text orientation', { exact: true })).toHaveValue('horizontal');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await expect(page.getByLabel('Text orientation', { exact: true })).toHaveValue('vertical');
  await saved(page);
  let exported = await project(page);
  const text = exported.history[exported.index].layers.find((layer) => layer.kind === 'text')!;
  expect(text).toMatchObject({ kind: 'text', orientation: 'vertical', text: 'ABCD' });

  await page.reload();
  await expect(page.getByLabel('Text orientation', { exact: true })).toHaveValue('vertical');
  exported = await project(page);
  expect(exported.history[exported.index].layers.find((layer) => layer.kind === 'text')).toMatchObject({ orientation: 'vertical' });

  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Horizontal Type', exact: true }).click();
  await expect(page.getByLabel('Text orientation', { exact: true })).toHaveValue('horizontal');
  await page.getByLabel('Text orientation', { exact: true }).selectOption('vertical');
  await saved(page);
  const reimport = await project(page);
  await page.getByLabel('Text orientation', { exact: true }).selectOption('horizontal');
  await saved(page);
  await page.getByTestId('project-input').setInputFiles({
    name: 'vertical-type.pixelforge',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(reimport)),
  });
  await expect(page.getByLabel('Text orientation', { exact: true })).toHaveValue('vertical');
  await expect(page.getByLabel('Edit layer text', { exact: true })).toHaveValue('ABCD');
  await saved(page);
  const imported = await bounds(page);
  expect(imported.height).toBeGreaterThan(imported.width);
});

test('vertical orientation is disabled for raster layers and text lock protects it', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Type', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Vertical Type', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await addText(page);
  await page.getByLabel('Lock layer', { exact: true }).check();
  await expect(page.getByLabel('Text orientation', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Vertical Type', exact: true })).toBeDisabled();
});
