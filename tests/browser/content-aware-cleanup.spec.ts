import { selectTool } from './tool-selection';
import { documentPixel, lowerBrushOpacity, marquee, openRedBlock } from './content-aware-block';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

type Layer = {
  kind: string;
  asset?: string;
  contentAwareFills?: Array<{ version: number; mask: string; radius: number; opacity: number }>;
};
type Project = {
  history: Array<{ layers: Layer[]; selection?: unknown }>;
  index: number;
  assets: Record<string, { url: string; w: number; h: number }>;
};

const openEditor = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
};

const project = async (page: Page): Promise<Project> => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  const file = await download.path();
  return await downloadedProject(file!) as Project;
};

const box = async (page: Page) => (await page.getByTestId('editor-canvas').boundingBox())!;

const drag = async (page: Page, start: [number, number], end: [number, number]) => {
  const canvas = page.getByTestId('editor-canvas');
  const bounds = await box(page);
  await page.mouse.move(bounds.x + bounds.width * start[0], bounds.y + bounds.height * start[1]);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * end[0], bounds.y + bounds.height * end[1], { steps: 4 });
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
};

const selectCleanup = async (page: Page) => {
  await selectTool(page, 'Select');
  await drag(page, [0.38, 0.38], [0.62, 0.62]);
  await expect(page.getByText('Rectangular selection created', { exact: true })).toBeVisible();
};

test.beforeEach(async ({ page }) => openEditor(page));

test('Content-Aware Fill uses a local selection mask, preserves source, and survives undo/redo/reload', async ({ page }) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /^New white document/ }).click();
  await selectTool(page, 'Brush');
  await page.getByLabel('Drawing color', { exact: true }).fill('#e51c23');
  await page.getByLabel('Size', { exact: true }).fill('80');
  await drag(page, [0.5, 0.5], [0.5, 0.5]);
  const painted = await project(page);
  const paintedLayer = painted.history[painted.index].layers.at(-1)!;
  const sourceAsset = paintedLayer.asset;

  await selectCleanup(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Content-Aware Fill…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText(/Content-Aware Fill applied locally/, { exact: false })).toBeVisible();
  const cleaned = await project(page);
  const cleanedLayer = cleaned.history[cleaned.index].layers.at(-1)!;
  expect(cleanedLayer.asset).toBe(sourceAsset);
  expect(cleanedLayer.contentAwareFills).toHaveLength(1);
  expect(cleanedLayer.contentAwareFills![0]).toMatchObject({ version: 1, opacity: 1 });
  // The search radius follows the selection's bounds (here wider than the
  // 80 px brush), clamped to 128.
  expect(cleanedLayer.contentAwareFills![0].radius).toBeGreaterThan(40);
  expect(cleanedLayer.contentAwareFills![0].radius).toBeLessThanOrEqual(128);
  expect(cleaned.assets[cleanedLayer.contentAwareFills![0].mask]).toBeTruthy();

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  const undone = await project(page);
  expect(undone.history[undone.index].layers.at(-1)!.contentAwareFills).toBeUndefined();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  // History navigation reports its own deterministic status; the persisted
  // operation is asserted from the project after the redo and again after
  // reload below.
  await expect(page.locator('footer')).toContainText('Redone');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const reloaded = await project(page);
  expect(reloaded.history[reloaded.index].layers.at(-1)!.asset).toBe(sourceAsset);
  expect(reloaded.history[reloaded.index].layers.at(-1)!.contentAwareFills).toHaveLength(1);
});

test('Content-Aware Fill is disabled without a selection and on locked layers', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Content-Aware Fill…', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await selectCleanup(page);
  await page.getByLabel('Lock layer', { exact: true }).check();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Content-Aware Fill…', exact: true })).toBeDisabled();
});

test('Content-Aware Fill reaches across the whole selection whatever the brush size and opacity', async ({ page }) => {
  await openRedBlock(page);
  // A small, faint brush used to shrink the search and weaken the fill.
  await lowerBrushOpacity(page, 20);
  await page.getByLabel('Size', { exact: true }).fill('18');
  await marquee(page, [55, 55], [145, 145]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Content-Aware Fill…', exact: true }).click();
  await expect(page.getByText('Content-Aware Fill applied locally; source and alpha remain unchanged', { exact: true })).toBeVisible();
  // The red block, centre included, is replaced by its white surroundings.
  for (const [x, y] of [[100, 100], [72, 72], [128, 100]]) {
    const pixel = await documentPixel(page, x, y);
    expect(pixel.slice(0, 3), `${x},${y}`).toEqual([255, 255, 255]);
  }
  const saved = await project(page);
  const fill = saved.history[saved.index].layers.at(-1)!.contentAwareFills![0];
  expect(fill.opacity).toBe(1);
  expect(fill.radius).toBeGreaterThanOrEqual(45);
});

test('Content-Aware Fill says so when the selection has no surroundings to sample', async ({ page }) => {
  await openRedBlock(page);
  await page.keyboard.press('Control+a');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Content-Aware Fill…', exact: true }).click();
  await expect(page.getByText('Content-Aware Fill found no unselected pixels around the selection; nothing changed', { exact: true })).toBeVisible();
  const saved = await project(page);
  expect(saved.history[saved.index].layers.at(-1)!.contentAwareFills ?? []).toHaveLength(0);
});
