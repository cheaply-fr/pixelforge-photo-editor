import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';

async function lockMenu(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  return page.getByRole('menuitem', { name: 'Lock Layers…', exact: true });
}

async function project(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const path = await (await pending).path();
  return { path: path!, value: await downloadedProject(path!) };
}

async function pixels(page: import('@playwright/test').Page) {
  const canvas = page.getByTestId('editor-canvas');
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  return canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
}

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
});

test('Layer > Lock Layers toggles the selected layer lock', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const lock = await lockMenu(page);
  await expect(lock).toBeEnabled();
  await lock.click();
  await expect(page.getByText('Selected layers locked', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Lock layer', { exact: true })).toBeChecked();

  const unlock = await lockMenu(page);
  await unlock.click();
  await expect(page.getByText('Selected layers unlocked', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Lock layer', { exact: true })).not.toBeChecked();
});

test('Layer > Lock Layers is disabled for a layer inside a locked group', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Group active layer', exact: true }).click();
  await page.getByLabel('Lock group Group 1', { exact: true }).check();
  const lock = await lockMenu(page);
  await expect(lock).toBeDisabled();
});

test('selected-set locking preserves pixels, history and project round trips', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await page.getByRole('button', { name: 'Select all layers', exact: true }).click();
  const before = await project(page);
  const rendered = await pixels(page);
  await (await lockMenu(page)).click();
  const locked = await project(page);
  const lockedFrame = locked.value.history[locked.value.index];
  expect(lockedFrame.layers).toHaveLength(2);
  expect(lockedFrame.layers.every((layer: { locked: boolean }) => layer.locked)).toBe(true);
  expect(lockedFrame.selectedLayerIds).toEqual(before.value.history[before.value.index].selectedLayerIds);
  expect(locked.value.assets).toEqual(before.value.assets);
  expect(locked.value.history.length).toBe(before.value.history.length + 1);
  expect(await pixels(page)).toBe(rendered);
  await expect(page.getByLabel('Layer name', { exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByLabel('Lock layer', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await expect(page.getByLabel('Lock layer', { exact: true })).toBeChecked();
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Lock layer', { exact: true })).toBeChecked();
  await (await lockMenu(page)).click();
  await expect(page.getByLabel('Lock layer', { exact: true })).not.toBeChecked();
  await page.getByTestId('project-input').setInputFiles(locked.path);
  await expect(page.getByLabel('Lock layer', { exact: true })).toBeChecked();
  const imported = await project(page);
  expect(imported.value.history[imported.value.index]).toMatchObject({
    active: lockedFrame.active,
    selectedLayerIds: lockedFrame.selectedLayerIds,
    layers: lockedFrame.layers,
  });
  expect(await pixels(page)).toBe(rendered);
});

test('deselected layers disable locking without changing active layer state', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Deselect layers', exact: true }).click();
  await expect(await lockMenu(page)).toBeDisabled();
});
