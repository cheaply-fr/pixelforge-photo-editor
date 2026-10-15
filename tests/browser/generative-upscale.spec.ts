import { test, expect, type Page } from '@playwright/test';

const beforeEachEditor = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
};

const dimensions = (page: Page) =>
  page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => ({
    width: canvas.width,
    height: canvas.height,
  }));

const openUpscale = async (page: Page) => {
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Generative Upscale…', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Generative Upscale', exact: true })).toBeVisible();
  return dialog;
};

test.beforeEach(async ({ page }) => beforeEachEditor(page));

test('Generative Upscale opens with a bounded local disclosure and responsive controls', async ({ page }) => {
  const dialog = await openUpscale(page);
  await expect(dialog.getByLabel('Upscale factor', { exact: true })).toHaveValue('2');
  await expect(dialog.getByLabel('Upscale method', { exact: true })).toHaveValue('automatic');
  await expect(dialog.getByText('offline approximation', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Apply upscale', exact: true })).toBeEnabled();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);
});

test('Generative Upscale doubles editable document dimensions and remains undoable', async ({ page }) => {
  const before = await dimensions(page);
  const dialog = await openUpscale(page);
  await dialog.getByRole('button', { name: 'Apply upscale', exact: true }).click();
  await expect(page.locator('footer > span').first()).toContainText('Local 2× upscale created');
  await expect.poll(() => dimensions(page)).toEqual({ width: before.width * 2, height: before.height * 2 });
  await page.keyboard.press('Control+Z');
  await expect.poll(() => dimensions(page)).toEqual(before);
});

test('Generative Upscale can be cancelled without changing the draft', async ({ page }) => {
  const before = await dimensions(page);
  const dialog = await openUpscale(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect.poll(() => dimensions(page)).toEqual(before);
});

test('Generative Upscale persists the editable dimensions through a local draft reload', async ({ page }) => {
  const before = await dimensions(page);
  const dialog = await openUpscale(page);
  await dialog.getByRole('button', { name: 'Apply upscale', exact: true }).click();
  await expect.poll(() => dimensions(page)).toEqual({ width: before.width * 2, height: before.height * 2 });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  await expect.poll(() => dimensions(page)).toEqual({ width: before.width * 2, height: before.height * 2 });
});
