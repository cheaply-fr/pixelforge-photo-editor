import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

const openEditor = async (page: Page) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
};

test.beforeEach(async ({ page }) => openEditor(page));

test('brush smoothing is visible only for brush-family tools and round-trips in project files', async ({ page }) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();

  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  const smoothing = page.getByLabel('Smoothing', { exact: true });
  await expect(smoothing).toBeVisible();
  await smoothing.fill('68');
  await expect(smoothing).toHaveValue('68');

  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  const file = await download.path();
  const project = await downloadedProject(file!);
  expect(project.settings).toMatchObject({ brushSmoothing: 68 });

  await page.getByRole('button', { name: 'Eraser tool', exact: true }).click();
  await expect(smoothing).toBeVisible();
  await page.getByRole('button', { name: 'Clone tool', exact: true }).click();
  await expect(smoothing).toBeHidden();
});
