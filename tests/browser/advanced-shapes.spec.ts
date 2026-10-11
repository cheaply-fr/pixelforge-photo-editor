import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect } from '@playwright/test';

async function project(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  const path = await download.path();
  return await downloadedProject(path!) as {
    history: Array<{ layers: Array<Record<string, unknown>> }>;
    index: number;
  };
}

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

test('polygon variants expose triangle and star metadata and survive reload', async ({ page }) => {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await selectTool(page, 'Polygon');
  await page.mouse.move(box.x + 140, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 380, box.y + 330, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByLabel('Shape type', { exact: true })).toBeVisible();
  await page.getByLabel('Shape type', { exact: true }).selectOption('triangle');
  let saved = await project(page);
  expect(saved.history[saved.index].layers.at(-1)).toMatchObject({ kind: 'polygon', variant: 'triangle' });
  await page.getByLabel('Shape type', { exact: true }).selectOption('star');
  saved = await project(page);
  expect(saved.history[saved.index].layers.at(-1)).toMatchObject({ kind: 'polygon', variant: 'star' });
  await page.reload();
  await expect(page.getByLabel('Shape type', { exact: true })).toHaveValue('star');
});
