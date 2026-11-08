import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { flattenStrokePath, type FlatContour } from '../../src/strokePath';
import type { PathModel } from '../../src/paths';

// Stroke Path with Brush paints the current brush along a Pen path's Bezier
// curves onto a raster layer, with simulated pressure tapers, as one undo
// step confined to the active selection.

type Layer = { id: string; kind: string; visible: boolean; matrix: number[]; path?: PathModel; name: string };
type Project = { history: Array<{ w: number; h: number; layers: Layer[]; active: string }>; index: number };

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const settled = (page: Page) => expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
});

async function setColor(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).evaluate((input: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function at(page: Page, x: number, y: number) {
  return canvas(page).evaluate((element: HTMLCanvasElement, point) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + (point.x / element.width) * rect.width, y: rect.top + (point.y / element.height) * rect.height };
  }, { x, y });
}

const pixel = (page: Page, x: number, y: number) =>
  canvas(page).evaluate((element: HTMLCanvasElement, point) =>
    Array.from(element.getContext('2d')!.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data), { x, y });

async function project(page: Page): Promise<Project> {
  await saved(page);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return await downloadedProject((await (await pending).path())!);
}

async function upload(page: Page, value: Project) {
  await page.getByTestId('project-input').setInputFiles({
    name: 'stroke-path.pixelforge', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)),
  });
  await expect(page.locator('footer')).toContainText('Project opened with editable layers and history');
  await settled(page);
}

/** Draw a closed smooth path with the Curvature Pen (the editor's own tool). */
async function drawCurvaturePath(page: Page) {
  await selectTool(page, 'Curvature Pen');
  for (const [x, y] of [[200, 200], [700, 160], [900, 600], [200, 200]]) {
    const point = await at(page, x, y);
    await page.mouse.click(point.x, point.y);
  }
  await expect(page.locator('footer')).toContainText('Editable curvature path layer added');
  await settled(page);
}

/**
 * Replace the drawn path with `path` (or keep it) and hide the path layer so
 * only the stroke paints pixels; the hidden path stays strokeable.
 */
async function hidePathLayer(page: Page, path?: PathModel, matrix?: number[]) {
  const value = await project(page);
  const frame = value.history[value.index];
  const layer = frame.layers.find((item) => item.kind === 'path')!;
  layer.visible = false;
  if (path) layer.path = path;
  if (matrix) layer.matrix = matrix;
  frame.active = layer.id;
  await upload(page, value);
  return { ...layer, path: layer.path! };
}

async function setBrush(page: Page, size: string, color: string) {
  await selectTool(page, 'Brush');
  await page.getByLabel('Size', { exact: true }).fill(size);
  await page.getByLabel('Size', { exact: true }).press('Enter');
  await setColor(page, 'Drawing color', color);
}

async function openStrokePath(page: Page) {
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Stroke Path with Brush…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Stroke Path with Brush' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function menu(page: Page, item: RegExp) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
  await settled(page);
}

/** Point and unit normal on a flattened contour at a fraction of its length. */
function along(contour: FlatContour, fraction: number) {
  let remaining = contour.length * fraction;
  for (let index = 1; index < contour.points.length; index += 1) {
    const a = contour.points[index - 1], b = contour.points[index], length = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= length && length > 0) {
      const t = remaining / length;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, nx: -(b.y - a.y) / length, ny: (b.x - a.x) / length };
    }
    remaining -= length;
  }
  const last = contour.points.at(-1)!;
  return { x: last.x, y: last.y, nx: 0, ny: 1 };
}

// An open arch: a straight chord from (200, 600) to (1000, 600) would be the
// wrong answer; the curve peaks near y = 375.
const arch: PathModel = {
  nodes: [
    { x: 200, y: 600, outHandle: { x: 400, y: 300 } },
    { x: 1000, y: 600, inHandle: { x: 800, y: 300 } },
  ],
  closed: false,
  fill: false,
  stroke: true,
  strokeWidth: 1,
  fillColor: '#000000',
  strokeColor: '#000000',
};

test('strokes an open Bezier path with a tapered brush; undo, redo and reload keep one step', async ({ page }) => {
  await drawCurvaturePath(page);
  const layer = await hidePathLayer(page, arch);
  await setBrush(page, '30', '#ff0000');
  const dialog = await openStrokePath(page);
  await expect(dialog.getByLabel('Path to stroke')).toHaveValue(layer.id);
  await expect(dialog.getByLabel('Stroke target layer')).not.toHaveValue('');
  await expect(dialog.getByLabel('Simulate pressure')).toBeChecked();
  await dialog.getByLabel('Taper start (%)').fill('30');
  await dialog.getByLabel('Taper end (%)').fill('30');
  await dialog.getByLabel('Minimum size (%)').fill('0');
  await dialog.getByRole('button', { name: 'Stroke path', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Path stroked with Brush (simulated pressure)');
  await settled(page);

  const [contour] = flattenStrokePath(arch);
  const middle = along(contour, 0.5);
  expect(Math.round(middle.y)).toBe(375);
  // On the curve: painted red. On the straight chord: untouched.
  const centre = await pixel(page, middle.x, middle.y);
  expect(centre[3]).toBeGreaterThan(240);
  expect(centre[0]).toBeGreaterThan(240);
  expect(centre[1]).toBeLessThan(20);
  expect(await pixel(page, 600, 600)).toEqual([0, 0, 0, 0]);
  expect(await pixel(page, 600, 500)).toEqual([0, 0, 0, 0]);
  // Full width (radius 15) in the body; tapered to a point at the tips.
  for (const fraction of [0.4, 0.5, 0.6]) {
    const point = along(contour, fraction);
    expect((await pixel(page, point.x + point.nx * 11, point.y + point.ny * 11))[3], `body ${fraction}`).toBeGreaterThan(200);
    expect(await pixel(page, point.x + point.nx * 22, point.y + point.ny * 22), `outside ${fraction}`).toEqual([0, 0, 0, 0]);
  }
  for (const fraction of [0.02, 0.98]) {
    const point = along(contour, fraction);
    expect(await pixel(page, point.x + point.nx * 9, point.y + point.ny * 9), `tip ${fraction}`).toEqual([0, 0, 0, 0]);
  }
  // A quarter of the way in the stroke is visibly thinner than the body.
  const quarter = along(contour, 0.12);
  expect((await pixel(page, quarter.x, quarter.y))[3]).toBeGreaterThan(200);
  expect(await pixel(page, quarter.x + quarter.nx * 11, quarter.y + quarter.ny * 11)).toEqual([0, 0, 0, 0]);

  await menu(page, /^Undo/);
  expect(await pixel(page, middle.x, middle.y)).toEqual([0, 0, 0, 0]);
  // Undo returns to the layer before the stroke, with the path untouched.
  const undone = await project(page);
  expect(undone.history[undone.index].layers.find((item) => item.kind === 'path')!.path).toEqual(arch);
  await menu(page, /^Redo/);
  expect((await pixel(page, middle.x, middle.y))[3]).toBeGreaterThan(240);

  await saved(page);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await settled(page);
  expect((await pixel(page, middle.x, middle.y))[3]).toBeGreaterThan(240);
  expect(await pixel(page, 600, 600)).toEqual([0, 0, 0, 0]);
});

test('a drawn Curvature Pen path is stroked only inside the active selection', async ({ page }) => {
  await drawCurvaturePath(page);
  const layer = await hidePathLayer(page);
  const [contour] = flattenStrokePath(layer.path, layer.matrix as unknown as readonly [number, number, number, number, number, number]);
  expect(contour.closed).toBe(true);
  await setBrush(page, '24', '#00ff00');
  // Select the left half of the canvas.
  await selectTool(page, 'Select');
  const a = await at(page, 0, 0), b = await at(page, 600, 800);
  await page.mouse.move(a.x + 1, a.y + 1);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('footer')).toContainText(/selection/i);

  const dialog = await openStrokePath(page);
  await dialog.getByLabel('Simulate pressure').uncheck();
  await expect(dialog.getByLabel('Taper start (%)')).toBeDisabled();
  await dialog.getByRole('button', { name: 'Stroke path', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Path stroked with Brush');
  await settled(page);

  let inside = 0, outside = 0;
  for (let step = 0; step < 40; step += 1) {
    const point = along(contour, step / 40);
    if (point.x < 580) {
      const value = await pixel(page, point.x, point.y);
      expect(value[1], `inside ${step}`).toBeGreaterThan(240);
      inside += 1;
    } else if (point.x > 620) {
      expect(await pixel(page, point.x, point.y), `outside ${step}`).toEqual([0, 0, 0, 0]);
      outside += 1;
    }
  }
  expect(inside).toBeGreaterThan(5);
  expect(outside).toBeGreaterThan(5);

  await menu(page, /^Undo/);
  const start = along(contour, 0);
  expect(await pixel(page, start.x, start.y)).toEqual([0, 0, 0, 0]);
});

test('the Eraser follows a transformed path and the dialog cancels without a history step', async ({ page }) => {
  // Fill the paint layer, then erase along a path whose layer is scaled and moved.
  await setColor(page, 'Drawing color', '#3366ff');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Fill/ }).first().click();
  await page.getByRole('dialog', { name: 'Fill' }).getByRole('button', { name: 'Fill', exact: true }).click();
  await settled(page);
  expect((await pixel(page, 600, 400))[3]).toBe(255);
  await drawCurvaturePath(page);
  const line: PathModel = { ...arch, nodes: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
  await hidePathLayer(page, line, [4, 0, 0, 4, 200, 400]);
  await setBrush(page, '20', '#000000');

  const before = await project(page);
  const cancel = await openStrokePath(page);
  await cancel.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(cancel).toBeHidden();
  expect((await project(page)).history.length).toBe(before.history.length);

  const dialog = await openStrokePath(page);
  await dialog.getByLabel('Stroke tool').selectOption('eraser');
  await dialog.getByLabel('Simulate pressure').uncheck();
  await dialog.getByRole('button', { name: 'Stroke path', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Path stroked with Eraser');
  await settled(page);
  // The local 0..100 line maps to canvas x 200..600 at y = 400.
  for (const x of [210, 400, 590]) expect((await pixel(page, x, 400))[3], `erased ${x}`).toBe(0);
  for (const [x, y] of [[700, 400], [400, 430], [150, 400]]) expect((await pixel(page, x, y))[3], `kept ${x},${y}`).toBe(255);
});
