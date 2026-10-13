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
