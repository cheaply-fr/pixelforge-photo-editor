import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

test('Update All Text Layers changes editable text styles and survives project export', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Paste Lorem Ipsum', exact: true }).click();
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  const menuItem = page.getByRole('menuitem', { name: 'Update All Text Layers', exact: true });
  await expect(menuItem).toBeEnabled();
  await menuItem.click();
  const dialog = page.getByRole('dialog', { name: 'Update All Text Layers' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Text font').selectOption('Georgia');
  await dialog.getByLabel('Text size').fill('72');
  await dialog.getByRole('button', { name: 'Update text', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Updated 1 editable text layer');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  const latest = project.history.at(-1) as { layers: Array<{ kind: string; fontFamily?: string; fontSize?: number }> };
  const textLayer = latest.layers.find((layer) => layer.kind === 'text');
  expect(textLayer).toMatchObject({ fontFamily: 'Georgia', fontSize: 72 });
});
