import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

test('Color Settings stores a bounded working profile without converting pixels', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const menuItem = page.getByRole('menuitem', { name: 'Color Settings…', exact: true });
  await expect(menuItem).toBeEnabled();
  await menuItem.click();
  const dialog = page.getByRole('dialog', { name: 'Color Settings' });
  await dialog.getByLabel('Working color profile').selectOption('display-p3');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Working color profile set to Display P3');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  expect(project.history.at(-1).colorProfile).toBe('display-p3');
});

test('Export exposes an explicit bounded target profile without mutating the draft', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export image' });
  await expect(dialog.getByLabel('Export color profile')).toHaveValue('srgb');
  await dialog.getByLabel('Export color profile').selectOption('display-p3');
  await expect(dialog.getByLabel('Export color profile')).toHaveValue('display-p3');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Editable project file downloaded');
});

async function project(page: import('@playwright/test').Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return await downloadedProject((await (await pending).path())!);
}

async function openEditor(page: import('@playwright/test').Page) {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
}

async function importFixture(page: import('@playwright/test').Page) {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 3;
    canvas.height = 1;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(3, 1);
    image.data.set([255, 0, 0, 255, 34, 112, 241, 128, 9, 8, 7, 0]);
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'profile-fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '3');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('height', '1');
  await expect(page.locator('footer')).toContainText('Photo opened as a flattened raster');
}

async function pixels(page: import('@playwright/test').Page) {
  return page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) =>
    Array.from(canvas.getContext('2d')!.getImageData(0, 0, 3, 1).data),
  );
}

test('Assign Profile changes only the working label and remains undoable', async ({ page }) => {
  await openEditor(page);
  const before = await project(page);
  const beforeLayer = before.history[before.index].layers.at(-1)!;
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Assign Profile…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Assign Profile' });
  await dialog.getByLabel('Target color profile').selectOption('display-p3');
  await dialog.getByRole('button', { name: 'Assign Profile', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Assigned Display P3 without changing RGB bytes');
  const after = await project(page);
  const afterLayer = after.history[after.index].layers.at(-1)!;
  expect(after.history[after.index].colorProfile).toBe('display-p3');
  expect(afterLayer.asset).toBe(beforeLayer.asset);
  expect(after.assets[beforeLayer.asset!]).toEqual(before.assets[beforeLayer.asset!]);
});

test('Convert to Profile transforms raster pixels, preserves alpha and round-trips', async ({ page }) => {
  await openEditor(page);
  await importFixture(page);
  const beforePixels = await pixels(page);
  const before = await project(page);
  const beforeLayer = before.history[before.index].layers.at(-1)!;
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Convert to Profile…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Convert to Profile' });
  await dialog.getByLabel('Target color profile').selectOption('display-p3');
  await dialog.getByRole('button', { name: 'Convert to Profile', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Converted raster content to Display P3; undo restores the source assets');
  const afterPixels = await pixels(page);
  expect(afterPixels[0]).not.toBe(beforePixels[0]);
  expect(afterPixels[3]).toBe(beforePixels[3]);
  expect(afterPixels[7]).toBe(beforePixels[7]);
  expect(afterPixels.slice(8, 12)).toEqual(beforePixels.slice(8, 12));
  const after = await project(page);
  const afterLayer = after.history[after.index].layers.at(-1)!;
  expect(after.history[after.index].colorProfile).toBe('display-p3');
  expect(afterLayer.asset).not.toBe(beforeLayer.asset);
  expect(after.assets[beforeLayer.asset!]).toEqual(before.assets[beforeLayer.asset!]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect.poll(() => pixels(page)).toEqual(beforePixels);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => pixels(page)).toEqual(beforePixels);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Convert to Profile…', exact: true }).click();
  await page.getByRole('dialog', { name: 'Convert to Profile' }).getByLabel('Target color profile').selectOption('display-p3');
  await page.getByRole('dialog', { name: 'Convert to Profile' }).getByRole('button', { name: 'Convert to Profile', exact: true }).click();
  await expect.poll(() => pixels(page)).toEqual(afterPixels);
});
