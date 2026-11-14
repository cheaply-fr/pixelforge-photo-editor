import { expect, test, type Page } from '@playwright/test';
import { highlight, menu, openEditor, openPanel, openSample, shoot } from './helpers';

/** Crop to the open top menu: from its button down to the last item. */
async function shootMenu(page: Page, name: string, top: string) {
  const button = (await page.getByRole('button', { name: top, exact: true }).boundingBox())!;
  const items = page.getByRole('menuitem');
  const first = (await items.first().boundingBox())!;
  const last = (await items.last().boundingBox())!;
  const x = Math.max(0, Math.min(button.x, first.x) - 16);
  await page.waitForTimeout(250);
  await page.screenshot({
    path: `help/img/${name}.jpg`, type: 'jpeg', quality: 86, animations: 'disabled',
    clip: { x, y: 0, width: Math.max(first.width, 300) + 48, height: Math.min(900, last.y + last.height + 16) },
  });
}

test('file-menu', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await menu(page, 'File');
  await shootMenu(page, 'file-menu', 'File');
});

test('docbar-save-draft', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText(/Saved on this device · \d/).first()).toBeVisible();
  await highlight(page.getByRole('button', { name: 'Save draft', exact: true }));
  await shoot(page, 'docbar-save-draft', page.locator('.docbar .draft-actions'), { pad: 10 });
});

test('export-dialog-jpeg', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Export format').selectOption('jpeg');
  await dialog.getByLabel('Target size (KB)').fill('300');
  await expect(dialog.getByLabel('Encoded file size')).not.toHaveText(/Encoding preview/);
  await shoot(page, 'export-dialog-jpeg', dialog);
});

test('export-dialog-svg', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'city');
  await menu(page, 'File', 'Export as SVG');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Export format')).toBeVisible();
  await page.waitForTimeout(800);
  await shoot(page, 'export-dialog-svg', dialog);
});

test('file-info-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'portrait');
  await menu(page, 'File', 'File Info / Privacy…');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Document title').fill('Studio portrait');
  await dialog.getByLabel('Document author').fill('PixelForge sample');
  await shoot(page, 'file-info-dialog', dialog);
});

test('projects-panel-signed-out', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await openPanel(page, 'My projects');
  await shoot(page, 'projects-panel-signed-out', page.locator('#sidebar-open-panel'));
});

test('batch-history-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await menu(page, 'Image', 'Rotate right');
  await menu(page, 'Filter', 'Mono');
  await menu(page, 'File', 'Batch export history…');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await shoot(page, 'batch-history-dialog', dialog);
});

test('batch-images-dialog', async ({ page }) => {
  await openEditor(page);
  const files = await page.evaluate(() =>
    ['#e07a5f', '#3d5a80', '#81b29a'].map((color, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      const c = canvas.getContext('2d')!;
      c.fillStyle = color;
      c.fillRect(0, 0, 800, 600);
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(400, 300, 120 + i * 30, 0, Math.PI * 2);
      c.fill();
      return canvas.toDataURL('image/png').split(',')[1];
    }),
  );
  await page.getByTestId('batch-image-input').setInputFiles(
    files.map((data, i) => ({ name: `sample-${i + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(data, 'base64') })),
  );
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Batch image export format').selectOption('jpeg');
  await dialog.getByRole('button', { name: 'Build batch ZIP' }).click();
  await expect(dialog.getByRole('button', { name: 'Download batch ZIP' })).toBeVisible();
  await shoot(page, 'batch-images-dialog', dialog);
});

test('add-image-layer-button', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  const button = page.getByRole('button', { name: 'Add image layer', exact: true });
  await page.locator('[data-sidebar-section="layers"]').scrollIntoViewIfNeeded();
  await highlight(button);
  await shoot(page, 'add-image-layer-button', page.locator('[data-sidebar-section="layers"]'));
});
