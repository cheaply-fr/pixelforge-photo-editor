import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

const openEditor = async (page: Page) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
};

test.beforeEach(async ({ page }) => openEditor(page));

test('brush flow is accessible, bounded, and persisted in project settings', async ({ page }) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  const flow = page.getByLabel('Flow', { exact: true });
  await expect(flow).toBeVisible();
  await flow.fill('37');
  await expect(flow).toHaveValue('37');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  const project = await downloadedProject((await download.path())!);
  expect(project.settings).toMatchObject({ brushFlow: 37 });
});
