import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

// Contract: docs/path-edit-tools-contract.md. Runs in the desktop and mobile
// projects; every edit is asserted against the downloaded document state.

type Point = { x: number; y: number };
type Node = Point & { inHandle?: Point; outHandle?: Point };
type Path = {
  nodes: Node[]; closed: boolean; fill: boolean; stroke: boolean; strokeWidth: number;
  fillColor: string; strokeColor: string; fillRule?: 'nonzero' | 'evenodd';
  contours?: Array<{ nodes: Node[]; closed: boolean }>;
};
type Layer = {
  id: string; kind: string; asset?: string; matrix: number[]; path?: Path;
  vectorMask?: { path: Path; enabled: boolean; inverted: boolean }; locked?: boolean; visible?: boolean;
};
type Frame = { w: number; h: number; active: string; layers: Layer[] };
type Project = { history: Frame[]; index: number; assets: Record<string, { url: string; w: number; h: number }> };

const footer = (page: Page) => page.locator('footer');
const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');

const project = async (page: Page): Promise<Project> => {
  await saved(page);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return await downloadedProject((await (await pending).path())!) as Project;
};

const upload = async (page: Page, value: Project) => {
  await page.getByTestId('project-input').setInputFiles({
    name: 'path-edit-tools.pixelforge', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)),
  });
  await expect(footer(page)).toContainText('Project opened with editable layers and history');
};

const frameOf = (value: Project) => value.history[value.index];
const pathLayer = (value: Project) => frameOf(value).layers.find((layer) => layer.kind === 'path')!;

/** Canvas client point for an image-space point. */
const toClient = async (page: Page, frame: { w: number; h: number }, point: Point) => {
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  return { x: box.x + (box.width * point.x) / frame.w, y: box.y + (box.height * point.y) / frame.h };
};
/** Image-space position the editor computes for a client point. */
const toImage = async (page: Page, frame: { w: number; h: number }, client: Point) => {
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  return { x: ((client.x - box.x) / box.width) * frame.w, y: ((client.y - box.y) / box.height) * frame.h };
};
const fraction = async (page: Page, x: number, y: number) => {
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  return { x: box.x + box.width * x, y: box.y + box.height * y };
};
const click = async (page: Page, point: Point) => page.mouse.click(point.x, point.y);
const drag = async (page: Page, from: Point, to: Point) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 2 });
  await page.mouse.up();
};
const menu = async (page: Page, name: 'Undo' | 'Redo') => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: new RegExp(`^${name}`) }).click();
};

/** Closed Pen triangle at canvas fractions (.25,.25) (.75,.25) (.5,.75). */
const drawTriangle = async (page: Page) => {
  await selectTool(page, 'Pen');
  for (const [x, y] of [[0.25, 0.25], [0.75, 0.25], [0.5, 0.75], [0.25, 0.25]])
    await click(page, await fraction(page, x, y));
  await expect(footer(page)).toContainText('Editable path layer added', { timeout: 10000 });
  return project(page);
};

const expectNodesClose = (actual: Node[], expected: Node[], digits = 6) => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((node, index) => {
    expect(node.x).toBeCloseTo(expected[index].x, digits);
    expect(node.y).toBeCloseTo(expected[index].y, digits);
  });
};

// Each test downloads the project several times to assert document state.
test.describe.configure({ timeout: 120_000 });

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await saved(page);
});

test('Pen and Path Selection flyouts expose every path tool with distinct icons and accessible names', async ({ page }) => {
  const palette = page.getByTestId('tool-palette');
  const draw = page.getByRole('region', { name: 'Draw & Type tools' });
  const pen = palette.getByRole('button', { name: 'Pen tool', exact: true });
  await expect(pen).toHaveAttribute('aria-haspopup', 'menu');
  await expect(pen).toHaveAttribute('title', 'Pen (P) · 5 more tools: right-click or press and hold');
  const pathSelection = palette.getByRole('button', { name: 'Path Selection tool', exact: true });
  await expect(pathSelection).toHaveAttribute('aria-haspopup', 'menu');
  await expect(pathSelection).toHaveAttribute('title', 'Path Selection (A) · 1 more tool: right-click or press and hold');
  // One slot per family: neither variant is duplicated in the compact grid.
  await expect(draw.locator('[data-tool-id="direct-select"]')).toHaveCount(0);
  await expect(draw.locator('[data-tool-id="add-anchor"]')).toHaveCount(0);

  await pen.scrollIntoViewIfNeeded();
  await pen.click({ button: 'right' });
  const flyout = page.locator('.tool-flyout[role="menu"]');
  await expect(flyout).toBeVisible();
  await expect(flyout.getByRole('menuitem')).toHaveText([
    /Pen/, /Freeform Pen/, /Curvature Pen/, /Add Anchor Point/, /Delete Anchor Point/, /Convert Point/,
  ]);
  const icons = await flyout.getByRole('menuitem').evaluateAll((items) =>
    items.map((item) => item.querySelector('svg')!.innerHTML));
  expect(new Set(icons).size).toBe(6);
  // Photoshop gives the anchor tools no shortcut, so no key badge is shown.
  await expect(flyout.getByRole('menuitem', { name: 'Add Anchor Point', exact: true }).locator('kbd')).toHaveCount(0);
  await flyout.getByRole('menuitem', { name: 'Convert Point', exact: true }).click();
  const convert = palette.getByRole('button', { name: 'Convert Point tool', exact: true });
  await expect(convert).toHaveAttribute('aria-pressed', 'true');
  await expect(convert).toHaveAttribute('title', 'Convert Point · 5 more tools: right-click or press and hold');
  await expect(convert.locator('kbd')).toHaveCount(0);
  await expect(page.locator('[data-sidebar-section="tool-options"]')).toBeVisible();

  await pathSelection.scrollIntoViewIfNeeded();
  await pathSelection.click({ button: 'right' });
  await expect(flyout.getByRole('menuitem')).toHaveText([/Path Selection/, /Direct Selection/]);
  await page.keyboard.press('Escape');
  await expect(flyout).toBeHidden();

  // A cycles Path Selection → Direct Selection → Path Selection; Shift+A reverses.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('a');
  await expect(palette.getByRole('button', { name: 'Path Selection tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('a');
  await expect(palette.getByRole('button', { name: 'Direct Selection tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Shift+A');
  await expect(palette.getByRole('button', { name: 'Path Selection tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // P keeps cycling only the drawing pens.
  await page.keyboard.press('p');
  await expect(palette.getByRole('button', { name: 'Pen tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('p');
  await page.keyboard.press('p');
  await page.keyboard.press('p');
  await expect(palette.getByRole('button', { name: 'Pen tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('Path Selection drags a whole path by the pointer delta in one undo step', async ({ page }) => {
  const before = await drawTriangle(page);
  const frame = frameOf(before), original = pathLayer(before);
  await selectTool(page, 'Path Selection');
  // Clicking empty canvas selects nothing and records no history.
  await click(page, await fraction(page, 0.9, 0.9));
  await expect(footer(page)).toContainText('Click on a path to select it');
  // Drag from inside the triangle (its interior selects the path).
  const from = await fraction(page, 0.5, 0.4), to = await fraction(page, 0.58, 0.48);
  await drag(page, from, to);
  await expect(footer(page)).toContainText('Path moved', { timeout: 10000 });
  const start = await toImage(page, frame, from), end = await toImage(page, frame, to);
  const dx = end.x - start.x, dy = end.y - start.y;
  expect(Math.abs(dx)).toBeGreaterThan(5);
  const moved = await project(page);
  expect(moved.history.length).toBe(before.history.length + 1);
  // Every anchor moved by the same delta (within one image pixel of pointer rounding).
  pathLayer(moved).path!.nodes.forEach((node, index) => {
    expect(Math.abs(node.x - (original.path!.nodes[index].x + dx))).toBeLessThan(1.5);
    expect(Math.abs(node.y - (original.path!.nodes[index].y + dy))).toBeLessThan(1.5);
  });
  const offsets = pathLayer(moved).path!.nodes.map((node, index) => ({
    x: node.x - original.path!.nodes[index].x, y: node.y - original.path!.nodes[index].y,
  }));
  for (const offset of offsets) {
    expect(offset.x).toBeCloseTo(offsets[0].x, 6);
    expect(offset.y).toBeCloseTo(offsets[0].y, 6);
  }
  expect(pathLayer(moved).matrix).toEqual(original.matrix);
  await menu(page, 'Undo');
  expectNodesClose(pathLayer(await project(page)).path!.nodes, original.path!.nodes);
  await menu(page, 'Redo');
  expectNodesClose(pathLayer(await project(page)).path!.nodes, pathLayer(moved).path!.nodes);

  // Locked and hidden layers are refused without history.
  await page.getByLabel('Lock layer', { exact: true }).check();
  const locked = await project(page);
  await drag(page, to, from);
  await expect(footer(page)).toContainText('visible, unlocked path layer');
  expect((await project(page)).history.length).toBe(locked.history.length);
});

test('Path Selection moves a transformed vector-mask path in local space', async ({ page }) => {
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Create Vector Mask', exact: true }).click();
  await expect(footer(page)).toContainText('Vector mask created');
  let value = await project(page);
  const frame = frameOf(value), layer = frame.layers.find((item) => item.id === frame.active)!;
  const asset = value.assets[layer.asset!];
  const inset: Node[] = [
    { x: asset.w * 0.2, y: asset.h * 0.2 }, { x: asset.w * 0.8, y: asset.h * 0.2 },
    { x: asset.w * 0.8, y: asset.h * 0.8 }, { x: asset.w * 0.2, y: asset.h * 0.8 },
  ];
  layer.matrix = [0.5, 0, 0, 0.5, frame.w * 0.25, frame.h * 0.25];
  layer.vectorMask!.path = { ...layer.vectorMask!.path, nodes: inset, closed: true };
  await upload(page, value);
  value = await project(page);
  const map = (point: Point) => ({ x: 0.5 * point.x + frame.w * 0.25, y: 0.5 * point.y + frame.h * 0.25 });
  const from = await toClient(page, frame, map({ x: asset.w * 0.5, y: asset.h * 0.5 }));
  const to = { x: from.x + 30, y: from.y + 15 };
  await selectTool(page, 'Path Selection');
  await drag(page, from, to);
  await expect(footer(page)).toContainText('Vector mask path moved', { timeout: 10000 });
  const a = await toImage(page, frame, from), b = await toImage(page, frame, to);
  // A 0.5 scale matrix doubles the local delta.
  const local = { x: (b.x - a.x) / 0.5, y: (b.y - a.y) / 0.5 };
  const edited = frameOf(await project(page)).layers.find((item) => item.id === layer.id)!;
  edited.vectorMask!.path.nodes.forEach((node, index) => {
    expect(Math.abs(node.x - (inset[index].x + local.x))).toBeLessThan(3);
    expect(Math.abs(node.y - (inset[index].y + local.y))).toBeLessThan(3);
  });
  expect(edited.matrix).toEqual(layer.matrix);
  await menu(page, 'Undo');
  const undone = frameOf(await project(page)).layers.find((item) => item.id === layer.id)!;
  expectNodesClose(undone.vectorMask!.path.nodes, inset);
});

test('Add and Delete Anchor Point tools insert and remove anchors with undo', async ({ page }) => {
  const before = await drawTriangle(page);
  const frame = frameOf(before), original = pathLayer(before).path!;
  await selectTool(page, 'Add Anchor Point');
  // Clicking an existing anchor does not stack a duplicate on it.
  await click(page, await toClient(page, frame, original.nodes[1]));
  await expect(footer(page)).toContainText('not an anchor');
  const midpoint = { x: (original.nodes[0].x + original.nodes[1].x) / 2, y: original.nodes[0].y };
  const target = await toClient(page, frame, midpoint);
  await click(page, target);
  await expect(footer(page)).toContainText('Path anchor added');
  const added = await project(page);
  expect(added.history.length).toBe(before.history.length + 1);
  const addedNodes = pathLayer(added).path!.nodes;
  expect(addedNodes).toHaveLength(4);
  const clicked = await toImage(page, frame, target);
  expect(Math.abs(addedNodes[1].x - clicked.x)).toBeLessThan(1.5);
  expect(addedNodes[1].y).toBeCloseTo(original.nodes[0].y, 6);
  expect(pathLayer(added).path!.closed).toBe(true);

  await selectTool(page, 'Delete Anchor Point');
  await click(page, await fraction(page, 0.92, 0.92));
  await expect(footer(page)).toContainText('Click an anchor to delete it');
  await click(page, await toClient(page, frame, addedNodes[1]));
  await expect(footer(page)).toContainText('Path anchor deleted');
  expectNodesClose(pathLayer(await project(page)).path!.nodes, original.nodes);
  await click(page, await toClient(page, frame, original.nodes[2]));
  // Same notice as the previous delete, so wait on the document instead.
  await expect.poll(async () => pathLayer(await project(page)).path!.nodes.length, { timeout: 20_000 }).toBe(2);
  const removed = pathLayer(await project(page)).path!;
  expectNodesClose(removed.nodes, original.nodes.slice(0, 2));
  expect(removed.closed).toBe(false);

  await menu(page, 'Undo');
  await menu(page, 'Undo');
  expectNodesClose(pathLayer(await project(page)).path!.nodes, addedNodes);
  await menu(page, 'Undo');
  expectNodesClose(pathLayer(await project(page)).path!.nodes, original.nodes);
});

test('Convert Point toggles anchors on click and pulls symmetric handles on drag', async ({ page }) => {
  const before = await drawTriangle(page);
  const frame = frameOf(before), original = pathLayer(before).path!;
  await selectTool(page, 'Convert Point');
  const anchor = await toClient(page, frame, original.nodes[1]);
  await click(page, anchor);
  await expect(footer(page)).toContainText('Path anchor converted to smooth');
  const smooth = pathLayer(await project(page)).path!.nodes[1];
  expect(smooth.inHandle).toBeDefined();
  expect(smooth.outHandle).toBeDefined();
  expect(smooth.x).toBeCloseTo(original.nodes[1].x, 6);
  // Handles mirror through the anchor.
  expect(smooth.inHandle!.x + smooth.outHandle!.x).toBeCloseTo(2 * smooth.x, 4);
  expect(smooth.inHandle!.y + smooth.outHandle!.y).toBeCloseTo(2 * smooth.y, 4);
  await click(page, anchor);
  await expect(footer(page)).toContainText('Path anchor converted to corner');
  expectNodesClose([pathLayer(await project(page)).path!.nodes[1]], [original.nodes[1]]);
  expect(pathLayer(await project(page)).path!.nodes[1].inHandle).toBeUndefined();

  const history = (await project(page)).history.length;
  const from = await toClient(page, frame, original.nodes[0]);
  const to = { x: from.x + 40, y: from.y - 25 };
  await drag(page, from, to);
  await expect(footer(page)).toContainText('Path anchor converted to smooth');
  const pulled = await project(page);
  expect(pulled.history.length).toBe(history + 1);
  const node = pathLayer(pulled).path!.nodes[0];
  const pointer = await toImage(page, frame, to);
  expect(node.x).toBeCloseTo(original.nodes[0].x, 6);
  expect(Math.abs(node.outHandle!.x - pointer.x)).toBeLessThan(1.5);
  expect(Math.abs(node.outHandle!.y - pointer.y)).toBeLessThan(1.5);
  expect(node.inHandle!.x).toBeCloseTo(2 * node.x - node.outHandle!.x, 4);
  expect(node.inHandle!.y).toBeCloseTo(2 * node.y - node.outHandle!.y, 4);

  // Dragging one handle moves it alone (a cusp), leaving its sibling fixed.
  const handleFrom = await toClient(page, frame, node.outHandle!);
  await drag(page, handleFrom, { x: handleFrom.x + 20, y: handleFrom.y + 30 });
  await expect(footer(page)).toContainText('Path handle moved independently');
  const cusp = pathLayer(await project(page)).path!.nodes[0];
  expect(cusp.inHandle).toEqual(node.inHandle);
  expect(cusp.outHandle!.y).toBeGreaterThan(node.outHandle!.y + 5);

  await menu(page, 'Undo');
  await menu(page, 'Undo');
  const undone = pathLayer(await project(page)).path!.nodes[0];
  expect(undone.inHandle).toBeUndefined();
  expect(undone.outHandle).toBeUndefined();
});

test('Pen modifier edits still add, convert and delete anchors through the shared helper', async ({ page }) => {
  const before = await drawTriangle(page);
  const frame = frameOf(before), original = pathLayer(before).path!;
  const edge = await toClient(page, frame, {
    x: (original.nodes[1].x + original.nodes[2].x) / 2,
    y: (original.nodes[1].y + original.nodes[2].y) / 2,
  });
  await click(page, edge);
  await expect(footer(page)).toContainText('Path anchor added');
  const added = pathLayer(await project(page)).path!.nodes;
  expect(added).toHaveLength(4);
  const anchor = await toClient(page, frame, added[2]);
  await page.keyboard.down('Shift');
  await click(page, anchor);
  await page.keyboard.up('Shift');
  await expect(footer(page)).toContainText('Path anchor converted to smooth');
  expect(pathLayer(await project(page)).path!.nodes[2].outHandle).toBeDefined();
  await page.keyboard.down('Alt');
  await click(page, anchor);
  await page.keyboard.up('Alt');
  await expect(footer(page)).toContainText('Path anchor deleted');
  expectNodesClose(pathLayer(await project(page)).path!.nodes, original.nodes);
});
