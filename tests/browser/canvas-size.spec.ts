import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

const startEditor = async (page: Page) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
};
const openImageItem = async (page: Page, name: string) => {
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
};
const dimensions = (page: Page) => page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => ({ width: canvas.width, height: canvas.height }));

 test.beforeEach(async ({ page }) => startEditor(page));

test('Canvas Size exposes an accessible responsive anchor dialog and rejects invalid dimensions', async ({ page }) => {
  await openImageItem(page, 'Canvas Size…');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Canvas Size', exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Anchor', { exact: true })).toHaveValue('center');
  await expect(dialog.getByLabel('Canvas anchor preview', { exact: true })).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull(); expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  await dialog.getByLabel('Width (px)', { exact: true }).fill('0');
  await expect(dialog.getByRole('button', { name: 'Apply canvas size', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('alert')).toContainText('16 megapixels');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect.poll(() => dimensions(page)).toEqual({ width: 1440, height: 960 });
});

test('Canvas Size honors anchors, keeps pixels unscaled, supports undo and reload persistence', async ({ page }) => {
  await openImageItem(page, 'Canvas Size…');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Width (px)', { exact: true }).fill('1000');
  await dialog.getByLabel('Height (px)', { exact: true }).fill('700');
  await dialog.getByLabel('Anchor', { exact: true }).selectOption('bottom-right');
  await dialog.getByRole('button', { name: 'Apply canvas size', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1000');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('height', '700');
  await expect(page.locator('footer')).toContainText('Canvas changed to 1000 × 700');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1000');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1440');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('height', '960');
});

test('Canvas Size cancel leaves dimensions unchanged and records no history edit', async ({ page }) => {
  const before = await dimensions(page);
  await openImageItem(page, 'Canvas Size…');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Width (px)', { exact: true }).fill('600');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect.poll(() => dimensions(page)).toEqual(before);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Undo/ })).toBeDisabled();

  // Applying the current dimensions is also a no-op and must not create an
  // undo frame that would obscure the user's previous edit.
  await openImageItem(page, 'Canvas Size…');
  await page.getByRole('dialog').getByRole('button', { name: 'Apply canvas size', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Canvas already has those dimensions');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Undo/ })).toBeDisabled();
});

test('Trim supports transparency and top-left color modes with a safe cancel path', async ({ page }) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  const canvas = page.getByTestId('editor-canvas');
  await selectTool(page, 'Shape');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * .35, box.y + box.height * .35);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .65, box.y + box.height * .65, { steps: 2 });
  await page.mouse.up();
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  const before = await dimensions(page);
  await openImageItem(page, 'Trim…');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Trim', exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Trim based on', { exact: true })).toHaveValue('transparent');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect.poll(() => dimensions(page)).toEqual(before);
  await openImageItem(page, 'Trim…');
  await page.getByRole('dialog').getByLabel('Trim based on', { exact: true }).selectOption('top-left');
  await page.getByRole('dialog').getByRole('button', { name: 'Apply trim', exact: true }).click();
  const after = await dimensions(page);
  expect(after.width).toBeLessThan(before.width);
  expect(after.height).toBeLessThan(before.height);
});

test('Trim is undoable, persists after reload, and supports Escape dismissal', async ({ page }) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  const canvas = page.getByTestId('editor-canvas');
  await selectTool(page, 'Shape');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * .42, box.y + box.height * .42);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .58, box.y + box.height * .58, { steps: 2 });
  await page.mouse.up();
  const before = await dimensions(page);
  await openImageItem(page, 'Trim…');
  await page.getByRole('dialog').getByRole('button', { name: 'Apply trim', exact: true }).click();
  const after = await dimensions(page);
  expect(after.width).toBeLessThan(before.width);
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => dimensions(page)).toEqual(after);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect.poll(() => dimensions(page)).toEqual(before);
  await openImageItem(page, 'Trim…');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('Trim rejects an entirely transparent composite without changing the draft', async ({ page }) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  const before = await dimensions(page);
  await openImageItem(page, 'Trim…');
  await page.getByRole('dialog').getByRole('button', { name: 'Apply trim', exact: true }).click();
  await expect.poll(() => dimensions(page)).toEqual(before);
  await expect(page.locator('footer')).toContainText('Trim would remove the entire image');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Undo/ })).toBeDisabled();
});

test('Reveal All is enabled, preserves the existing canvas, and expands translated artwork', async ({ page }) => {
  // Download a valid editable project, move its layer outside the canvas, then
  // re-open it through the public import path to exercise the document contract.
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const downloaded = await pending;
  const path = await downloaded.path();
  const project = await downloadedProject(path!) as { history: Array<{ layers: Array<{ matrix: number[] }> }>; index: number };
  for (const layer of project.history[project.index].layers) layer.matrix[4] = -220;
  await page.getByTestId('project-input').setInputFiles({ name: 'translated.pixelforge', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  const before = await dimensions(page);
  await openImageItem(page, 'Reveal All');
  const after = await dimensions(page);
  expect(after.width).toBeGreaterThan(before.width);
  await expect(page.locator('footer')).toContainText('All artwork revealed');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', String(after.width));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect.poll(() => dimensions(page)).toEqual(before);
});
