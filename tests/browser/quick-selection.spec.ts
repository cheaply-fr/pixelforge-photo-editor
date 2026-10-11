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
    history: Array<{ selection?: { mask?: string } }>;
    assets: Record<string, { url: string; w: number; h: number }>;
    index: number;
    settings: { tool: string };
  };
};

const stroke = async (page: Page, start: [number, number], end: [number, number]) => {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  const point = (ratio: [number, number]) => ({
    clientX: box.x + box.width * ratio[0],
    clientY: box.y + box.height * ratio[1],
  });
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', { pointerId: 91, pointerType: 'mouse', pressure: 1, ...point(start), buttons: 1, isPrimary: true });
  await page.waitForTimeout(80);
  await canvas.dispatchEvent('pointermove', { pointerId: 91, pointerType: 'mouse', pressure: 1, ...point(end), buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointerup', { pointerId: 91, pointerType: 'mouse', pressure: 0, ...point(end), buttons: 0, isPrimary: true });
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
};

test('Quick Selection grows a local mask, composes Add, and round-trips on reload', async ({ page }) => {
  await selectTool(page, 'Quick Selection');
  await expect(page.getByText('Quick Selection tool selected', { exact: true })).toBeVisible();
  await page.getByLabel('Color tolerance', { exact: true }).fill('48');
  await stroke(page, [0.18, 0.25], [0.42, 0.25]);
  await expect(page.getByText(/Quick Selection created/)).toBeVisible();
  let saved = await project(page);
  const firstMask = saved.history[saved.index].selection?.mask;
  expect(firstMask).toBeTruthy();
  const first = saved.assets[firstMask!];
  expect(first.w).toBeGreaterThan(0);
  expect(first.h).toBeGreaterThan(0);
  await page.getByLabel('Selection mode', { exact: true }).selectOption('add');
  await stroke(page, [0.68, 0.68], [0.82, 0.68]);
  saved = await project(page);
  const secondMask = saved.history[saved.index].selection?.mask;
  expect(secondMask).toBeTruthy();
  expect(saved.history.length).toBeGreaterThan(2);
  await page.reload();
  const reloaded = await project(page);
  expect(reloaded.history[reloaded.index].selection?.mask).toBe(secondMask);
  expect(reloaded.settings.tool).toBe('quick-selection');
});
