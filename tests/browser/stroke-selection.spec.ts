import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

const prepare = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
};

const drag = async (page: Page, start: [number, number], end: [number, number]) => {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * start[0], box.y + box.height * start[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * end[0], box.y + box.height * end[1], { steps: 6 });
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
};

test.beforeEach(async ({ page }) => prepare(page));

test('Stroke paints the selected border on the active raster layer and survives project reload', async ({ page }) => {
  await selectTool(page, 'Select');
  await drag(page, [0.25, 0.25], [0.65, 0.65]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Stroke…', exact: true })).toBeEnabled();
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('prompt');
    await dialog.accept('4');
  });
  await page.getByRole('menuitem', { name: 'Stroke…', exact: true }).click();
  await expect(page.getByText(/Selection stroked with 4px/)).toBeVisible();

  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  const project = await downloadedProject((await download.path())!) as {
    history: Array<{ active: string; layers: Array<{ id: string; kind: string; asset?: string }> }>;
    index: number;
    assets: Record<string, { url: string; w: number; h: number }>;
  };
  const frame = project.history[project.index];
  const active = frame.layers.find((layer) => layer.id === frame.active);
  expect(active?.kind).toBe('raster');
  expect(active?.asset && project.assets[active.asset]).toBeTruthy();
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const reloadedPending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const reloadedDownload = await reloadedPending;
  const reloaded = await downloadedProject((await reloadedDownload.path())!) as typeof project;
  const reloadedFrame = reloaded.history[reloaded.index];
  const reloadedActive = reloadedFrame.layers.find((layer) => layer.id === reloadedFrame.active);
  expect(reloadedActive?.asset && reloaded.assets[reloadedActive.asset]).toBeTruthy();
});
