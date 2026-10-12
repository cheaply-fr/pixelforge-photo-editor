import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

type Project = {
  name: string;
  history: Array<{
    w: number;
    h: number;
    layers: Array<{ kind: string; name?: string }>;
  }>;
  index: number;
  assets: Record<string, { url: string; w: number; h: number }>;
};

const prepare = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
};

const project = async (page: Page): Promise<Project> => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return (await downloadedProject((await download.path())!)) as Project;
};

test.beforeEach(async ({ page }) => prepare(page));

test('Image > Duplicate creates an independent editable draft copy', async ({ page }) => {
  const before = await project(page);
  const beforeFrame = before.history[before.index];
  const beforeAssetUrls = Object.values(before.assets).map((asset) => asset.url);

  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Duplicate…', exact: true })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Duplicate…', exact: true }).click();
  await expect(page.getByText('Document duplicated as a new editable draft', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Document name', { exact: true })).toHaveValue(`${before.name} copy`);

  const after = await project(page);
  const afterFrame = after.history[after.index];
  expect(after.name).toBe(`${before.name} copy`);
  expect(afterFrame).toEqual(beforeFrame);
  expect(Object.values(after.assets).map((asset) => asset.url)).toEqual(beforeAssetUrls);
  expect(after.history.length).toBe(before.history.length);
});

test('Image > Duplicate remains available for a fresh document and preserves transparency', async ({ page }) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Duplicate…', exact: true }).click();
  await expect(page.getByLabel('Document name', { exact: true })).toHaveValue('untitled-transparent copy');
  const copied = await project(page);
  const frame = copied.history[copied.index];
  expect(frame.w).toBe(1200);
  expect(frame.h).toBe(800);
  expect(Object.values(copied.assets).every((asset) => asset.w === 1200 && asset.h === 800)).toBe(true);
});
