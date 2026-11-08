import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

type PathNode = { x: number; y: number; inHandle?: { x: number; y: number }; outHandle?: { x: number; y: number } };
type Layer = {
  id: string;
  kind: string;
  name: string;
  matrix: number[];
  width?: number;
  height?: number;
  fill?: boolean;
  color?: string;
  cornerRadius?: number;
  path?: { nodes: PathNode[]; fill: boolean; stroke: boolean; fillColor: string; contours?: Array<{ nodes: PathNode[] }> };
};
type Project = {
  history: Array<{ w: number; h: number; layers: Layer[] }>;
  index: number;
  settings: { tool?: string; shapeCornerRadius?: number; customShapeId?: string };
};

const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');

async function project(page: Page): Promise<Project> {
  await saved(page);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return (await downloadedProject((await (await pending).path())!)) as Project;
}

const canvas = (page: Page) => page.getByTestId('editor-canvas');

/** RGBA of one composite canvas pixel in document coordinates. */
const pixel = (page: Page, x: number, y: number) =>
  canvas(page).evaluate((element: HTMLCanvasElement, point) =>
    Array.from(element.getContext('2d')!.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data), { x, y });

async function rendered(page: Page) {
  await expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
}

/** Drag across the canvas between two fractions of its on-screen box. */
async function drag(page: Page, from: [number, number], to: [number, number], modifier?: 'Shift' | 'Alt') {
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  if (modifier) await page.keyboard.down(modifier);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 6 });
  await page.mouse.up();
  if (modifier) await page.keyboard.up(modifier);
}

async function undo(page: Page) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
}

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await page.getByLabel('Drawing color', { exact: true }).fill('#ff0000');
});

test('Rounded Rectangle draws a filled shape with transparent rounded corners and an editable radius', async ({ page }) => {
  await selectTool(page, 'Rounded Rectangle');
  const radius = page.getByRole('slider', { name: 'Corner radius', exact: true });
  await expect(radius).toBeVisible();
  await radius.fill('60');
  await expect(radius).toHaveValue('60');
  await drag(page, [0.15, 0.15], [0.75, 0.8]);
  await rendered(page);

  let value = await project(page);
  let layer = value.history[value.index].layers.at(-1)!;
  expect(layer).toMatchObject({ kind: 'rectangle', fill: true, color: '#ff0000', cornerRadius: 60 });
  expect(value.settings).toMatchObject({ tool: 'rounded-rectangle', shapeCornerRadius: 60 });
  const left = layer.matrix[4], top = layer.matrix[5], width = layer.width!, height = layer.height!;
  expect(Math.min(width, height)).toBeGreaterThan(130);
  const corner = { x: left + 3, y: top + 3 };
  const centre = { x: left + width / 2, y: top + height / 2 };
  const edge = { x: left + 2, y: top + height / 2 };
  await expect.poll(() => pixel(page, corner.x, corner.y)).toEqual([0, 0, 0, 0]);
  await expect.poll(() => pixel(page, centre.x, centre.y)).toEqual([255, 0, 0, 255]);
  await expect.poll(() => pixel(page, edge.x, edge.y)).toEqual([255, 0, 0, 255]);

  // The radius stays editable on the layer: square corners fill the corner pixel.
  const field = page.getByRole('spinbutton', { name: 'Corner radius', exact: true });
  await expect(field).toHaveValue('60');
  await field.fill('0');
  await field.press('Enter');
  await rendered(page);
  await expect.poll(() => pixel(page, corner.x, corner.y)).toEqual([255, 0, 0, 255]);

  // Undo restores the rounded corner.
  await undo(page);
  await rendered(page);
  await expect(page.getByRole('spinbutton', { name: 'Corner radius', exact: true })).toHaveValue('60');
  await expect.poll(() => pixel(page, corner.x, corner.y)).toEqual([0, 0, 0, 0]);

  // Draft reload keeps the layer radius, the tool and its option.
  await saved(page);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await rendered(page);
  await expect.poll(() => pixel(page, corner.x, corner.y)).toEqual([0, 0, 0, 0]);
  await expect.poll(() => pixel(page, centre.x, centre.y)).toEqual([255, 0, 0, 255]);
  await expect(page.getByRole('slider', { name: 'Corner radius', exact: true })).toHaveValue('60');
  value = await project(page);
  layer = value.history[value.index].layers.at(-1)!;
  expect(layer).toMatchObject({ kind: 'rectangle', cornerRadius: 60, width, height });
});

test('Rounded Rectangle with Shift draws a square and clamps an oversized radius', async ({ page }) => {
  await selectTool(page, 'Rounded Rectangle');
  await page.getByRole('slider', { name: 'Corner radius', exact: true }).fill('500');
  await drag(page, [0.2, 0.2], [0.5, 0.35], 'Shift');
  await rendered(page);
  const value = await project(page);
  const layer = value.history[value.index].layers.at(-1)!;
  expect(layer.kind).toBe('rectangle');
  expect(Math.abs(layer.width! - layer.height!)).toBeLessThanOrEqual(1);
  // The stored radius exceeds half a side; rendering clamps it to a circle.
  expect(layer.cornerRadius).toBe(500);
  const r = layer.width! / 2, cx = layer.matrix[4] + r, cy = layer.matrix[5] + r;
  await expect.poll(() => pixel(page, cx, cy)).toEqual([255, 0, 0, 255]);
  await expect.poll(() => pixel(page, layer.matrix[4] + r * 0.2, layer.matrix[5] + r * 0.2)).toEqual([0, 0, 0, 0]);
  await expect.poll(() => pixel(page, cx, layer.matrix[5] + 3)).toEqual([255, 0, 0, 255]);
});

test('Custom Shape draws a library shape as an editable filled path with undo and reload', async ({ page }) => {
  await selectTool(page, 'Custom Shape');
  const plus = page.getByRole('radio', { name: 'Plus', exact: true });
  await expect(page.getByRole('radio', { name: 'Heart', exact: true })).toBeChecked();
  await expect(page.locator('.custom-shape-grid input[type="radio"]')).toHaveCount(15);
  await plus.check();
  await expect(plus).toBeChecked();
  await drag(page, [0.2, 0.2], [0.7, 0.6]);
  await rendered(page);

  let value = await project(page);
  const before = value.history[value.index].layers.length;
  const layer = value.history[value.index].layers.at(-1)!;
  expect(layer.kind).toBe('path');
  expect(layer.name).toMatch(/^Plus /);
  expect(layer.path).toMatchObject({ fill: true, stroke: false, fillColor: '#ff0000' });
  expect(value.settings.customShapeId).toBe('plus');
  const xs = layer.path!.nodes.map((node) => node.x), ys = layer.path!.nodes.map((node) => node.y);
  const width = Math.max(...xs), height = Math.max(...ys);
  expect(Math.min(...xs)).toBe(0);
  expect(Math.min(...ys)).toBe(0);
  const box = (await canvas(page).boundingBox())!;
  const frame = value.history[value.index];
  // Bounds follow the drag (in document pixels) within rounding.
  expect(width).toBeCloseTo(frame.w * 0.5, -1);
  expect(height).toBeCloseTo(frame.h * 0.4, -1);
  expect(layer.matrix[4]).toBeCloseTo(frame.w * 0.2, -1);
  expect(box.width).toBeGreaterThan(0);

  const left = layer.matrix[4], top = layer.matrix[5];
  await expect.poll(() => pixel(page, left + width / 2, top + height / 2)).toEqual([255, 0, 0, 255]);
  await expect.poll(() => pixel(page, left + width / 2, top + 3)).toEqual([255, 0, 0, 255]);
  await expect.poll(() => pixel(page, left + width * 0.1, top + height * 0.1)).toEqual([0, 0, 0, 0]);
  await expect.poll(() => pixel(page, left + width * 0.9, top + height * 0.9)).toEqual([0, 0, 0, 0]);

  // Undo removes the new path layer and its pixels.
  await undo(page);
  await rendered(page);
  await expect.poll(() => pixel(page, left + width / 2, top + height / 2)).toEqual([0, 0, 0, 0]);
  value = await project(page);
  expect(value.history[value.index].layers.length).toBe(before - 1);

  // The picked library shape survives a reload.
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('radio', { name: 'Plus', exact: true })).toBeChecked();
});

test('Custom Shape with Shift keeps the shape proportions and Alt draws from the centre', async ({ page }) => {
  await selectTool(page, 'Custom Shape');
  await page.getByRole('radio', { name: 'Heart', exact: true }).check();
  await drag(page, [0.3, 0.3], [0.8, 0.45], 'Shift');
  await rendered(page);
  let value = await project(page);
  let layer = value.history[value.index].layers.at(-1)!;
  let xs = layer.path!.nodes.flatMap((node) => [node.x, node.inHandle?.x ?? node.x, node.outHandle?.x ?? node.x]);
  let ys = layer.path!.nodes.flatMap((node) => [node.y, node.inHandle?.y ?? node.y, node.outHandle?.y ?? node.y]);
  // The heart is designed 100 × 92; Shift keeps that ratio.
  expect(Math.max(...xs) / Math.max(...ys)).toBeCloseTo(100 / 92, 1);
  const heartLeft = layer.matrix[4], heartTop = layer.matrix[5];
  const w = Math.max(...xs), h = Math.max(...ys);
  // Lobes are filled, the notch between them and the lower corners are empty.
  await expect.poll(() => pixel(page, heartLeft + w * 0.28, heartTop + h * 0.2)).toEqual([255, 0, 0, 255]);
  await expect.poll(() => pixel(page, heartLeft + w * 0.5, heartTop + h * 0.6)).toEqual([255, 0, 0, 255]);
  await expect.poll(() => pixel(page, heartLeft + w * 0.5, heartTop + 2)).toEqual([0, 0, 0, 0]);
  await expect.poll(() => pixel(page, heartLeft + w * 0.05, heartTop + h * 0.95)).toEqual([0, 0, 0, 0]);

  await page.getByRole('radio', { name: 'Arrow', exact: true }).check();
  const box = (await canvas(page).boundingBox())!;
  const frame = value.history[value.index];
  await drag(page, [0.5, 0.5], [0.6, 0.6], 'Alt');
  await rendered(page);
  value = await project(page);
  layer = value.history[value.index].layers.at(-1)!;
  xs = layer.path!.nodes.map((node) => node.x);
  ys = layer.path!.nodes.map((node) => node.y);
  // Alt: the drag start is the centre of the drawn box.
  expect(layer.matrix[4] + Math.max(...xs) / 2).toBeCloseTo(frame.w * 0.5, -1);
  expect(layer.matrix[5] + Math.max(...ys) / 2).toBeCloseTo(frame.h * 0.5, -1);
  expect(Math.max(...xs)).toBeCloseTo(frame.w * 0.2, -1);
  expect(box.width).toBeGreaterThan(0);
});

test('U cycles through the shape family and the flyout lists every shape tool', async ({ page }) => {
  await selectTool(page, 'Shape');
  const palette = page.getByTestId('tool-palette');
  const expected = ['Rounded Rectangle', 'Ellipse', 'Line', 'Polygon', 'Custom Shape', 'Shape'];
  await canvas(page).focus().catch(() => undefined);
  for (const label of expected) {
    await page.keyboard.press('u');
    await expect(palette.getByRole('button', { name: `${label} tool`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  const representative = palette.getByRole('button', { name: 'Shape tool', exact: true });
  await representative.click({ button: 'right' });
  const flyout = page.locator('.tool-flyout[role="menu"]');
  await expect(flyout).toBeVisible();
  for (const label of ['Rounded Rectangle', 'Custom Shape'])
    await expect(flyout.getByRole('menuitem', { name: label, exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(flyout).toBeHidden();
});
