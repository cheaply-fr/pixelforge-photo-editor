import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

// Retouch tools follow #184's selection confinement: Clone Stamp, Healing,
// Pattern Stamp and Color Replace change pixels only inside the active
// (feathered) selection, with the live preview equal to the committed asset.
// An Option/Alt-click source is honoured even while the previous stroke is
// still committing, and Mask from selection consumes the selection.

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const settled = (page: Page) => expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
const footer = (page: Page) => page.locator('footer');

type Project = {
  history: Array<{
    selection?: unknown;
    previousSelection?: unknown;
    layers: Array<{ asset?: string; mask?: string }>;
  }>;
  index: number;
};

async function project(page: Page): Promise<Project> {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return (await downloadedProject((await download.path())!)) as Project;
}

/** A fresh transparent document with an empty paint layer on top. */
async function transparentPaintLayer(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
}

async function setColor(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).evaluate((input: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** Client point for an image pixel (tool options sit below the canvas on phones). */
async function at(page: Page, x: number, y: number) {
  await canvas(page).scrollIntoViewIfNeeded();
  return canvas(page).evaluate((element: HTMLCanvasElement, point) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + (point.x / element.width) * rect.width, y: rect.top + (point.y / element.height) * rect.height };
  }, { x, y });
}

const pixel = (page: Page, x: number, y: number) =>
  canvas(page).evaluate((element: HTMLCanvasElement, point) =>
    Array.from(element.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data), { x, y });

async function selectRect(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await selectTool(page, 'Select');
  const a = await at(page, x0, y0), b = await at(page, x1, y1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect(footer(page)).toContainText(/selection/i);
}

async function editMenu(page: Page, item: RegExp) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
  await settled(page);
}

/** Horizontal mouse stroke at image row y; optionally sample the live preview before release. */
async function stroke(page: Page, x0: number, x1: number, y: number, preview?: Array<[number, number]>) {
  const a = await at(page, x0, y), b = await at(page, x1, y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  let live: number[][] = [];
  if (preview) {
    await settled(page);
    live = await Promise.all(preview.map(([x, y]) => pixel(page, x, y)));
  }
  await page.mouse.up();
  await settled(page);
  return live;
}

/**
 * Dispatch raw pointer events in one task, so later events arrive while the
 * first gesture is still decoding its layer (exactly the large-document race).
 */
async function dispatchPointers(
  page: Page,
  events: Array<{ type: 'pointerdown' | 'pointerup'; x: number; y: number; altKey?: boolean }>,
) {
  await canvas(page).scrollIntoViewIfNeeded();
  await canvas(page).evaluate((element: HTMLCanvasElement, list) => {
    element.setPointerCapture = () => undefined;
    const rect = element.getBoundingClientRect();
    for (const event of list)
      element.dispatchEvent(new PointerEvent(event.type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 41,
        pointerType: 'mouse',
        isPrimary: true,
        pressure: event.type === 'pointerdown' ? 0.5 : 0,
        buttons: event.type === 'pointerdown' ? 1 : 0,
        altKey: Boolean(event.altKey),
        clientX: rect.left + (event.x / element.width) * rect.width,
        clientY: rect.top + (event.y / element.height) * rect.height,
      }));
  }, events);
}

async function altClick(page: Page, x: number, y: number) {
  await dispatchPointers(page, [
    { type: 'pointerdown', x, y, altKey: true },
    { type: 'pointerup', x, y, altKey: true },
  ]);
}

/** Opaque blue layer with an opaque red band through row 200. */
async function blueLayerWithRedBand(page: Page) {
  await transparentPaintLayer(page);
  await selectTool(page, 'Fill');
  await setColor(page, 'Drawing color', '#0000ff');
  const point = await at(page, 600, 400);
  await page.mouse.click(point.x, point.y);
  await expect(footer(page)).toContainText('Area filled');
  await settled(page);
  await selectTool(page, 'Brush');
  await page.getByLabel('Size', { exact: true }).fill('80');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await setColor(page, 'Drawing color', '#ff0000');
  await stroke(page, 20, 1180, 200);
  expect(await pixel(page, 600, 200)).toEqual([255, 0, 0, 255]);
}

async function cloneTool(page: Page, label: 'Clone' | 'Healing', size: number) {
  await selectTool(page, label);
  await page.getByLabel('Size', { exact: true }).fill(String(size));
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
}

const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];
const OUTSIDE: Array<[number, number]> = [[150, 400], [280, 400], [920, 400], [1050, 400]];

test('Clone Stamp across a rectangular selection clones only inside it, live and committed, with undo/redo', async ({ page }) => {
  await blueLayerWithRedBand(page);
  await selectRect(page, 300, 300, 900, 500);
  await cloneTool(page, 'Clone', 40);
  // Source on the red band directly above the stroke start: the stroke at
  // row 400 copies row 200, which is red all the way across.
  await altClick(page, 100, 200);
  await expect(footer(page)).toContainText('Clone source set');
  await expect(page.getByTestId('clone-source-marker')).toHaveAttribute('data-x', '100');
  await expect(page.getByTestId('clone-source-marker')).toHaveAttribute('data-y', '200');

  const live = await stroke(page, 100, 1100, 400, [[600, 400], ...OUTSIDE]);
  expect(live[0]).toEqual(RED);
  for (const [index, sample] of live.slice(1).entries())
    expect(sample, `live ${OUTSIDE[index].join(',')}`).toEqual(BLUE);
  await expect(footer(page)).toContainText('Clone stroke applied');
  for (const [x, y] of [[310, 400], [600, 400], [890, 400]])
    expect(await pixel(page, x, y), `${x},${y}`).toEqual(RED);
  for (const [x, y] of OUTSIDE) expect(await pixel(page, x, y), `${x},${y}`).toEqual(BLUE);
  // The source row itself is untouched.
  expect(await pixel(page, 600, 200)).toEqual(RED);

  await editMenu(page, /^Undo/);
  expect(await pixel(page, 600, 400)).toEqual(BLUE);
  await editMenu(page, /^Redo/);
  expect(await pixel(page, 600, 400)).toEqual(RED);
  expect(await pixel(page, 150, 400)).toEqual(BLUE);
});

test('Clone Stamp blends proportionally across a feathered selection edge', async ({ page }) => {
  await blueLayerWithRedBand(page);
  await selectRect(page, 300, 300, 900, 500);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Feather…', exact: true }).click();
  await page.getByLabel('Selection feather radius (px)').fill('40');
  await page.getByRole('button', { name: 'Apply feather', exact: true }).click();
  await cloneTool(page, 'Clone', 60);
  await altClick(page, 100, 200);
  await stroke(page, 100, 1100, 400);
  expect(await pixel(page, 600, 400)).toEqual(RED);
  // At the feathered boundary the result is a partial red/blue mix.
  const edge = await pixel(page, 300, 400);
  expect(edge[0]).toBeGreaterThan(40);
  expect(edge[0]).toBeLessThan(220);
  expect(edge[2]).toBeGreaterThan(40);
  expect(edge[2]).toBeLessThan(220);
  expect(edge[3]).toBe(255);
  expect(await pixel(page, 150, 400)).toEqual(BLUE);
  expect(await pixel(page, 1050, 400)).toEqual(BLUE);
});

test('Healing Brush only heals inside the selection and Alt-click sets its source', async ({ page }) => {
  await blueLayerWithRedBand(page);
  await selectRect(page, 300, 300, 900, 500);
  await cloneTool(page, 'Healing', 40);
  await altClick(page, 100, 200);
  await expect(footer(page)).toContainText('Healing source set');
  await expect(page.getByTestId('clone-source-marker')).toBeAttached();
  await stroke(page, 100, 1100, 400);
  await expect(footer(page)).toContainText('Healing stroke applied');
  const healed = await pixel(page, 600, 400);
  // Healing blends the red source into the blue destination inside only.
  expect(healed).not.toEqual(BLUE);
  for (const [x, y] of OUTSIDE) expect(await pixel(page, x, y), `${x},${y}`).toEqual(BLUE);
});

test('Pattern Stamp and Color Replace stay inside the selection', async ({ page }) => {
  await transparentPaintLayer(page);
  await selectRect(page, 300, 300, 900, 500);
  await selectTool(page, 'Pattern Stamp');
  await page.getByLabel('Size', { exact: true }).fill('40');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await stroke(page, 100, 1100, 400);
  expect((await pixel(page, 600, 400))[3]).toBeGreaterThan(0);
  for (const [x, y] of OUTSIDE) expect(await pixel(page, x, y), `${x},${y}`).toEqual([0, 0, 0, 0]);

  // Color Replace on a fully blue layer: only the selected part turns red.
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Deselect Ctrl\+D$/ }).click();
  await transparentPaintLayer(page);
  await selectTool(page, 'Fill');
  await setColor(page, 'Drawing color', '#0000ff');
  const point = await at(page, 600, 400);
  await page.mouse.click(point.x, point.y);
  await expect(footer(page)).toContainText('Area filled');
  await settled(page);
  await selectRect(page, 300, 300, 900, 500);
  await selectTool(page, 'Color Replace');
  await page.getByLabel('Size', { exact: true }).fill('40');
  await page.getByLabel('Color Replace mode', { exact: true }).selectOption('normal');
  await setColor(page, 'Drawing color', '#ff0000');
  await stroke(page, 100, 1100, 400);
  expect(await pixel(page, 600, 400)).toEqual(RED);
  for (const [x, y] of OUTSIDE) expect(await pixel(page, x, y), `${x},${y}`).toEqual(BLUE);
});

test('an Alt-click source set while the previous clone stroke commits on a 2646×4096 poster is honoured', async ({ page }) => {
  test.setTimeout(180_000);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('Document preset').selectOption('poster-2-3');
  await dialog.getByLabel('Background contents').selectOption('white');
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(canvas(page)).toHaveJSProperty('width', 2646);
  await settled(page);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);

  // Two opaque source swatches on the paint layer: red at A, blue at B.
  await selectTool(page, 'Brush');
  await page.getByLabel('Size', { exact: true }).fill('300');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  for (const [color, x] of [['#ff0000', 600], ['#0000ff', 2000]] as const) {
    await setColor(page, 'Drawing color', color);
    await dispatchPointers(page, [{ type: 'pointerdown', x, y: 800 }, { type: 'pointerup', x, y: 800 }]);
    await expect.poll(() => pixel(page, x, 800), { timeout: 60_000 }).toEqual(
      color === '#ff0000' ? RED : BLUE,
    );
    await settled(page);
  }

  await cloneTool(page, 'Clone', 100);
  await altClick(page, 600, 800);
  await expect(footer(page)).toContainText('Clone source set');
  // Stroke 1 (from red) and, in the same task, an Alt-click on blue while
  // that stroke is still decoding the 10.8 MP layer and has not committed.
  await dispatchPointers(page, [
    { type: 'pointerdown', x: 600, y: 2500 },
    { type: 'pointerup', x: 600, y: 2500 },
    { type: 'pointerdown', x: 2000, y: 800, altKey: true },
    { type: 'pointerup', x: 2000, y: 800, altKey: true },
  ]);
  await expect.poll(() => pixel(page, 600, 2500), { timeout: 60_000 }).toEqual(RED);
  await settled(page);
  await expect(page.getByTestId('clone-source-marker')).toHaveAttribute('data-x', '2000');
  await expect(page.getByTestId('clone-source-marker')).toHaveAttribute('data-y', '800');

  // Stroke 2 must use the new (blue) source, not the stale red anchor.
  await dispatchPointers(page, [
    { type: 'pointerdown', x: 1300, y: 3200 },
    { type: 'pointerup', x: 1300, y: 3200 },
  ]);
  await expect.poll(() => pixel(page, 1300, 3200), { timeout: 60_000 }).toEqual(BLUE);
  await settled(page);
  // Stroke 1 kept its own red source.
  expect(await pixel(page, 600, 2500)).toEqual(RED);
});

test('Mask from selection consumes the selection so the new mask can be painted outside it, undoable as one step', async ({ page }) => {
  await transparentPaintLayer(page);
  await selectTool(page, 'Fill');
  await setColor(page, 'Drawing color', '#ff00ff');
  const point = await at(page, 600, 400);
  await page.mouse.click(point.x, point.y);
  await expect(footer(page)).toContainText('Area filled');
  await settled(page);
  await selectRect(page, 300, 300, 900, 500);
  await page.getByRole('button', { name: 'Mask from selection', exact: true }).click();
  await expect(page.getByText('Nondestructive mask active', { exact: true })).toBeVisible();
  await expect(footer(page)).toContainText('selection cleared');
  await settled(page);
  await expect(page.getByRole('button', { name: 'Mask from selection', exact: true })).toBeDisabled();
  expect(await pixel(page, 600, 400)).toEqual([255, 0, 255, 255]);
  expect(await pixel(page, 150, 400)).toEqual([0, 0, 0, 0]);
  let saved = await project(page);
  expect(saved.history[saved.index].selection).toBeUndefined();
  expect(saved.history[saved.index].previousSelection).toBeDefined();

  // Reveal the masked-out area with Mask Brush: no Deselect is needed.
  await selectTool(page, 'Mask Brush');
  await page.getByLabel('Size', { exact: true }).fill('40');
  await stroke(page, 100, 1100, 650);
  for (const [x, y] of [[150, 650], [600, 650], [1050, 650]])
    expect(await pixel(page, x, y), `${x},${y}`).toEqual([255, 0, 255, 255]);

  // Undo the mask stroke, then the mask: one step removes the mask and
  // restores the selection.
  await editMenu(page, /^Undo/);
  expect(await pixel(page, 150, 650)).toEqual([0, 0, 0, 0]);
  await editMenu(page, /^Undo/);
  await expect(page.getByText('Nondestructive mask active', { exact: true })).toHaveCount(0);
  expect(await pixel(page, 150, 400)).toEqual([255, 0, 255, 255]);
  await expect(page.getByRole('button', { name: 'Mask from selection', exact: true })).toBeEnabled();
  saved = await project(page);
  expect(saved.history[saved.index].selection).toBeDefined();
  expect(saved.history[saved.index].layers.at(-1)?.mask).toBeUndefined();
  await editMenu(page, /^Redo/);
  await expect(page.getByText('Nondestructive mask active', { exact: true })).toBeVisible();
  saved = await project(page);
  expect(saved.history[saved.index].selection).toBeUndefined();
  expect(saved.history[saved.index].layers.at(-1)?.mask).toEqual(expect.any(String));
});
