import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

/*
 * Toolbar audit 2026-11: B-05 (Magic Wand / Fill Tolerance, Contiguous and
 * Sample All Layers) and B-12 (Type Mask never edits existing text layers).
 * Contracts: docs/color-region-contract.md, docs/type-tool-contract.md.
 */

type Layer = { kind: string; text?: string; name?: string };
type Project = {
  history: Array<{ layers: Layer[]; selection?: { mask?: string } }>;
  index: number;
  assets: Record<string, { url: string; w: number; h: number }>;
};
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

const saved = async (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');

async function project(page: Page): Promise<Project> {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return (await downloadedProject((await (await pending).path())!)) as Project;
}

const clickAt = async (page: Page, fx: number, fy: number) => {
  const point = await at(page, fx, fy);
  await page.mouse.click(point.x, point.y);
};
const at = async (page: Page, fx: number, fy: number) => {
  const canvas = page.getByTestId('editor-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
};

/** Rendered document RGBA at fractions of the canvas. */
const rendered = async (page: Page, points: [number, number][]) => {
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  return page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement, list) =>
    list.map(([x, y]) =>
      Array.from(canvas.getContext('2d')!.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data),
    ), points);
};

/** Paint a full-height vertical bar at x = 0.5 so the white canvas splits in two. */
async function paintDivider(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /^New white document/ }).click();
  await expect.poll(async () => (await rendered(page, [[0.8, 0.5]]))[0].join()).toBe('255,255,255,255');
  await selectTool(page, 'Pencil');
  await page.getByLabel('Drawing color', { exact: true }).fill('#000000');
  await page.getByLabel('Size', { exact: true }).fill('24');
  const top = await at(page, 0.5, 0), bottom = await at(page, 0.5, 1);
  await page.mouse.move(top.x, top.y + 1);
  await page.mouse.down();
  await page.mouse.move(bottom.x, bottom.y - 1, { steps: 20 });
  await page.mouse.up();
  await expect.poll(async () => (await rendered(page, [[0.5, 0.5]]))[0][0]).toBeLessThan(40);
}

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await saved(page);
});

test('B-05 Fill and Magic Wand show Tolerance, Contiguous and Sample All Layers, persisted', async ({ page }) => {
  for (const tool of ['Fill', 'Magic Wand']) {
    await selectTool(page, tool);
    await expect(page.getByTestId('tool-options-empty')).toHaveCount(0);
    await expect(page.getByRole('slider', { name: 'Color tolerance', exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Contiguous', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Sample All Layers', exact: true })).not.toBeChecked();
    // Painting Size is not a Fill / Magic Wand option.
    await expect(page.getByRole('spinbutton', { name: 'Size', exact: true })).toHaveCount(0);
  }
  await page.getByRole('checkbox', { name: 'Contiguous', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Sample All Layers', exact: true }).check();
  await page.getByRole('slider', { name: 'Color tolerance', exact: true }).fill('40');
  await saved(page);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Fill');
  await expect(page.getByRole('checkbox', { name: 'Contiguous', exact: true })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Sample All Layers', exact: true })).toBeChecked();
  await expect(page.getByRole('slider', { name: 'Color tolerance', exact: true })).toHaveValue('40');
});

test('B-05 Fill honours Contiguous and Tolerance', async ({ page }) => {
  await paintDivider(page);
  await page.getByLabel('Drawing color', { exact: true }).fill('#00ff00');
  await selectTool(page, 'Fill');
  await clickAt(page, 0.2, 0.5);
  await expect(page.locator('footer')).toContainText('Area filled');
  let [l, r] = await rendered(page, [[0.2, 0.5], [0.8, 0.5]]);
  expect(l.slice(0, 3)).toEqual([0, 255, 0]);
  expect(r[1]).toBeGreaterThan(200);
  expect(r[0]).toBeGreaterThan(200); // right side still white: contiguous

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect.poll(async () => (await rendered(page, [[0.2, 0.5]]))[0][0]).toBeGreaterThan(200);
  await page.getByRole('checkbox', { name: 'Contiguous', exact: true }).uncheck();
  await clickAt(page, 0.2, 0.5);
  await expect.poll(async () => (await rendered(page, [[0.8, 0.5]]))[0].slice(0, 3).join()).toBe('0,255,0');
  [l, r] = await rendered(page, [[0.2, 0.5], [0.5, 0.5]]);
  expect(l.slice(0, 3)).toEqual([0, 255, 0]);
  // The black divider is outside tolerance and keeps its colour.
  expect(r[1]).toBeLessThan(40);
});

test('B-05 Magic Wand honours Contiguous and samples all layers on request', async ({ page }) => {
  await paintDivider(page);
  await selectTool(page, 'Magic Wand');
  await clickAt(page, 0.2, 0.5);
  await expect(page.locator('footer')).toContainText('Magic Wand selection created (tolerance 24, contiguous)');
  await expect(page.getByTestId('selection-outline')).toBeVisible();
  const contiguousRuns = Number(await page.getByTestId('selection-outline').getAttribute('data-segments'));
  await page.getByRole('checkbox', { name: 'Contiguous', exact: true }).uncheck();
  await clickAt(page, 0.2, 0.5);
  await expect(page.locator('footer')).toContainText('Magic Wand selection created (tolerance 24)');
  // Both white halves are selected now, so the outline traces two regions.
  await expect.poll(async () => Number(await page.getByTestId('selection-outline').getAttribute('data-segments'))).toBeGreaterThan(contiguousRuns);

  // A new empty layer: active-layer sampling finds nothing to select, while
  // Sample All Layers selects from the merged image.
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Paint Layer', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Layer added');
  await selectTool(page, 'Magic Wand');
  await page.getByRole('checkbox', { name: 'Contiguous', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Sample All Layers', exact: true }).check();
  await clickAt(page, 0.2, 0.5);
  await expect(page.locator('footer')).toContainText('Magic Wand selection created (tolerance 24, contiguous, all layers)');
  await expect.poll(async () => Number(await page.getByTestId('selection-outline').getAttribute('data-segments'))).toBe(contiguousRuns);
});

test('B-12 Type Mask clicked on existing type starts a new mask and leaves the layer untouched', async ({ page }) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await selectTool(page, 'Horizontal Type');
  await page.getByLabel('Text content', { exact: true }).fill('');
  const spot = await at(page, 0.2, 0.3);
  await page.mouse.click(spot.x, spot.y);
  await page.keyboard.type('Audit');
  await page.keyboard.press(`${mod}+Enter`);
  await expect.poll(async () => (await project(page)).history.at(-1)!.layers.find((layer) => layer.kind === 'text')?.text).toBe('Audit');

  await selectTool(page, 'Horizontal Type Mask');
  // Click on the existing "Audit" glyphs.
  const onText = await at(page, 0.21, 0.29);
  await page.mouse.click(onText.x, onText.y);
  await expect(page.getByTestId('type-editor')).toHaveAttribute('data-mask', 'true');
  await page.keyboard.type('MASK');
  await page.keyboard.press(`${mod}+Enter`);
  await expect(page.getByText('Horizontal Type Mask selection created', { exact: true })).toBeVisible();
  const saved = await project(page);
  const frame = saved.history[saved.index];
  const texts = frame.layers.filter((layer) => layer.kind === 'text');
  expect(texts).toHaveLength(1);
  expect(texts[0].text).toBe('Audit');
  expect(frame.selection?.mask).toBeTruthy();
  await expect(page.getByTestId('selection-outline')).toBeVisible();
});
