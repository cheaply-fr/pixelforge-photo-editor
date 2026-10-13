import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

const openEditor = async (page: Page) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
};

test.beforeEach(async ({ page }) => openEditor(page));

test('brush scatter is exposed for raster brush tools and persists safely', async ({ page }) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  const scatter = page.getByLabel('Scatter', { exact: true });
  await expect(scatter).toBeVisible();
  await scatter.fill('74');
  await expect(scatter).toHaveValue('74');
  const dual = page.getByLabel('Dual brush', { exact: true });
  await dual.fill('63');
  await expect(dual).toHaveValue('63');
  const secondary = page.getByLabel('Secondary brush tip', { exact: true });
  await secondary.selectOption('round-soft');
  await expect(secondary).toHaveValue('round-soft');
  const bristle = page.getByLabel('Bristle', { exact: true });
  await bristle.fill('51');
  await expect(bristle).toHaveValue('51');
  const wetEdges = page.getByLabel('Wet edges', { exact: true });
  await wetEdges.fill('68');
  await expect(wetEdges).toHaveValue('68');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  const project = await downloadedProject((await download.path())!);
  expect(project.settings).toMatchObject({ brushScatter: 74, brushDual: 63, brushBristle: 51, brushWetEdges: 68, secondaryBrushPreset: 'round-soft' });
});
