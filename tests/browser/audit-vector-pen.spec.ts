import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

// Contract: docs/path-tool-contract.md ("Pen options"). Runs in the desktop
// and mobile projects; document state is asserted through the project file.

type Point = { x: number; y: number };
type Node = Point & { inHandle?: Point; outHandle?: Point };
type Path = { nodes: Node[]; closed: boolean; fill: boolean; stroke: boolean; strokeWidth: number };
type Layer = { id: string; kind: string; name: string; path?: Path };
type Project = {
  history: Array<{ w: number; h: number; active: string; layers: Layer[] }>;
  index: number;
  settings: { penOptions?: Record<string, unknown> };
};

const footer = (page: Page) => page.locator('footer');
const canvas = (page: Page) => page.getByTestId('editor-canvas');
const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
const project = async (page: Page): Promise<Project> => {
  await saved(page);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return (await downloadedProject((await (await pending).path())!)) as Project;
};
const frameOf = (value: Project) => value.history[value.index];
const activePath = (value: Project) => {
  const frame = frameOf(value);
  return frame.layers.find((layer) => layer.id === frame.active)!;
};
const fraction = async (page: Page, x: number, y: number) => {
  await canvas(page).scrollIntoViewIfNeeded();
  const box = (await canvas(page).boundingBox())!;
  return { x: box.x + box.width * x, y: box.y + box.height * y };
};
const clickAt = async (page: Page, x: number, y: number) => {
  const point = await fraction(page, x, y);
  await page.mouse.click(point.x, point.y);
};
const SQUARE: Array<[number, number]> = [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75], [0.25, 0.25]];

/** Sum of RGBA values in a document-space square around a point. */
const regionSum = (page: Page, x: number, y: number) =>
  canvas(page).evaluate((element: HTMLCanvasElement, point) => {
    const cx = Math.round(point.x * element.width), cy = Math.round(point.y * element.height);
    const data = element.getContext('2d')!.getImageData(cx - 6, cy - 6, 13, 13).data;
    let sum = 0;
    for (const value of data) sum += value;
    return sum;
  }, { x, y });

test.describe.configure({ timeout: 120_000 });

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await saved(page);
});

test('pen and path tools show tailored options instead of one shared pair', async ({ page }) => {
  const options = (page: Page) => ({
    mode: page.getByLabel('Pen mode', { exact: true }),
    auto: page.getByRole('checkbox', { name: 'Auto Add/Delete', exact: true }),
    rubber: page.getByRole('checkbox', { name: 'Rubber Band', exact: true }),
    size: page.getByRole('spinbutton', { name: 'Size', exact: true }),
    hint: page.getByTestId('path-tool-hint'),
  });
  const o = options(page);
  await selectTool(page, 'Pen');
  await expect(o.mode).toHaveValue('shape');
  await expect(o.auto).toBeChecked();
  await expect(o.rubber).not.toBeChecked();
  await expect(o.size).toBeVisible();
  await expect(o.hint).toContainText('click the first anchor to close');

  await selectTool(page, 'Freeform Pen');
  await expect(o.mode).toBeVisible();
  await expect(o.auto).toHaveCount(0);
  await expect(o.rubber).toHaveCount(0);
  await expect(o.hint).toContainText('Drag to draw');

  await selectTool(page, 'Curvature Pen');
  await expect(o.rubber).toBeVisible();
  await expect(o.auto).toHaveCount(0);

  await selectTool(page, 'Add Anchor Point');
  await expect(o.mode).toHaveCount(0);
  await expect(o.size).toHaveCount(0);
  await expect(o.hint).toContainText('add an anchor');

  // Path mode hides the stroke Size and the choice persists.
  await selectTool(page, 'Pen');
  await o.mode.selectOption('path');
  await expect(o.size).toHaveCount(0);
  await o.rubber.check();
  await expect.poll(async () => (await project(page)).settings.penOptions).toEqual({ mode: 'path', autoAddDelete: true, rubberBand: true });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Pen');
  await expect(o.mode).toHaveValue('path');
  await expect(o.rubber).toBeChecked();
});

test('Path mode closes into an unfilled work path; Shape mode keeps the filled layer', async ({ page }) => {
  await selectTool(page, 'Pen');
  await page.getByLabel('Pen mode', { exact: true }).selectOption('path');
  const centre = (page: Page) => canvas(page).evaluate((element: HTMLCanvasElement) =>
    Array.from(element.getContext('2d')!.getImageData(Math.round(element.width / 2), Math.round(element.height / 2), 1, 1).data));
  await expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
  const before = await centre(page);
  for (const [x, y] of SQUARE) await clickAt(page, x, y);
  await expect(footer(page)).toContainText('Work path added (no fill)');
  let layer = activePath(await project(page));
  expect(layer.name).toMatch(/^Work Path \d+$/);
  expect(layer.path).toMatchObject({ closed: true, fill: false, stroke: true, strokeWidth: 1 });
  // The interior is not painted.
  await expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
  await expect.poll(() => centre(page)).toEqual(before);

  await page.getByLabel('Pen mode', { exact: true }).selectOption('shape');
  await page.getByRole('checkbox', { name: 'Auto Add/Delete', exact: true }).uncheck();
  for (const [x, y] of [[0.1, 0.1], [0.2, 0.1], [0.15, 0.2], [0.1, 0.1]] as Array<[number, number]>) await clickAt(page, x, y);
  await expect(footer(page)).toContainText('Editable path layer added');
  layer = activePath(await project(page));
  expect(layer.name).toMatch(/^Path \d+$/);
  expect(layer.path).toMatchObject({ closed: true, fill: true });
});

test('Auto Add/Delete: Pen clicks delete an anchor and add one on a segment; off, they start a new path', async ({ page }) => {
  await selectTool(page, 'Pen');
  for (const [x, y] of SQUARE) await clickAt(page, x, y);
  await expect(footer(page)).toContainText('Editable path layer added');
  expect(activePath(await project(page)).path!.nodes).toHaveLength(4);

  await clickAt(page, 0.75, 0.75);
  await expect(footer(page)).toContainText('Path anchor deleted');
  expect(activePath(await project(page)).path!.nodes).toHaveLength(3);

  await clickAt(page, 0.5, 0.25);
  await expect(footer(page)).toContainText('Path anchor added');
  expect(activePath(await project(page)).path!.nodes).toHaveLength(4);

  // Off: an unmodified click on an anchor starts a new path instead.
  await page.getByRole('checkbox', { name: 'Auto Add/Delete', exact: true }).uncheck();
  await clickAt(page, 0.25, 0.25);
  await expect(footer(page)).toContainText('Pen: click to place points');
  await page.keyboard.press('Escape');
  expect(activePath(await project(page)).path!.nodes).toHaveLength(4);
});

test('Rubber Band previews the next segment while the pointer moves', async ({ page }) => {
  await selectTool(page, 'Pen');
  const measure = async () => {
    await clickAt(page, 0.2, 0.3);
    await clickAt(page, 0.4, 0.3);
    await expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
    const before = await regionSum(page, 0.6, 0.6);
    const pointer = await fraction(page, 0.8, 0.9);
    await page.mouse.move(pointer.x, pointer.y, { steps: 4 });
    await page.waitForTimeout(300);
    await expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
    const after = await regionSum(page, 0.6, 0.6);
    await page.keyboard.press('Escape');
    return { before, after };
  };
  const off = await measure();
  expect(off.after).toBe(off.before);
  await page.getByRole('checkbox', { name: 'Rubber Band', exact: true }).check();
  const on = await measure();
  expect(on.after).not.toBe(on.before);
});

test('Curvature Pen closes with a curved closing segment', async ({ page }) => {
  await selectTool(page, 'Curvature Pen');
  for (const [x, y] of SQUARE) await clickAt(page, x, y);
  await expect(footer(page)).toContainText('Editable curvature path layer added');
  const layer = activePath(await project(page));
  expect(layer.path!.closed).toBe(true);
  expect(layer.path!.nodes).toHaveLength(4);
  for (const node of layer.path!.nodes) {
    expect(node.inHandle).toBeTruthy();
    expect(node.outHandle).toBeTruthy();
  }
  const first = layer.path!.nodes[0], last = layer.path!.nodes[3];
  // The closing segment bulges: its handles leave the straight chord between the anchors.
  expect(Math.abs(last.outHandle!.x - last.x)).toBeGreaterThan(1);
  expect(Math.abs(first.inHandle!.x - first.x)).toBeGreaterThan(1);
});
