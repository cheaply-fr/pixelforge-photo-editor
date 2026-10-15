import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

test('Perspective Warp changes the active raster asset and survives reload on desktop/mobile', async ({ page }) => {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 12; canvas.height = 8;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(12, 8);
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 12; x += 1) {
      const offset = (y * 12 + x) * 4;
      image.data[offset] = x * 18;
      image.data[offset + 1] = y * 24;
      image.data[offset + 2] = 120;
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'perspective-warp-fixture.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  const beforeDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const before = await downloadedProject((await (await beforeDownload).path())!);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  page.once('dialog', async (dialog) => dialog.accept('1,1;10,0;11,7;0,6'));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Perspective Warp…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText('Perspective Warp applied locally; undo restores the source asset', { exact: true })).toBeVisible();
  const afterDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const after = await downloadedProject((await (await afterDownload).path())!);
  const layer = after.history[after.index].layers.at(-1)!;
  expect(layer.asset).not.toBe(sourceAsset);
  expect(after.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const reloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const restored = await downloadedProject((await (await reloaded).path())!);
  expect(restored.history[restored.index].layers.at(-1)!.asset).toBe(layer.asset);
});

test('Vanishing Point applies a bounded local plane projection and preserves the source asset', async ({ page }) => {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 12; canvas.height = 8;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(12, 8);
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 12; x += 1) {
      const offset = (y * 12 + x) * 4;
      image.data[offset] = x * 18;
      image.data[offset + 1] = y * 24;
      image.data[offset + 2] = 120;
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'vanishing-point-fixture.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  const beforeDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const before = await downloadedProject((await (await beforeDownload).path())!);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Vanishing Point target quad');
    await dialog.accept('1,1;10,0;11,7;0,6');
  });
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Vanishing Point…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText('Vanishing Point applied locally; undo restores the source asset', { exact: true })).toBeVisible();
  const afterDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const after = await downloadedProject((await (await afterDownload).path())!);
  const layer = after.history[after.index].layers.at(-1)!;
  expect(layer.asset).not.toBe(sourceAsset);
  expect(after.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const reloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const restored = await downloadedProject((await (await reloaded).path())!);
  expect(restored.history[restored.index].layers.at(-1)!.asset).toBe(layer.asset);
});

test('Vanishing Point rejects invalid plans and disables itself for locked layers', async ({ page }) => {
  const beforeDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const before = await downloadedProject((await (await beforeDownload).path())!);
  page.once('dialog', async (dialog) => await dialog.accept('1,1;2,2;3,3'));
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Vanishing Point…', exact: true }).click();
  await expect(page.getByText('Vanishing Point needs four numeric x,y points', { exact: true })).toBeVisible();
  const unchangedDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const unchanged = await downloadedProject((await (await unchangedDownload).path())!);
  expect(unchanged.history.length).toBe(before.history.length);

  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Lock Layers…', exact: true }).click();
  await expect(page.getByText('Selected layers locked', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Vanishing Point…', exact: true })).toBeDisabled();
});
