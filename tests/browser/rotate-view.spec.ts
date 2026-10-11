import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
});

const project = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as {
    index: number;
    settings: { viewRotation?: number };
  };
};

const pixels = async (page: Page) =>
  page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());

test('Rotate View changes only the viewport and persists safely', async ({ page }) => {
  const canvas = page.getByTestId('editor-canvas');
  const before = await pixels(page);
  const beforeProject = await project(page);
  await selectTool(page, 'Rotate View');
  await expect(page.getByTestId('view-rotation-controls')).toBeVisible();
  await expect(page.getByTestId('view-rotation-value')).toHaveText('0°');
  const box = (await canvas.boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(center.x + Math.min(60, box.width / 5), center.y);
  await page.mouse.down();
  await page.mouse.move(center.x, center.y - Math.min(60, box.height / 5), { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('view-rotation-value')).not.toHaveText('0°');
  const rotated = await page.getByTestId('canvas-wrap').getAttribute('data-view-rotation');
  expect(Number(rotated)).not.toBe(0);
  expect(await pixels(page)).toBe(before);
  const saved = await project(page);
  expect(saved.settings.viewRotation).toBe(Number(rotated));
  expect(saved.index).toBe(beforeProject.index);
  await page.reload();
  await expect(page.getByTestId('canvas-wrap')).toHaveAttribute('data-view-rotation', rotated!);
  await expect(page.getByTestId('view-rotation-value')).toHaveText(`${rotated}°`);
  await page.getByRole('button', { name: 'Reset view rotation', exact: true }).click();
  await expect(page.getByTestId('canvas-wrap')).toHaveAttribute('data-view-rotation', '0');
  expect(await pixels(page)).toBe(before);
});

test('Escape cancels a Rotate View drag without adding history', async ({ page }) => {
  const canvas = page.getByTestId('editor-canvas');
  const before = await project(page);
  await selectTool(page, 'Rotate View');
  const box = (await canvas.boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(center.x + Math.min(60, box.width / 5), center.y);
  await page.mouse.down();
  await page.mouse.move(center.x, center.y - Math.min(60, box.height / 5), { steps: 4 });
  await expect(page.getByTestId('canvas-wrap')).not.toHaveAttribute('data-view-rotation', '0');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('canvas-wrap')).toHaveAttribute('data-view-rotation', '0');
  await page.mouse.up();
  expect((await project(page)).index).toBe(before.index);
});

test('View menu rotates and resets the viewport without creating history', async ({ page }) => {
  const before = await pixels(page);
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rotate View right 15°', exact: true }).click();
  await expect(page.getByTestId('canvas-wrap')).toHaveAttribute('data-view-rotation', '15');
  expect(await pixels(page)).toBe(before);
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Reset Rotate View', exact: true }).click();
  await expect(page.getByTestId('canvas-wrap')).toHaveAttribute('data-view-rotation', '0');
});
