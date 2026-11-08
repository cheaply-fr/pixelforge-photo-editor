import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import type { PathModel } from '../../src/paths';

// Paint Symmetry beyond hand-drawn Brush/Pencil/Eraser strokes (W4-1, W4-4):
// Layer → Stroke Path with Brush, Mixer Brush, History / Art History Brush,
// Clone Stamp and Healing Brush. Each stroke with all its copies is one undo
// step; Spot Healing and Patch do not offer symmetry.

type Layer = { id: string; kind: string; visible: boolean; matrix: number[]; path?: PathModel; name: string };
type Project = { history: Array<{ w: number; h: number; layers: Layer[]; active: string }>; index: number };

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  // A fresh transparent 1200 × 800 document with an empty paint layer on top.
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
});

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const settled = (page: Page) => expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
const footer = (page: Page) => page.locator('footer');
const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];
const TRANSPARENT = [0, 0, 0, 0];

async function setColor(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).evaluate((input: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** Client point for an image pixel (the canvas is scrolled back into view on phones). */
async function at(page: Page, x: number, y: number) {
  await canvas(page).scrollIntoViewIfNeeded();
  return canvas(page).evaluate((element: HTMLCanvasElement, point) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + (point.x / element.width) * rect.width, y: rect.top + (point.y / element.height) * rect.height };
  }, { x, y });
}

const pixel = (page: Page, x: number, y: number) =>
  canvas(page).evaluate((element: HTMLCanvasElement, point) =>
    Array.from(element.getContext('2d')!.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data), { x, y });

const near = (actual: number[], expected: number[], message: string, tolerance = 2) => {
  for (let channel = 0; channel < 4; channel += 1)
    expect(Math.abs(actual[channel] - expected[channel]), `${message} channel ${channel}: ${actual.join(', ')} vs ${expected.join(', ')}`)
      .toBeLessThanOrEqual(tolerance);
};

async function symmetry(page: Page, mode: string) {
  await page.getByLabel('Paint symmetry', { exact: true }).selectOption(mode);
}

async function editMenu(page: Page, item: RegExp) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
  await settled(page);
}

/** Straight mouse stroke between two image points. */
async function stroke(page: Page, from: [number, number], to: [number, number]) {
  const a = await at(page, ...from), b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  await settled(page);
}

async function fillAt(page: Page, color: string, x = 600, y = 400) {
  await selectTool(page, 'Fill');
  await setColor(page, 'Drawing color', color);
  const point = await at(page, x, y);
  await page.mouse.click(point.x, point.y);
  await expect(footer(page)).toContainText('Area filled');
  await settled(page);
}

async function project(page: Page): Promise<Project> {
  await saved(page);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return await downloadedProject((await (await pending).path())!) as Project;
}

/** Draw a Curvature Pen path, then replace it with `path` on a hidden path layer. */
async function hiddenPath(page: Page, path: PathModel) {
  await selectTool(page, 'Curvature Pen');
  for (const [x, y] of [[200, 200], [700, 160], [900, 600], [200, 200]]) {
    const point = await at(page, x, y);
    await page.mouse.click(point.x, point.y);
  }
  await expect(footer(page)).toContainText('Editable curvature path layer added');
  await settled(page);
  const value = await project(page);
  const frame = value.history[value.index];
  const layer = frame.layers.find((item) => item.kind === 'path')!;
  layer.visible = false;
  layer.path = path;
  frame.active = layer.id;
  await page.getByTestId('project-input').setInputFiles({
    name: 'symmetry-path.pixelforge', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)),
  });
  await expect(footer(page)).toContainText('Project opened with editable layers and history');
  await settled(page);
}

const segment = (x0: number, y0: number, x1: number, y1: number): PathModel => ({
  nodes: [{ x: x0, y: y0 }, { x: x1, y: y1 }],
  closed: false,
  fill: false,
  stroke: true,
  strokeWidth: 1,
  fillColor: '#000000',
  strokeColor: '#000000',
});

async function strokePath(page: Page, tool = 'brush') {
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Stroke Path with Brush…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Stroke Path with Brush' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Stroke tool').selectOption(tool);
  await dialog.getByLabel('Simulate pressure').uncheck();
  await dialog.getByRole('button', { name: 'Stroke path', exact: true }).click();
  await settled(page);
}

async function brushSettings(page: Page, size: string, color: string) {
  await selectTool(page, 'Brush');
  await page.getByLabel('Size', { exact: true }).fill(size);
  await page.getByLabel('Size', { exact: true }).press('Enter');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await setColor(page, 'Drawing color', color);
}

test('Stroke Path with Brush paints every vertical-mirror copy as one undo step', async ({ page }) => {
  await hiddenPath(page, segment(100, 200, 400, 200));
  await brushSettings(page, '20', '#ff0000');
  await symmetry(page, 'vertical');
  await strokePath(page);
  await expect(footer(page)).toContainText('Path stroked with Brush (2 symmetry copies)');
  // Original (100–400) and its mirror about x = 600 (800–1100).
  for (const x of [120, 250, 380]) expect(await pixel(page, x, 200), `original ${x}`).toEqual(RED);
  for (const x of [820, 950, 1080]) expect(await pixel(page, x, 200), `mirror ${x}`).toEqual(RED);
  for (const [x, y] of [[600, 200], [250, 600], [950, 600], [250, 230]])
    expect(await pixel(page, x, y), `untouched ${x},${y}`).toEqual(TRANSPARENT);

  await editMenu(page, /^Undo/);
  expect(await pixel(page, 250, 200)).toEqual(TRANSPARENT);
  expect(await pixel(page, 950, 200)).toEqual(TRANSPARENT);
  await editMenu(page, /^Redo/);
  expect(await pixel(page, 250, 200)).toEqual(RED);
  expect(await pixel(page, 950, 200)).toEqual(RED);
});

test('Stroke Path with Brush: radial copies are confined to the selection; Off paints one copy', async ({ page }) => {
  await hiddenPath(page, segment(700, 400, 900, 400));
  await brushSettings(page, '20', '#00ff00');
  await symmetry(page, 'radial');
  await page.getByLabel('Symmetry segments value', { exact: true }).fill('4');
  await page.getByLabel('Symmetry segments value', { exact: true }).press('Enter');
  await expect(page.getByTestId('paint-symmetry-summary')).toHaveText('4 copies per dab');
  // Select the top part of the canvas only.
  await selectTool(page, 'Select');
  const a = await at(page, 0, 0), b = await at(page, 1200, 350);
  await page.mouse.move(a.x + 1, a.y + 1);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect(footer(page)).toContainText(/selection/i);
  await strokePath(page);
  await expect(footer(page)).toContainText('Path stroked with Brush (4 symmetry copies)');
  // Copies: right (700–900, 400), down (600, 500–700), left (300–500, 400), up (600, 100–300).
  expect((await pixel(page, 600, 200))[1], 'upward copy inside the selection').toBeGreaterThan(240);
  for (const [x, y] of [[800, 400], [600, 600], [400, 400]])
    expect(await pixel(page, x, y), `outside the selection ${x},${y}`).toEqual(TRANSPARENT);

  // Deselect, undo, and stroke again with symmetry off: only the source copy.
  await editMenu(page, /^Undo/);
  expect(await pixel(page, 600, 200)).toEqual(TRANSPARENT);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Deselect Ctrl\+D$/ }).click();
  await selectTool(page, 'Brush');
  await symmetry(page, 'off');
  await strokePath(page);
  await expect(footer(page)).toContainText('Path stroked with Brush;');
  await expect(footer(page)).not.toContainText('symmetry copies');
  expect((await pixel(page, 800, 400))[1]).toBeGreaterThan(240);
  for (const [x, y] of [[600, 200], [600, 600], [400, 400]])
    expect(await pixel(page, x, y), `no copy ${x},${y}`).toEqual(TRANSPARENT);
});

test('History Brush and Art History Brush restore at every mirror copy', async ({ page }) => {
  await fillAt(page, '#ff0000');
  await selectTool(page, 'History Brush');
  await page.getByRole('button', { name: 'Set source to current snapshot', exact: true }).click();
  await expect(footer(page)).toContainText('History Brush source set to snapshot');
  await fillAt(page, '#0000ff');
  expect(await pixel(page, 250, 400)).toEqual(BLUE);

  await selectTool(page, 'History Brush');
  await expect(page.getByTestId('paint-symmetry-controls')).toBeVisible();
  await page.getByLabel('Size', { exact: true }).fill('40');
  await page.getByLabel('Size', { exact: true }).press('Enter');
  await symmetry(page, 'vertical');
  await expect(page.getByTestId('paint-symmetry-overlay')).toBeVisible();
  await stroke(page, [200, 400], [300, 400]);
  await expect(footer(page)).toContainText('History Brush restored source');
  const left = await pixel(page, 250, 400), right = await pixel(page, 950, 400);
  expect(left[0], 'restored toward red').toBeGreaterThan(100);
  expect(left[2]).toBeLessThan(160);
  near(right, left, 'mirror copy');
  expect(await pixel(page, 600, 400)).toEqual(BLUE);
  expect(await pixel(page, 250, 500)).toEqual(BLUE);

  await editMenu(page, /^Undo/);
  expect(await pixel(page, 250, 400)).toEqual(BLUE);
  expect(await pixel(page, 950, 400)).toEqual(BLUE);

  // Art History Brush shares the snapshot source and the symmetry settings.
  await selectTool(page, 'Art History Brush');
  await expect(page.getByLabel('Paint symmetry', { exact: true })).toHaveValue('vertical');
  await stroke(page, [200, 300], [300, 300]);
  await expect(footer(page)).toContainText('Art History Brush applied from source');
  const artLeft = await pixel(page, 250, 300), artRight = await pixel(page, 950, 300);
  expect(artLeft).not.toEqual(BLUE);
  near(artRight, artLeft, 'art history mirror copy');
  expect(await pixel(page, 600, 300)).toEqual(BLUE);
  await editMenu(page, /^Undo/);
  expect(await pixel(page, 950, 300)).toEqual(BLUE);
});

test('Mixer Brush offers symmetry and commits a mirrored stroke as one undo step', async ({ page }) => {
  await fillAt(page, '#0000ff');
  await selectTool(page, 'Mixer Brush');
  await expect(page.getByTestId('paint-symmetry-controls')).toBeVisible();
  await symmetry(page, 'dual');
  await expect(page.getByTestId('paint-symmetry-summary')).toHaveText('4 copies per dab');
  const before = await project(page);
  await stroke(page, [200, 200], [320, 260]);
  await expect(footer(page)).toContainText('Mixer Brush stroke applied');
  const after = await project(page);
  expect(after.history.length).toBe(before.history.length + 1);
  // Mixing an unchanged uniform layer keeps every copy's pixels intact.
  for (const [x, y] of [[260, 230], [940, 230], [260, 570], [940, 570]])
    expect(await pixel(page, x, y), `${x},${y}`).toEqual(BLUE);
  await editMenu(page, /^Undo/);
  expect((await project(page)).index).toBe(before.index);
});

/** Opaque blue layer with red bands through rows 200 and 600. */
async function blueWithRedBands(page: Page) {
  await fillAt(page, '#0000ff');
  await brushSettings(page, '80', '#ff0000');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await stroke(page, [20, 200], [1180, 200]);
  await stroke(page, [20, 600], [1180, 600]);
  expect(await pixel(page, 600, 200)).toEqual(RED);
  expect(await pixel(page, 600, 600)).toEqual(RED);
  expect(await pixel(page, 600, 400)).toEqual(BLUE);
}

async function cloneTool(page: Page, label: 'Clone' | 'Healing') {
  await selectTool(page, label);
  await page.getByLabel('Size', { exact: true }).fill('40');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
}

async function altClick(page: Page, x: number, y: number) {
  await canvas(page).scrollIntoViewIfNeeded();
  await canvas(page).evaluate((element: HTMLCanvasElement, point) => {
    element.setPointerCapture = () => undefined;
    const rect = element.getBoundingClientRect();
    for (const type of ['pointerdown', 'pointerup'])
      element.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true, pointerId: 43, pointerType: 'mouse', isPrimary: true,
        pressure: type === 'pointerdown' ? 0.5 : 0, buttons: type === 'pointerdown' ? 1 : 0, altKey: true,
        clientX: rect.left + (point.x / element.width) * rect.width,
        clientY: rect.top + (point.y / element.height) * rect.height,
      }));
  }, { x, y });
}

test('Clone Stamp mirrors the destination and the source offset (horizontal axis)', async ({ page }) => {
  await blueWithRedBands(page);
  await cloneTool(page, 'Clone');
  await symmetry(page, 'horizontal');
  await altClick(page, 100, 200);
  await expect(footer(page)).toContainText('Clone source set');
  // Stroke row 300 clones row 200 (offset 0, −100). The mirror copy paints
  // row 500 and samples row 600 (offset 0, +100), which is red too; an
  // unmirrored offset would sample the blue row 400 instead.
  await stroke(page, [100, 300], [1100, 300]);
  await expect(footer(page)).toContainText('Clone stroke applied');
  for (const x of [300, 600, 900]) {
    expect(await pixel(page, x, 300), `original ${x}`).toEqual(RED);
    expect(await pixel(page, x, 500), `mirror ${x}`).toEqual(RED);
  }
  expect(await pixel(page, 600, 400)).toEqual(BLUE);

  await editMenu(page, /^Undo/);
  expect(await pixel(page, 600, 300)).toEqual(BLUE);
  expect(await pixel(page, 600, 500)).toEqual(BLUE);
  await editMenu(page, /^Redo/);
  expect(await pixel(page, 600, 500)).toEqual(RED);
});

test('Healing Brush mirror copies heal from the mirrored source, confined to the selection', async ({ page }) => {
  await blueWithRedBands(page);
  // Spot Healing and Patch do not offer symmetry.
  for (const label of ['Spot Healing', 'Patch']) {
    await selectTool(page, label);
    await expect(page.getByTestId('paint-symmetry-controls')).toHaveCount(0);
  }
  await cloneTool(page, 'Healing');
  await symmetry(page, 'horizontal');
  await altClick(page, 100, 200);
  await expect(footer(page)).toContainText('Healing source set');
  await stroke(page, [100, 300], [1100, 300]);
  await expect(footer(page)).toContainText('Healing stroke applied');
  expect(await pixel(page, 600, 300), 'original healed').not.toEqual(BLUE);
  expect(await pixel(page, 600, 500), 'mirror healed').not.toEqual(BLUE);
  expect(await pixel(page, 600, 400)).toEqual(BLUE);
  await editMenu(page, /^Undo/);

  // With a selection over the top half the mirror copy (row 500) is clipped.
  await selectTool(page, 'Select');
  const a = await at(page, 5, 5), b = await at(page, 1150, 420);
  await page.mouse.move(a.x + 1, a.y + 1);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect(footer(page)).toContainText(/selection/i);
  await selectTool(page, 'Healing');
  await altClick(page, 100, 200);
  await expect(footer(page)).toContainText('source set');
  await stroke(page, [100, 300], [1100, 300]);
  await expect(footer(page)).toContainText('Healing stroke applied');
  expect(await pixel(page, 600, 300)).not.toEqual(BLUE);
  for (const x of [300, 600, 900]) expect(await pixel(page, x, 500), `clipped ${x}`).toEqual(BLUE);
});
