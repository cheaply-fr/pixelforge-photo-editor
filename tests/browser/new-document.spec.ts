import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const canvas = (page: Page) => page.getByTestId('editor-canvas');

async function openNew(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await expect(dialog).toBeVisible();
  return dialog;
}

const corner = (page: Page) =>
  canvas(page).evaluate((element: HTMLCanvasElement) =>
    Array.from(element.getContext('2d')!.getImageData(0, 0, 1, 1).data),
  );

test('File → New… creates a high-density poster from a preset', async ({ page }) => {
  test.setTimeout(60_000);
  const dialog = await openNew(page);
  await dialog.getByLabel('Document preset').selectOption('poster-2-3');
  await expect(dialog.getByLabel('New document width (px)')).toHaveValue('2646');
  await expect(dialog.getByLabel('New document height (px)')).toHaveValue('4096');
  await expect(dialog.getByTestId('new-document-summary')).toHaveText('2646 × 4096 px · 10.8 MP');
  await dialog.getByLabel('Document name for new document').fill('cosmic eye');
  await dialog.getByLabel('Background contents').selectOption('black');
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(canvas(page)).toHaveJSProperty('width', 2646);
  await expect(canvas(page)).toHaveJSProperty('height', 4096);
  await expect(page.getByLabel('Document name', { exact: true })).toHaveValue('cosmic eye');
  await expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
  expect(await corner(page)).toEqual([0, 0, 0, 255]);
  // The new document is undoable and survives reload.
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(canvas(page)).toHaveJSProperty('width', 2646);
  expect(await corner(page)).toEqual([0, 0, 0, 255]);
});

test('custom size, swap and transparent background', async ({ page }) => {
  const dialog = await openNew(page);
  await dialog.getByLabel('New document width (px)').fill('300');
  await dialog.getByLabel('New document height (px)').fill('500');
  await expect(dialog.getByLabel('Document preset')).toHaveValue('custom');
  await dialog.getByRole('button', { name: 'Swap width and height', exact: true }).click();
  await expect(dialog.getByLabel('New document width (px)')).toHaveValue('500');
  await expect(dialog.getByLabel('New document height (px)')).toHaveValue('300');
  await dialog.getByLabel('Background contents').selectOption('transparent');
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(canvas(page)).toHaveJSProperty('width', 500);
  await expect(canvas(page)).toHaveJSProperty('height', 300);
  await expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
  expect(await corner(page)).toEqual([0, 0, 0, 0]);
});

test('invalid sizes are explained and cannot be created; Escape cancels', async ({ page }) => {
  const before = await canvas(page).evaluate((element: HTMLCanvasElement) => [element.width, element.height]);
  const dialog = await openNew(page);
  const create = dialog.getByRole('button', { name: 'Create document', exact: true });
  await dialog.getByLabel('New document width (px)').fill('16000');
  await dialog.getByLabel('New document height (px)').fill('1001');
  await expect(dialog.getByRole('alert')).toHaveText('Documents are limited to 16 megapixels.');
  await expect(create).toBeDisabled();
  await dialog.getByLabel('New document width (px)').fill('0');
  await expect(dialog.getByRole('alert')).toContainText('Width must be a whole number');
  await expect(create).toBeDisabled();
  await dialog.getByLabel('New document width (px)').fill('800');
  await dialog.getByLabel('New document height (px)').fill('600');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(create).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await canvas(page).evaluate((element: HTMLCanvasElement) => [element.width, element.height])).toEqual(before);
});

test('background colour contents use the current background colour', async ({ page }) => {
  await page.getByLabel('Background color').evaluate((input: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '#204060');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const dialog = await openNew(page);
  await dialog.getByLabel('Background contents').selectOption('background-color');
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
  expect(await corner(page)).toEqual([32, 64, 96, 255]);
  // The instant white document command is unchanged.
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /^New white document/ }).click();
  await expect.poll(() => corner(page)).toEqual([255, 255, 255, 255]);
});

test('the size row lays out without overlap inside the dialog on every viewport', async ({ page }) => {
  const dialog = await openNew(page);
  const frame = (await dialog.boundingBox())!;
  const width = (await dialog.getByLabel('New document width (px)').boundingBox())!;
  const swap = (await dialog.getByRole('button', { name: 'Swap width and height', exact: true }).boundingBox())!;
  const height = (await dialog.getByLabel('New document height (px)').boundingBox())!;
  expect(width.x + width.width).toBeLessThanOrEqual(swap.x + 0.5);
  expect(swap.x + swap.width).toBeLessThanOrEqual(height.x + 0.5);
  expect(height.x + height.width).toBeLessThanOrEqual(frame.x + frame.width);
  expect(width.x).toBeGreaterThanOrEqual(frame.x);
  for (const label of ['Document name for new document', 'Document preset', 'Background contents']) {
    const box = (await dialog.getByLabel(label).boundingBox())!;
    expect(box.x + box.width, label).toBeLessThanOrEqual(frame.x + frame.width);
  }
  expect(swap.width).toBeGreaterThanOrEqual(36);
  expect(swap.height).toBeGreaterThanOrEqual(36);
});
