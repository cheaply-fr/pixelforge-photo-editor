import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';

async function project(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return downloadedProject((await download.path())!);
}

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

test('links ordinary layers, propagates transforms, and survives reload/project round trip', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await page.getByRole('button', { name: 'Select all layers', exact: true }).click();
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  const link = page.getByRole('menuitem', { name: 'Link Layers', exact: true });
  await expect(link).toBeEnabled();
  await link.click();
  await expect(page.getByText(/Linked 2 layers for synchronized transforms/, { exact: true })).toBeVisible();
  let saved = await project(page);
  let frame = saved.history[saved.index];
  const links = frame.layers.map((layer: { layerLinkId?: string }) => layer.layerLinkId);
  expect(links[0]).toBeTruthy();
  expect(links[1]).toBe(links[0]);

  await page.getByLabel('Layer X', { exact: true }).fill('32');
  await page.getByLabel('Layer X', { exact: true }).press('Enter');
  await expect(page.getByText('Layer updated', { exact: true })).toBeVisible();
  saved = await project(page);
  frame = saved.history[saved.index];
  expect(frame.layers[0].matrix[4]).toBe(32);
  expect(frame.layers[1].matrix[4]).toBe(32);
  expect(frame.layers[0].layerLinkId).toBe(frame.layers[1].layerLinkId);

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  saved = await project(page);
  frame = saved.history[saved.index];
  expect(frame.layers[0].matrix[4]).toBe(32);
  expect(frame.layers[1].matrix[4]).toBe(32);
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Unlink Layers', exact: true }).click();
  await expect(page.getByText('Unlinked 2 layers', { exact: true })).toBeVisible();
  saved = await project(page);
  frame = saved.history[saved.index];
  expect(frame.layers.every((layer: { layerLinkId?: string }) => layer.layerLinkId === undefined)).toBe(true);
});

test('guards generic link commands for insufficient or locked selections', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Link Layers', exact: true })).toBeDisabled();
  await expect(page.getByRole('menuitem', { name: 'Unlink Layers', exact: true })).toBeDisabled();
});
