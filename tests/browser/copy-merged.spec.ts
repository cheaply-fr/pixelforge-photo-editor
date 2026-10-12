import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

type Project = {
  history: Array<{
    w: number;
    h: number;
    layers: Array<{ kind: string; name?: string }>;
  }>;
  index: number;
  assets: Record<string, { w: number; h: number }>;
};

const prepare = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
};

const downloadProject = async (page: Page): Promise<Project> => {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const path = await (await pending).path();
  if (!path) throw new Error('Project download path unavailable');
  return (await downloadedProject(path)) as Project;
};

test.beforeEach(async ({ page }) => prepare(page));

test('Edit > Copy Merged copies the rendered composition into the layer clipboard', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const command = page.getByRole('menuitem', { name: /^Copy Merged/ });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText('Merged visible image copied', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Paste Layer/ }).click();
  await expect(page.getByRole('heading', { name: /Layers 2 \/ 32/ })).toBeVisible();

  const project = await downloadProject(page);
  const frame = project.history[project.index];
  expect(frame.layers.at(-1)?.name).toBe('Merged copy copy');
  expect(frame.layers.at(-1)?.kind).toBe('raster');
  expect(Object.values(project.assets).some((asset) => asset.w === frame.w && asset.h === frame.h)).toBe(true);
});

test('Control+Shift+C invokes Copy Merged without changing document history', async ({ page }) => {
  const before = await downloadProject(page);
  await page.keyboard.press('Control+Shift+C');
  await expect(page.getByText('Merged visible image copied', { exact: true })).toBeVisible();
  const after = await downloadProject(page);
  expect(after.history.length).toBe(before.history.length);
  expect(after.index).toBe(before.index);
});
