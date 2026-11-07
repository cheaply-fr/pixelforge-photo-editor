import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

test('Image > Apply Image composites an undoable local raster result', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  page.once('dialog', (dialog) => dialog.accept('50'));
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Apply Image…', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Apply Image composited the visible image at 50%');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Undo/ })).toBeEnabled();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  expect(project.history.length).toBeGreaterThanOrEqual(2);
  expect(project.history.at(-1)?.w).toBe(1440);
  expect(project.history.at(-1)?.h).toBe(960);
});

test('Image > Apply Image rejects an invalid opacity without changing history', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  page.once('dialog', (dialog) => dialog.accept('101'));
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Apply Image…', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Apply Image opacity must be between 0 and 100%');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Undo/ })).toBeDisabled();
});

test('Image > Apply Image clips the rendered source to an active selection', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Select');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText('Rectangular selection created', { exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept('100'));
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Apply Image…', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Apply Image composited the visible image at 100%');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  expect(project.history.at(-1)?.selection).toBeTruthy();
});

test('Image > Apply Image grows an empty paint layer to the canvas first', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  // A new paint layer stores one transparent pixel until something is written.
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  page.once('dialog', (dialog) => dialog.accept('100'));
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Apply Imageâ€¦', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Apply Image composited the visible image at 100%');
  await expect(page.locator('footer')).not.toContainText('match the document dimensions');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  const frame = project.history[project.index];
  const layer = frame.layers.find((item: { id: string }) => item.id === frame.active);
  expect([project.assets[layer.asset].w, project.assets[layer.asset].h]).toEqual([frame.w, frame.h]);
  // One undo step: undo returns to the empty one-pixel layer.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  const undone = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const before = await downloadedProject((await (await undone).path())!);
  const beforeFrame = before.history[before.index];
  const beforeLayer = beforeFrame.layers.find((item: { id: string }) => item.id === layer.id);
  expect([before.assets[beforeLayer.asset].w, before.assets[beforeLayer.asset].h]).toEqual([1, 1]);
});

test('Image > Apply Image cancelled on an empty paint layer leaves it at one pixel', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Apply Imageâ€¦', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  const frame = project.history[project.index];
  const layer = frame.layers.find((item: { id: string }) => item.id === frame.active);
  expect([project.assets[layer.asset].w, project.assets[layer.asset].h]).toEqual([1, 1]);
});
