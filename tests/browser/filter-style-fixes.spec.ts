import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';
import { openPanel } from './sidebar-panels';

type Layer = {
  kind: string;
  mask?: string;
  styles?: Record<string, { enabled?: boolean }>;
  smartFilters?: Array<{ type: string }>;
  adjustments: { filterEffects?: { type?: string; lightRays?: Record<string, unknown> } };
};
type Project = { history: Array<{ layers: Layer[] }>; index: number };

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const settled = (page: Page) =>
  expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });
const footer = (page: Page) => page.locator('footer');

async function menu(page: Page, name: string, item: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

async function canvasSize(page: Page, width: number, height: number) {
  await menu(page, 'Image', 'Canvas Size…');
  await page.getByLabel('Width (px)').fill(String(width));
  await page.getByLabel('Height (px)').fill(String(height));
  await page.getByRole('button', { name: 'Apply canvas size', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveJSProperty('width', width);
  await settled(page);
}

async function project(page: Page): Promise<Project> {
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device', { timeout: 30_000 });
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return (await downloadedProject((await download.path())!)) as Project;
}
const activeLayer = (value: Project) => value.history[value.index].layers.at(-1)!;

/** FNV-1a fingerprint of the whole composite. */
const digest = (page: Page) =>
  page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0x811c9dc5;
    for (let i = 0; i < data.length; i += 1) hash = Math.imul(hash ^ data[i], 0x01000193);
    return (hash >>> 0).toString(16);
  });

const pixel = (page: Page, x: number, y: number) =>
  page.getByTestId('editor-canvas').evaluate(
    (canvas: HTMLCanvasElement, [px, py]) => Array.from(canvas.getContext('2d')!.getImageData(px, py, 1, 1).data),
    [x, y],
  );

/** Undo through the Edit menu. */
async function undo(page: Page) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await settled(page);
}

/**
 * A full-canvas Clouds paint layer masked to an ellipse in the middle of the
 * visible canvas. Returns the ellipse's top and bottom rows on the centre
 * column.
 */
async function maskedClouds(page: Page) {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await selectTool(page, 'Elliptical marquee');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  const viewport = page.viewportSize()!;
  const left = Math.max(box.x, 0), top = Math.max(box.y, 0);
  const right = Math.min(box.x + box.width, viewport.width), bottom = Math.min(box.y + box.height, viewport.height);
  await page.mouse.move(left + (right - left) * 0.25, top + (bottom - top) * 0.25);
  await page.mouse.down();
  await page.mouse.move(left + (right - left) * 0.75, top + (bottom - top) * 0.75, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText(/Elliptical selection created/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Mask from selection', exact: true }).click();
  await expect(page.getByText('Nondestructive mask active', { exact: true })).toBeVisible();
  await settled(page);
  const column = () =>
    canvas.evaluate((element: HTMLCanvasElement) => {
      const x = Math.floor(element.width / 2);
      return Array.from(element.getContext('2d')!.getImageData(x, 0, 1, element.height).data);
    });
  const before = await column();
  await menu(page, 'Filter', 'Clouds');
  await settled(page);
  const after = await column();
  // The masked clouds change the composite only inside the ellipse.
  const rows: number[] = [];
  for (let y = 0; y < after.length / 4; y += 1)
    if ([0, 1, 2, 3].some((channel) => after[y * 4 + channel] !== before[y * 4 + channel])) rows.push(y);
  const size = await canvas.evaluate((element: HTMLCanvasElement) => ({ width: element.width, height: element.height }));
  return { x: Math.floor(size.width / 2), top: rows[0], bottom: rows.at(-1)!, ...size };
}

test('a second Filter-menu effect stacks the live Clouds instead of failing validation', async ({ page }) => {
  test.setTimeout(120_000);
  await canvasSize(page, 320, 240);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await menu(page, 'Filter', 'Clouds');
  await settled(page);
  await openPanel(page, 'Filters');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('clouds');
  const cloudsOnly = await digest(page);

  await menu(page, 'Filter', 'Motion Blur…');
  await settled(page);
  await expect(footer(page)).toContainText(
    'Clouds moved to the filter stack (1/8); Motion Blur applied on top and remains editable in Filter effects',
  );
  await expect(footer(page)).not.toContainText('Invalid layer document');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('motion-blur');
  await expect(page.getByRole('group', { name: 'Filter stack' })).toContainText('1. Clouds');
  await page.getByLabel('Blur radius', { exact: true }).fill('24');
  await settled(page);
  await expect.poll(() => digest(page)).not.toEqual(cloudsOnly);

  const stacked = activeLayer(await project(page));
  expect(stacked.smartFilters?.map((entry) => entry.type)).toEqual(['clouds']);
  expect(stacked.adjustments.filterEffects).toMatchObject({ type: 'motion-blur', radius: 24 });
  expect(stacked.adjustments.filterEffects).not.toHaveProperty('cloudRender');

  // Choosing the type from the Filter effect list switches the live filter in place.
  await page.getByLabel('Filter effect', { exact: true }).selectOption('gaussian-blur');
  await settled(page);
  await expect(footer(page)).toContainText('replaced Motion blur as the live filter');
  await expect(page.getByRole('group', { name: 'Filter stack' })).toContainText('1. Clouds');
  await expect(page.getByRole('group', { name: 'Filter stack' })).not.toContainText('2.');

  // Each step is one undo: the radius, the switch, then the stacking edit.
  await undo(page);
  await undo(page);
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('motion-blur');
  await undo(page);
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('clouds');
  await expect(page.getByRole('button', { name: /Add filter to stack \(0\/8\)/ })).toBeVisible();
  await expect.poll(() => digest(page)).toEqual(cloudsOnly);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await settled(page);
  await openPanel(page, 'Filters');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('clouds');
});

test('scrubbing a live filter above a stacked Clouds reuses the cached stack', async ({ page }) => {
  test.setTimeout(180_000);
  await canvasSize(page, 1200, 1200);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await menu(page, 'Filter', 'Clouds');
  await settled(page);
  await menu(page, 'Filter', 'Motion Blur…');
  await settled(page);
  await expect(footer(page)).toContainText('Clouds moved to the filter stack (1/8)');
  await page.getByLabel('Blur radius', { exact: true }).fill('24');
  await settled(page);
  await page.evaluate(() => performance.clearMarks('pixelforge.layer-filter-cache'));
  await page.getByLabel('Blur radius', { exact: true }).fill('32');
  await settled(page);
  const stats = await page.evaluate(() =>
    (performance.getEntriesByName('pixelforge.layer-filter-cache', 'mark') as PerformanceMark[]).map(
      (mark) => mark.detail as { hits: number; misses: number },
    ),
  );
  expect(stats.length).toBeGreaterThanOrEqual(1);
  // The stacked Clouds surface is reused; only the live Motion Blur is recomputed.
  expect(stats.reduce((total, item) => total + item.hits, 0)).toBeGreaterThanOrEqual(1);
});

test('layer styles follow the layer mask, Inner Shadow is directional, and Rasterize keeps styles', async ({ page }) => {
  test.setTimeout(180_000);
  await canvasSize(page, 400, 300);
  const shape = await maskedClouds(page);
  expect(shape.top).toBeGreaterThan(20);
  expect(shape.bottom).toBeLessThan(shape.height - 20);
  const nearTop = { x: shape.x, y: shape.top + 5 };
  const nearBottom = { x: shape.x, y: shape.bottom - 5 };
  const beforeTop = await pixel(page, nearTop.x, nearTop.y);
  const beforeBottom = await pixel(page, nearBottom.x, nearBottom.y);

  // Inner Shadow with a downward offset: the masked ellipse is shaded along
  // its top inner edge only (the old renderer used the unmasked full-canvas
  // alpha, so nothing changed inside the ellipse).
  await openPanel(page, 'Layer styles');
  await page.getByLabel('Enable inner shadow', { exact: true }).check();
  await settled(page);
  for (const [label, value] of [['Inner shadow X', '0'], ['Inner shadow Y', '20']] as const) {
    await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByLabel(label, { exact: true }).press('Enter');
    await settled(page);
  }
  await page.getByLabel('Inner shadow distance', { exact: true }).fill('1');
  await settled(page);
  await page.getByLabel('Inner shadow blur', { exact: true }).fill('0');
  await settled(page);
  const shadedTop = await pixel(page, nearTop.x, nearTop.y);
  const sum = (value: number[]) => value[0] + value[1] + value[2];
  expect(sum(shadedTop)).toBeLessThan(sum(beforeTop) - 30);
  expect(await pixel(page, nearBottom.x, nearBottom.y)).toEqual(beforeBottom);

  // A red Normal Outer Glow appears just outside the masked ellipse.
  const outside = { x: shape.x, y: shape.bottom + 4 };
  const [r0, g0, b0] = await pixel(page, outside.x, outside.y);
  expect(r0 - Math.max(g0, b0)).toBeLessThanOrEqual(0);
  await page.getByLabel('Enable outer glow', { exact: true }).check();
  await settled(page);
  await page.getByLabel('Outer glow blend mode', { exact: true }).selectOption({ label: 'Normal' });
  await settled(page);
  await page.getByLabel('Outer glow color', { exact: true }).fill('#ff0000');
  await settled(page);
  await expect
    .poll(async () => {
      const [r, g, b] = await pixel(page, outside.x, outside.y);
      return r - Math.max(g, b);
    })
    .toBeGreaterThan(20);
  const glowOutside = await pixel(page, outside.x, outside.y);
  const styledTop = await pixel(page, nearTop.x, nearTop.y);

  const styled = activeLayer(await project(page));
  expect(styled.mask).toEqual(expect.any(String));
  expect(styled.styles?.innerShadow).toMatchObject({ enabled: true, offsetX: 0, offsetY: 20 });

  // Rasterize keeps the styles editable on the new pixels instead of dropping them.
  await menu(page, 'Layer', 'Rasterize');
  await settled(page);
  await expect(footer(page)).toContainText('Layer rasterized; layer styles kept editable on the new pixels');
  const rasterized = activeLayer(await project(page));
  expect(rasterized.kind).toBe('raster');
  expect(rasterized.mask).toBeUndefined();
  expect(rasterized.adjustments.filterEffects?.type ?? 'none').toBe('none');
  expect(rasterized.styles?.innerShadow).toMatchObject({ enabled: true, offsetY: 20 });
  expect(rasterized.styles?.outerGlow).toMatchObject({ enabled: true });
  await expect(page.getByLabel('Enable inner shadow', { exact: true })).toBeChecked();
  // The baked mask alpha carries the same shape, so the decoration is unchanged.
  const near = (a: number[], b: number[]) => a.every((value, index) => Math.abs(value - b[index]) <= 3);
  expect(near(await pixel(page, outside.x, outside.y), glowOutside)).toBe(true);
  expect(near(await pixel(page, nearTop.x, nearTop.y), styledTop)).toBe(true);
  await undo(page);
  await expect(page.getByText('Nondestructive mask active', { exact: true })).toBeVisible();
});

test('Light Rays shows the pixel radius for ray length and inner radius', async ({ page }) => {
  test.setTimeout(120_000);
  await canvasSize(page, 600, 400);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Light Rays…', exact: true }).click();
  await settled(page);
  const controls = page.getByTestId('light-rays-controls');
  // Percentages are of half the shorter side: 200 px here.
  await expect(controls.getByText('80% · 160 px', { exact: true })).toBeVisible();
  await expect(page.getByTestId('light-rays-extent')).toContainText('Rays run from 0 px to 160 px from the centre');
  await expect(page.getByTestId('light-rays-extent')).toContainText('half the layer');
  await page.getByLabel('Inner radius', { exact: true }).fill('54');
  await settled(page);
  await page.getByLabel('Ray length', { exact: true }).fill('40');
  await settled(page);
  await expect(controls.getByText('54% · 108 px', { exact: true })).toBeVisible();
  await expect(controls.getByText('40% · 80 px', { exact: true })).toBeVisible();
  await expect(page.getByTestId('light-rays-extent')).toContainText('Rays run from 108 px to 188 px from the centre');
  await expect(page.getByTestId('light-rays-extent')).toContainText('fade out by about');
  await page.getByLabel('Ray falloff', { exact: true }).fill('0');
  await settled(page);
  await expect(page.getByTestId('light-rays-extent')).not.toContainText('fade out by about');
  const saved = activeLayer(await project(page));
  // Stored values stay percentages (backward compatible with saved documents).
  expect(saved.adjustments.filterEffects?.lightRays).toMatchObject({ innerRadius: 54, length: 40, falloff: 0 });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await settled(page);
  await expect(page.getByTestId('light-rays-controls').getByText('54% · 108 px', { exact: true })).toBeVisible();
});