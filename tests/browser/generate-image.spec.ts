import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

type Project = {
  history: Array<{ layers: Array<{ kind: string; name: string; asset?: string }> }>;
  index: number;
  assets: Record<string, { url: string; w: number; h: number }>;
};

async function openEditor(page: Page) {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
}

async function project(page: Page): Promise<Project> {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as Project;
}

test.beforeEach(async ({ page }) => openEditor(page));

test('Generate Image creates an abstract editable raster layer and survives reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Generate Image…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  const dialog = page.getByRole('dialog', { name: 'Generate Image' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Generate Image description').fill('blue stripes');
  await dialog.getByLabel('Generate Image width').fill('96');
  await dialog.getByLabel('Generate Image height').fill('64');
  await dialog.getByLabel('Generate Image seed').fill('7');
  await dialog.getByRole('button', { name: 'Generate local image', exact: true }).click();
  await expect(page.getByText(/Local abstract image generated \(stripes\)/, { exact: false })).toBeVisible();
  const saved = await project(page);
  const layer = saved.history[saved.index].layers.at(-1)!;
  expect(layer).toMatchObject({ kind: 'raster', name: 'Generated Image' });
  expect(layer.asset).toBeTruthy();
  expect(saved.assets[layer.asset!]).toMatchObject({ w: 96, h: 64 });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const restored = await project(page);
  const restoredLayer = restored.history[restored.index].layers.at(-1)!;
  expect(restored.assets[restoredLayer.asset!]).toMatchObject({ w: 96, h: 64 });
});

test('Generate Image rejects an empty local description without changing the document', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Generate Image…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Generate Image' });
  await dialog.getByLabel('Generate Image description').fill('   ');
  await dialog.getByRole('button', { name: 'Generate local image', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(page.getByText(/Describe an abstract local image first/, { exact: false })).toBeVisible();
});
