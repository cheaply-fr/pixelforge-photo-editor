import { expect, test } from '@playwright/test';
import { highlight, menu, openEditor, openPanel, openPropertiesSheet, openSample, shoot } from './helpers';

test('open-image-button', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await highlight(page.getByRole('button', { name: 'Open image', exact: true }));
  await shoot(page, 'open-image-button', page.locator('header').first(), { pad: 0 });
});

test('new-document-dialog', async ({ page }) => {
  await openEditor(page);
  await menu(page, 'File', 'New…');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Document name for new document').fill('Poster');
  await dialog.getByLabel('Document preset').selectOption({ label: 'Poster 2:3 (2646 × 4096)' });
  await shoot(page, 'new-document-dialog', dialog);
});

test('edit-menu-undo', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await menu(page, 'Image', 'Rotate right');
  await menu(page, 'Edit');
  await highlight(page.getByRole('menuitem', { name: /^Undo/ }), page.getByRole('menuitem', { name: /^Redo/ }));
  const box = (await page.getByRole('menuitem', { name: /^Undo/ }).boundingBox())!;
  await page.waitForTimeout(250);
  await page.screenshot({
    path: 'help/img/edit-menu-undo.jpg', type: 'jpeg', quality: 86, animations: 'disabled',
    clip: { x: Math.max(0, box.x - 120), y: 0, width: Math.max(560, box.width + 240), height: Math.min(420, box.y + 300) },
  });
});

test('basics-history-panel', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await menu(page, 'Image', 'Rotate right');
  await menu(page, 'Image', 'Flip horizontal');
  await menu(page, 'Filter', 'Warm');
  await openPanel(page, 'History');
  await shoot(page, 'basics-history-panel', page.locator('#sidebar-open-panel'));
});

test('mobile-properties-sheet @mobile', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape', { w: 1200, h: 900 });
  await openPropertiesSheet(page);
  await shoot(page, 'mobile-properties-sheet');
});
