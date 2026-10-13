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

test('Object Selection creates a connected local mask and survives reload on desktop/mobile', async ({ page }) => {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 9; canvas.height = 5;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(9, 5);
    for (let y = 0; y < 5; y += 1) for (let x = 0; x < 9; x += 1) {
      const offset = (y * 9 + x) * 4;
      const left = x < 4;
      image.data[offset] = left ? 220 : 30;
      image.data[offset + 1] = left ? 30 : 30;
      image.data[offset + 2] = left ? 30 : 220;
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'object-selection-fixture.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  const values = ['1,2', '0', '0'];
  page.on('dialog', async (dialog) => dialog.accept(values.shift() ?? '0'));
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Object Selection…', exact: true }).click();
  await expect(page.getByText('Object Selection created (local connected-colour proxy)', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await download).path())!);
  const frame = project.history[project.index];
  expect(frame.selection?.mask).toBeTruthy();
  const maskAsset = project.assets[frame.selection!.mask!];
  expect(maskAsset).toBeTruthy();
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const reloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const restored = await downloadedProject((await (await reloaded).path())!);
  expect(restored.history[restored.index].selection?.mask).toBeTruthy();
});
