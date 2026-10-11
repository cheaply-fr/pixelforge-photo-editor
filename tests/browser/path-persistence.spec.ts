import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

type PathLayer = {
  kind: string;
  matrix: number[];
  path: { nodes: Array<{ x: number; y: number; inHandle?: { x: number; y: number }; outHandle?: { x: number; y: number } }>; closed: boolean; fill?: boolean };
};
type Project = { history: Array<{ w: number; h: number; layers: PathLayer[] }>; index: number };

const saved = async (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');

const project = async (page: Page): Promise<Project> => {
  await saved(page);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return await downloadedProject((await download.path())!);
};

const pathLayer = (value: Project) => value.history[value.index].layers.find((layer) => layer.kind === 'path')!;

const upload = async (page: Page, value: Project) => {
  await page.getByTestId('project-input').setInputFiles({
    name: 'editable-path.pixelforge', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
};

const triangle = async (page: Page) => {
  await selectTool(page, 'Pen');
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  for (const [x, y] of [[0.2, 0.2], [0.7, 0.2], [0.45, 0.65], [0.2, 0.2]])
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await expect(page.locator('footer')).toContainText('Editable path layer added');
  await saved(page);
};

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await saved(page);
});

test('imported affine paths retain editable nodes and Direct Selection converts drag coordinates to local space', async ({ page }) => {
  await triangle(page);
  const value = await project(page);
  const path = pathLayer(value);
  path.matrix = [1.1, 0.15, -0.1, 0.8, 18, 24];
  const original = structuredClone(path);
  await upload(page, value);
  await expect(page.locator('footer')).toContainText('Project opened with editable layers and history');
  expect(pathLayer(await project(page))).toEqual(original);
  const frame = value.history[value.index];
  const node = path.path.nodes[0];
  const [a, b, c, d, e, f] = path.matrix;
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  const screen = (x: number, y: number) => ({
    x: box.x + box.width * (a * x + c * y + e) / frame.w,
    y: box.y + box.height * (b * x + d * y + f) / frame.h,
  });
  const start = screen(node.x, node.y), end = screen(node.x + 48, node.y + 32);
  await selectTool(page, 'Direct Selection');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 3 });
  await page.mouse.up();
  await expect(page.locator('footer')).toContainText('Path node moved');
  const moved = pathLayer(await project(page));
  expect(moved.matrix).toEqual(original.matrix);
  expect(moved.path.nodes[0].x).toBeCloseTo(node.x + 48, 1);
  expect(moved.path.nodes[0].y).toBeCloseTo(node.y + 32, 1);
  expect(moved.path.nodes.slice(1)).toEqual(original.path.nodes.slice(1));
  await page.reload();
  expect(pathLayer(await project(page))).toEqual(moved);
  await upload(page, value);
  await expect(page.locator('footer')).toContainText('Project opened with editable layers and history');
  expect(pathLayer(await project(page))).toEqual(original);
});

test('malformed imported path metadata never replaces the current draft, history or pixels', async ({ page }) => {
  await triangle(page);
  const original = await project(page), bookmark = page.url();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  const pixels = await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  for (const corrupt of [
    (layer: PathLayer) => { layer.path.nodes[0].x = 1_000_001; },
    (layer: PathLayer) => { layer.path.nodes = []; },
    (layer: PathLayer) => { (layer.path as unknown as Record<string, unknown>).strokeWidth = -1; },
  ]) {
    const invalid = structuredClone(original);
    corrupt(pathLayer(invalid));
    await upload(page, invalid);
    await expect(page.locator('footer')).toContainText('Invalid layer document');
    expect(page.url()).toBe(bookmark);
    expect(await project(page)).toEqual(original);
    expect(await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(pixels);
  }
});

test('Direct Selection edits cubic handles and persists the curve through reload', async ({ page }) => {
  await triangle(page);
  const value = await project(page);
  const path = pathLayer(value);
  path.path.nodes[0].outHandle = { x: path.path.nodes[0].x + 80, y: path.path.nodes[0].y + 20 };
  const original = structuredClone(path);
  await upload(page, value);
  await expect(page.locator('footer')).toContainText('Project opened with editable layers and history');
  const frame = value.history[value.index];
  const node = path.path.nodes[0];
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  const screen = (x: number, y: number) => ({
    x: box.x + box.width * x / frame.w,
    y: box.y + box.height * y / frame.h,
  });
  const start = screen(node.outHandle!.x, node.outHandle!.y);
  const end = screen(node.outHandle!.x + 24, node.outHandle!.y + 36);
  await selectTool(page, 'Direct Selection');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 3 });
  await page.mouse.up();
  await expect(page.locator('footer')).toContainText('Path handle moved');
  const moved = pathLayer(await project(page));
  expect(moved.path.nodes[0].x).toBeCloseTo(original.path.nodes[0].x, 1);
  expect(moved.path.nodes[0].y).toBeCloseTo(original.path.nodes[0].y, 1);
  expect(moved.path.nodes[0].outHandle!.x).toBeCloseTo(node.outHandle!.x + 24, 1);
  expect(moved.path.nodes[0].outHandle!.y).toBeCloseTo(node.outHandle!.y + 36, 1);
  await page.reload();
  expect(pathLayer(await project(page))).toEqual(moved);
});

test('Pen adds, converts and deletes anchors on an existing path', async ({ page }) => {
  await triangle(page);
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  await selectTool(page, 'Pen');
  // The triangle's first segment is horizontal at y=.2; a stroke click adds
  // an anchor at the deterministic midpoint.
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.2);
  await expect(page.locator('footer')).toContainText('Path anchor added');
  let edited = pathLayer(await project(page));
  expect(edited.path.nodes).toHaveLength(4);
  expect(edited.path.nodes[1].x).toBeCloseTo(edited.path.nodes[0].x + (edited.path.nodes[2].x - edited.path.nodes[0].x) / 2, 0);

  // Shift-clicking an anchor toggles the smooth/corner representation.
  const first = edited.path.nodes[0];
  const frame = (await project(page)).history[(await project(page)).index];
  const screen = (x: number, y: number) => ({
    x: box.x + box.width * x / frame.w,
    y: box.y + box.height * y / frame.h,
  });
  const firstScreen = screen(first.x, first.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(firstScreen.x, firstScreen.y);
  await page.keyboard.up('Shift');
  await expect(page.locator('footer')).toContainText('Path anchor converted');
  edited = pathLayer(await project(page));
  expect(edited.path.nodes[0].inHandle).toBeDefined();
  expect(edited.path.nodes[0].outHandle).toBeDefined();

  // Alt-clicking the same anchor removes it without changing source pixels.
  await page.keyboard.down('Alt');
  await page.mouse.click(firstScreen.x, firstScreen.y);
  await page.keyboard.up('Alt');
  await expect(page.locator('footer')).toContainText('Path anchor deleted');
  edited = pathLayer(await project(page));
  expect(edited.path.nodes).toHaveLength(3);
  expect(edited.path.closed).toBe(true);
  await page.reload();
  expect(pathLayer(await project(page))).toEqual(edited);
});

test('Freeform Pen creates a smooth open path and preserves it on reload', async ({ page }) => {
  await selectTool(page, 'Freeform Pen');
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.55, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.35, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('footer')).toContainText('Editable freeform path layer added');
  const created = pathLayer(await project(page));
  expect(created.path.closed).toBe(false);
  expect(created.path.nodes.length).toBeGreaterThan(2);
  expect(created.path.nodes.some((node) => node.outHandle || node.inHandle)).toBe(true);
  await page.reload();
  expect(pathLayer(await project(page))).toEqual(created);
});

test('Curvature Pen creates a closed smooth path with editable handles and persists it', async ({ page }) => {
  await selectTool(page, 'Curvature Pen');
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  const beforePixels = await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const points = [
    [0.22, 0.28],
    [0.72, 0.28],
    [0.55, 0.7],
    [0.22, 0.28],
  ];
  for (const [x, y] of points) await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await expect(page.locator('footer')).toContainText('Editable curvature path layer added');
  const created = pathLayer(await project(page));
  expect(created.path.closed).toBe(true);
  expect(created.path.fill).toBe(true);
  expect(created.path.nodes.length).toBe(3);
  expect(created.path.nodes.some((node) => node.outHandle || node.inHandle)).toBe(true);
  expect(await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(beforePixels);
  await page.reload();
  expect(pathLayer(await project(page))).toEqual(created);
});

test('Curvature Pen Escape cancels staged anchors without changing history', async ({ page }) => {
  await selectTool(page, 'Curvature Pen');
  const before = await project(page);
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.22, box.y + box.height * 0.28);
  await page.mouse.click(box.x + box.width * 0.72, box.y + box.height * 0.28);
  await page.keyboard.press('Escape');
  await expect(page.locator('footer')).toContainText('Pen path cancelled');
  expect(await project(page)).toEqual(before);
});
