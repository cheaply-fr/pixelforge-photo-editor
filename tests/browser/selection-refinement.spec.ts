import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

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

type Project = {
  history: Array<{
    selection?: { x: number; y: number; w: number; h: number; mask?: string };
  }>;
  index: number;
  assets: Record<string, { url: string; w: number; h: number }>;
};

const project = async (page: Page): Promise<Project> => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as Project;
};

const alphaCoverage = async (page: Page, asset: { url: string; w: number; h: number }) =>
  page.evaluate(async ({ asset }) => {
    const image = new Image();
    image.src = asset.url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = asset.w;
    canvas.height = asset.h;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, asset.w, asset.h).data;
    let covered = 0;
    for (let offset = 3; offset < data.length; offset += 4) if (data[offset] > 0) covered += 1;
    return covered;
  }, { asset });

test.beforeEach(async ({ page }) => prepare(page));

test('Grow and Contract refine alpha nondestructively and survive project reload', async ({ page }) => {
  await selectTool(page, 'Select');
  await drag(page, [0.25, 0.25], [0.55, 0.55]);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Grow…', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Grow Selection' })).toBeVisible();
  await page.getByLabel('Selection refinement radius (px)', { exact: true }).fill('12');
  await page.getByRole('button', { name: 'Apply selection refinement', exact: true }).click();
  await expect(page.getByText('Selection grown by 12 px', { exact: true })).toBeVisible();
  let saved = await project(page);
  let frame = saved.history[saved.index];
  expect(frame.selection?.mask).toBeTruthy();
  const grownCoverage = await alphaCoverage(page, saved.assets[frame.selection!.mask!]);
  expect(grownCoverage).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Contract…', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Contract Selection' })).toBeVisible();
  await page.getByLabel('Selection refinement radius (px)', { exact: true }).fill('6');
  await page.getByRole('button', { name: 'Apply selection refinement', exact: true }).click();
  await expect(page.getByText('Selection contracted by 6 px', { exact: true })).toBeVisible();
  saved = await project(page);
  frame = saved.history[saved.index];
  const contractedCoverage = await alphaCoverage(page, saved.assets[frame.selection!.mask!]);
  const contractedMask = frame.selection!.mask;
  expect(contractedCoverage).toBeLessThan(grownCoverage);

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Border…', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Border Selection' })).toBeVisible();
  await page.getByLabel('Selection refinement radius (px)', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Apply selection refinement', exact: true }).click();
  await expect(page.getByText('Selection bordered by 3 px', { exact: true })).toBeVisible();
  saved = await project(page);
  frame = saved.history[saved.index];
  const borderMask = frame.selection!.mask;
  const borderCoverage = await alphaCoverage(page, saved.assets[frame.selection!.mask!]);
  expect(borderCoverage).toBeGreaterThan(0);
  expect(borderCoverage).toBeLessThan(grownCoverage);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  saved = await project(page);
  expect(saved.history[saved.index].selection?.mask).toBe(contractedMask);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  saved = await project(page);
  expect(saved.history[saved.index].selection?.mask).toBe(borderMask);
  await page.reload();
  saved = await project(page);
  frame = saved.history[saved.index];
  expect(frame.selection?.mask).toBeTruthy();
  expect(await alphaCoverage(page, saved.assets[frame.selection!.mask!])).toBe(borderCoverage);
});

test('Smooth selection softens alpha edges and survives project reload', async ({ page }) => {
  await selectTool(page, 'Select');
  await drag(page, [0.25, 0.25], [0.55, 0.55]);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Smooth…', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Smooth Selection' })).toBeVisible();
  await page.getByLabel('Selection refinement radius (px)', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Apply selection refinement', exact: true }).click();
  await expect(page.getByText('Selection smoothed by 4 px', { exact: true })).toBeVisible();
  const saved = await project(page);
  const frame = saved.history[saved.index];
  expect(frame.selection?.mask).toBeTruthy();
  const coverage = await alphaCoverage(page, saved.assets[frame.selection!.mask!]);
  expect(coverage).toBeGreaterThan(0);
  await page.reload();
  const reloaded = await project(page);
  expect(await alphaCoverage(page, reloaded.assets[reloaded.history[reloaded.index].selection!.mask!])).toBe(coverage);
});

test('Grow rejects invalid radius without mutating the active selection', async ({ page }) => {
  await selectTool(page, 'Select');
  await drag(page, [0.25, 0.25], [0.55, 0.55]);
  const before = await project(page);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Grow…', exact: true }).click();
  await page.getByLabel('Selection refinement radius (px)', { exact: true }).fill('0');
  await expect(page.getByRole('button', { name: 'Apply selection refinement', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const after = await project(page);
  expect(after.history[after.index].selection).toEqual(before.history[before.index].selection);
});

test('Border rejects an over-limit radius without mutating the active selection', async ({ page }) => {
  await selectTool(page, 'Select');
  await drag(page, [0.25, 0.25], [0.55, 0.55]);
  const before = await project(page);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Border…', exact: true }).click();
  await page.getByLabel('Selection refinement radius (px)', { exact: true }).fill('1001');
  await expect(page.getByRole('dialog', { name: 'Border Selection' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply selection refinement', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const after = await project(page);
  expect(after.history[after.index].selection).toEqual(before.history[before.index].selection);
});
