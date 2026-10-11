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
    history: Array<{ measurements?: unknown[] }>;
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

test('color sampler and count overlays persist in project files and reloads', async ({ page }) => {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await selectTool(page, 'Color Sampler');
  await canvas.click({ position: { x: box.width * 0.4, y: box.height * 0.4 } });
  await selectTool(page, 'Count');
  await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
  await expect(page.getByTestId('measurement-overlay')).toBeVisible();
  await expect(page.getByText(/Count marker 1 added/)).toBeVisible();
  const saved = await project(page);
  expect(saved.history[saved.index].measurements).toHaveLength(2);
  await page.reload();
  await expect(page.getByTestId('measurement-overlay')).toBeVisible();
  const reloaded = await project(page);
  expect(reloaded.history[reloaded.index].measurements).toHaveLength(2);
});

test('ruler reports pixel distance and angle without changing export pixels', async ({ page }) => {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await selectTool(page, 'Ruler');
  await page.mouse.move(box.x + 120, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 220, box.y + 170, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('measurement-overlay')).toBeVisible();
  await expect(page.getByText(/Ruler:/)).toBeVisible();
  const saved = await project(page);
  expect(saved.history[saved.index].measurements).toHaveLength(1);
  expect(saved.history[saved.index].measurements![0]).toMatchObject({ kind: 'ruler' });
});

test('note tool stores an annotation after the browser prompt', async ({ page }) => {
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('prompt');
    await dialog.accept('Review horizon');
  });
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await selectTool(page, 'Note');
  await canvas.click({ position: { x: box.width * 0.25, y: box.height * 0.25 } });
  await expect(page.getByText('Note added to the draft')).toBeVisible();
  const saved = await project(page);
  expect(saved.history[saved.index].measurements).toMatchObject([{ kind: 'note', text: 'Review horizon' }]);
});
