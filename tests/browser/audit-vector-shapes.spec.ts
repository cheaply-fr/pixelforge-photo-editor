import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

// Contract: docs/shape-tools-contract.md ("Shared Fill / Stroke options").
// Runs in the desktop and mobile projects.

type PathModel = { fill: boolean; stroke: boolean; strokeWidth: number; fillColor: string; strokeColor: string };
type Layer = {
  id: string; kind: string; name: string; matrix: number[];
  width?: number; height?: number; fill?: boolean; color?: string; stroke?: number; strokeColor?: string;
  path?: PathModel;
};
type Project = {
  history: Array<{ w: number; h: number; layers: Layer[] }>;
  index: number;
  settings: { shapeAppearance?: Record<string, unknown> };
};

const footer = (page: Page) => page.locator('footer');
const canvas = (page: Page) => page.getByTestId('editor-canvas');
const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');

async function project(page: Page): Promise<Project> {
  await saved(page);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return (await downloadedProject((await (await pending).path())!)) as Project;
}
const layers = (value: Project) => value.history[value.index].layers;
const last = (value: Project) => layers(value)[layers(value).length - 1];

/** RGBA of one composite canvas pixel in document coordinates. */
const pixel = (page: Page, x: number, y: number) =>
  canvas(page).evaluate((element: HTMLCanvasElement, point) =>
    Array.from(element.getContext('2d')!.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data), { x, y });
const rendered = (page: Page) => expect(canvas(page)).toHaveAttribute('data-rendering', 'false');

async function drag(page: Page, from: [number, number], to: [number, number]) {
  await canvas(page).scrollIntoViewIfNeeded();
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 6 });
  await page.mouse.up();
}

/** The Rectangle tool's toolbar label may be "Shape" (legacy) or "Rectangle". */
async function selectRectangle(page: Page) {
  try {
    await selectTool(page, 'Rectangle');
  } catch {
    await selectTool(page, 'Shape');
  }
}

test.describe.configure({ timeout: 120_000 });

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

test('Rectangle, Ellipse and Polygon draw filled with the foreground colour by default and are named after their tool', async ({ page }) => {
  await selectRectangle(page);
  await expect(page.getByLabel('Shape fill', { exact: true })).toHaveValue('foreground');
  await expect(page.getByLabel('Shape stroke', { exact: true })).toHaveValue('none');
  // Shape tools use Stroke width, not the brush Size.
  await expect(page.getByRole('slider', { name: 'Stroke width', exact: true })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Size', exact: true })).toHaveCount(0);
  await drag(page, [0.1, 0.1], [0.4, 0.4]);
  await expect(footer(page)).toContainText(/Rectangle \d+ added/);
  await rendered(page);
  let value = await project(page);
  const frame = value.history[value.index];
  const rect = last(value);
  expect(rect).toMatchObject({ kind: 'rectangle', fill: true, color: '#ff0000' });
  expect(rect.name).toMatch(/^Rectangle \d+$/);
  expect(rect.strokeColor).toBeUndefined();
  const centre = await pixel(page, rect.matrix[4] + rect.width! / 2, rect.matrix[5] + rect.height! / 2);
  expect(centre.slice(0, 3)).toEqual([255, 0, 0]);
  expect(centre[3]).toBe(255);

  await selectTool(page, 'Ellipse');
  await drag(page, [0.55, 0.1], [0.9, 0.4]);
  await expect(footer(page)).toContainText(/Ellipse \d+ added/);
  await selectTool(page, 'Polygon');
  await drag(page, [0.3, 0.55], [0.7, 0.9]);
  await expect(footer(page)).toContainText(/Polygon \d+ added/);
  await rendered(page);
  value = await project(page);
  const [ellipse, polygon] = layers(value).slice(-2);
  expect(ellipse).toMatchObject({ kind: 'ellipse', fill: true });
  expect(ellipse.name).toMatch(/^Ellipse \d+$/);
  expect(polygon).toMatchObject({ kind: 'polygon', fill: true });
  const ellipseCentre = await pixel(page, ellipse.matrix[4] + ellipse.width! / 2, ellipse.matrix[5] + ellipse.height! / 2);
  expect(ellipseCentre[3]).toBe(255);
  expect(frame.w).toBeGreaterThan(0);
});

test('Fill and Stroke options apply consistently, render, and persist across reload', async ({ page }) => {
  await selectRectangle(page);
  await page.getByLabel('Shape stroke', { exact: true }).selectOption('custom');
  await page.getByLabel('Shape stroke colour', { exact: true }).fill('#0000ff');
  const width = page.getByRole('slider', { name: 'Stroke width', exact: true });
  await width.fill('12');
  await drag(page, [0.1, 0.1], [0.5, 0.5]);
  await rendered(page);
  let value = await project(page);
  const both = last(value);
  expect(both).toMatchObject({ kind: 'rectangle', fill: true, color: '#ff0000', strokeColor: '#0000ff', stroke: 12 });
  const left = both.matrix[4], top = both.matrix[5];
  expect((await pixel(page, left + both.width! / 2, top + both.height! / 2)).slice(0, 3)).toEqual([255, 0, 0]);
  const edge = await pixel(page, left + both.width! / 2, top + 1);
  expect(edge[2]).toBeGreaterThan(200);
  expect(edge[0]).toBeLessThan(60);

  // Fill: None → an outline-only shape in the stroke colour (Rounded Rectangle and Custom Shape too).
  await page.getByLabel('Shape fill', { exact: true }).selectOption('none');
  await selectTool(page, 'Rounded Rectangle');
  await expect(page.getByLabel('Shape fill', { exact: true })).toHaveValue('none');
  await drag(page, [0.55, 0.55], [0.9, 0.9]);
  await expect(footer(page)).toContainText(/Rounded Rectangle \d+ added/);
  await selectTool(page, 'Custom Shape');
  await drag(page, [0.55, 0.05], [0.9, 0.4]);
  await rendered(page);
  value = await project(page);
  const [rounded, custom] = layers(value).slice(-2);
  expect(rounded).toMatchObject({ kind: 'rectangle', fill: false, color: '#0000ff', stroke: 12 });
  expect(custom.kind).toBe('path');
  expect(custom.path).toMatchObject({ fill: false, stroke: true, strokeWidth: 12, strokeColor: '#0000ff' });
  const roundedCentre = await pixel(page, rounded.matrix[4] + rounded.width! / 2, rounded.matrix[5] + rounded.height! / 2);
  expect(roundedCentre[3]).toBe(0);

  // Both None: nothing is drawn and the status explains why.
  const count = layers(value).length;
  await page.getByLabel('Shape stroke', { exact: true }).selectOption('none');
  await selectTool(page, 'Ellipse');
  await drag(page, [0.1, 0.6], [0.3, 0.9]);
  await expect(footer(page)).toContainText('Choose a fill or a stroke colour before drawing a shape');
  value = await project(page);
  expect(layers(value)).toHaveLength(count);
  expect(value.settings.shapeAppearance).toMatchObject({ fill: 'none', stroke: 'none', strokeColor: '#0000ff', strokeWidth: 12 });

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Ellipse');
  await expect(page.getByLabel('Shape fill', { exact: true })).toHaveValue('none');
  await expect(page.getByLabel('Shape stroke', { exact: true })).toHaveValue('none');
  await expect(page.getByRole('slider', { name: 'Stroke width', exact: true })).toHaveValue('12');
});

test('W×H Create adds a shape of the numeric size centred on the canvas, undoable', async ({ page }) => {
  await selectTool(page, 'Ellipse');
  await page.getByLabel('New shape width', { exact: true }).fill('120');
  await page.getByLabel('New shape height', { exact: true }).fill('80');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(footer(page)).toContainText(/Ellipse \d+ added/);
  let value = await project(page);
  const frame = value.history[value.index];
  const ellipse = last(value);
  expect(ellipse).toMatchObject({ kind: 'ellipse', width: 120, height: 80, fill: true });
  expect(ellipse.matrix[4]).toBe(Math.round((frame.w - 120) / 2));
  expect(ellipse.matrix[5]).toBe(Math.round((frame.h - 80) / 2));
  const before = layers(value).length;
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  value = await project(page);
  expect(layers(value)).toHaveLength(before - 1);
});

test('Layer properties toggle and edit a filled shape stroke', async ({ page }) => {
  await selectRectangle(page);
  await drag(page, [0.2, 0.2], [0.6, 0.6]);
  await rendered(page);
  const toggle = page.getByRole('checkbox', { name: 'Layer stroke', exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.getByLabel('Layer stroke color', { exact: true }).fill('#00ff00');
  await expect.poll(async () => last(await project(page)).strokeColor).toBe('#00ff00');
  await toggle.uncheck();
  await expect.poll(async () => last(await project(page)).strokeColor).toBeUndefined();
});

test('Custom Shape picker exposes a radio group with the selected shape checked', async ({ page }) => {
  await selectTool(page, 'Custom Shape');
  const group = page.getByRole('radiogroup', { name: 'Custom shape', exact: true });
  await expect(group).toBeVisible();
  const radios = group.getByRole('radio');
  expect(await radios.count()).toBeGreaterThanOrEqual(15);
  await expect(group.getByRole('radio', { checked: true })).toHaveCount(1);
  await group.getByRole('radio', { name: 'Checkmark', exact: true }).check();
  await expect(group.getByRole('radio', { name: 'Checkmark', exact: true })).toBeChecked();
  await expect(group.getByRole('radio', { checked: true })).toHaveCount(1);
  await drag(page, [0.2, 0.2], [0.6, 0.6]);
  await expect(footer(page)).toContainText(/Checkmark \d+ added/);
});
