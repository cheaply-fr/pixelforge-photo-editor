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
