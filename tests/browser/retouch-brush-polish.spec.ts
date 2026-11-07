import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

// Fix wave 2 polish: Spot Healing and Patch honour rectangle, ellipse and
// lasso selections captured at pointer-down (also after undo and reload); the
// Gradient tool previews live while dragging and commits one undo step on
// release; Count jitter varies the count both ways; the first dab of a
// perpendicular-only scatter stroke follows the stroke direction.

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
const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');

type Project = {
  assets: Record<string, { w: number; h: number }>;
  history: Array<{
    selection?: unknown;
    layers: Array<{
      asset?: string;
      spotHealing?: Array<{ selectionMask?: string }>;
      patchStrokes?: Array<{ selectionMask?: string }>;
    }>;
  }>;
  index: number;
};

async function project(page: Page): Promise<Project> {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return (await downloadedProject((await (await pending).path())!)) as Project;
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

const area = (page: Page, x: number, y: number, width: number, height: number) =>
  canvas(page).evaluate((element: HTMLCanvasElement, rect) =>
    Array.from(element.getContext('2d')!.getImageData(rect.x, rect.y, rect.width, rect.height).data),
  { x, y, width, height });
const pixel = (page: Page, x: number, y: number) => area(page, x, y, 1, 1);

async function editMenu(page: Page, item: RegExp) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
  await settled(page);
}

/** Mouse drag through image points. */
async function drag(page: Page, points: Array<[number, number]>, steps = 8) {
  const first = await at(page, ...points[0]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const point of points.slice(1)) {
    const next = await at(page, ...point);
    await page.mouse.move(next.x, next.y, { steps });
  }
  await page.mouse.up();
}

const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];

/**
 * Default 1200×800 document: opaque blue paint layer with a red band through
 * row 200, `band` pixels tall.
 */
async function blueLayerWithRedBand(page: Page, band = 80) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await selectTool(page, 'Fill');
  await setColor(page, 'Drawing color', '#0000ff');
  const point = await at(page, 600, 400);
  await page.mouse.click(point.x, point.y);
  await expect(footer(page)).toContainText('Area filled');
  await settled(page);
  await selectTool(page, 'Brush');
  await page.getByLabel('Size', { exact: true }).fill(String(band));
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await setColor(page, 'Drawing color', '#ff0000');
  await drag(page, [[20, 200], [1180, 200]], 12);
  await expect(footer(page)).toContainText('Paint layer updated');
  await settled(page);
  expect(await pixel(page, 600, 200)).toEqual(RED);
}

async function retouchTool(page: Page, label: 'Spot Healing' | 'Patch', size: number) {
  await selectTool(page, label);
  await page.getByLabel('Size', { exact: true }).fill(String(size));
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
}

/** Healed band pixels turn back to the surrounding blue. */
const healed = (sample: number[]) => sample[2] > 200 && sample[0] < 60;

test('Spot Healing inside a rectangular selection heals only inside it, with undo, redo and reload', async ({ page }) => {
  // A 30 px band healed with a 60 px brush: the context annulus lies outside the band.
  await blueLayerWithRedBand(page, 30);
  await selectTool(page, 'Select');
  await drag(page, [[300, 150], [900, 250]], 5);
  await expect(footer(page)).toContainText(/selection/i);
  await retouchTool(page, 'Spot Healing', 60);
  // The stroke crosses the selection's left edge at x = 300.
  await drag(page, [[200, 200], [500, 200]], 8);
  await expect(footer(page)).toContainText('Spot Healing applied nondestructively');
  await settled(page);
  for (const x of [320, 400, 480]) expect(healed(await pixel(page, x, 200)), `${x}`).toBe(true);
  // The band outside the selection is untouched, byte for byte.
  for (const x of [220, 260, 290]) expect(await pixel(page, x, 200), `${x}`).toEqual(RED);

  const file = await project(page);
  const stroke = file.history[file.index].layers.at(-1)!.spotHealing!.at(-1)!;
  expect(stroke.selectionMask).toEqual(expect.any(String));
  expect(file.assets[stroke.selectionMask!]).toMatchObject({ w: 1200, h: 800 });

  await editMenu(page, /^Undo/);
  expect(await pixel(page, 400, 200)).toEqual(RED);
  await editMenu(page, /^Redo/);
  expect(healed(await pixel(page, 400, 200))).toBe(true);

  // Deselect, then reload: the stored snapshot keeps the stroke confined.
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Deselect Ctrl\+D$/ }).click();
  await settled(page);
  await saved(page);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await settled(page);
  await expect.poll(async () => healed(await pixel(page, 400, 200))).toBe(true);
  expect(await pixel(page, 260, 200)).toEqual(RED);
  expect(await pixel(page, 290, 200)).toEqual(RED);
});

test('Patch inside an elliptical selection copies the source only inside the ellipse', async ({ page }) => {
  await blueLayerWithRedBand(page);
  await selectTool(page, 'Elliptical marquee');
  await drag(page, [[400, 300], [800, 500]], 5);
  await expect(footer(page)).toContainText(/Elliptical selection/i);
  await retouchTool(page, 'Patch', 120);
  // First click sets the source on the red band; the drag at row 400 copies
  // row 200 (offset +300, −200), which is red across the document.
  const source = await at(page, 600, 200);
  await page.mouse.click(source.x, source.y);
  await expect(footer(page)).toContainText('Patch source set');
  await drag(page, [[300, 400], [900, 400]], 16);
  await expect(footer(page)).toContainText('Patch applied nondestructively');
  await settled(page);
  // Destination rows 360–440 read the red rows 160–240.
  for (const [x, y] of [[600, 400], [450, 400], [750, 400], [600, 370], [450, 420]])
    expect(await pixel(page, x, y), `${x},${y}`).toEqual(RED);
  // Inside the stroke, reading red, but outside the ellipse: stays blue.
  for (const [x, y] of [[350, 400], [850, 400], [390, 380], [810, 420]])
    expect(await pixel(page, x, y), `${x},${y}`).toEqual(BLUE);
  const file = await project(page);
  const stroke = file.history[file.index].layers.at(-1)!.patchStrokes!.at(-1)!;
  expect(file.assets[stroke.selectionMask!]).toMatchObject({ w: 1200, h: 800 });
  await editMenu(page, /^Undo/);
  expect(await pixel(page, 600, 400)).toEqual(BLUE);
  await editMenu(page, /^Redo/);
  expect(await pixel(page, 600, 400)).toEqual(RED);
});

test('Spot Healing inside a freehand lasso stays inside the lasso', async ({ page }) => {
  await blueLayerWithRedBand(page, 30);
  await selectTool(page, 'Lasso');
  await drag(page, [[450, 140], [750, 140], [750, 260], [450, 260], [450, 145]], 6);
  await expect(footer(page)).toContainText(/selection created/i);
  await settled(page);
  await retouchTool(page, 'Spot Healing', 60);
  await drag(page, [[350, 200], [620, 200]], 8);
  await expect(footer(page)).toContainText('Spot Healing applied nondestructively');
  await settled(page);
  for (const x of [470, 540, 600]) expect(healed(await pixel(page, x, 200)), `${x}`).toBe(true);
  for (const x of [370, 410, 440]) expect(await pixel(page, x, 200), `${x}`).toEqual(RED);
  // Without a selection the same tool heals everywhere it paints.
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Deselect Ctrl\+D$/ }).click();
  await settled(page);
  await drag(page, [[850, 200], [1000, 200]], 6);
  await expect(footer(page)).toContainText('Spot Healing applied nondestructively');
  await settled(page);
  expect(healed(await pixel(page, 920, 200))).toBe(true);
  const file = await project(page);
  const strokes = file.history[file.index].layers.at(-1)!.spotHealing!;
  expect(strokes[0].selectionMask).toEqual(expect.any(String));
  expect(strokes[1].selectionMask).toBeUndefined();
});

/** 400×200 document with a paint layer. */
async function smallDocument(page: Page, background: 'white' | 'black') {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('New document width (px)').fill('400');
  await dialog.getByLabel('New document height (px)').fill('200');
  await dialog.getByLabel('Background contents').selectOption(background);
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(canvas(page)).toHaveJSProperty('width', 400);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
}

test('the Gradient tool previews live while dragging and commits one undo step on release', async ({ page }) => {
  await smallDocument(page, 'white');
  await selectTool(page, 'Gradient');
  await page.getByLabel('Gradient end', { exact: true }).selectOption('transparent');
  await setColor(page, 'Drawing color', '#000000');
  const start = await at(page, 0, 100), middle = await at(page, 200, 100), end = await at(page, 399, 100);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(middle.x, middle.y, { steps: 6 });
  // Mid-drag the canvas already shows the gradient ending at the pointer.
  await expect.poll(async () => (await pixel(page, 10, 100))[0]).toBeLessThan(40);
  await settled(page);
  expect((await pixel(page, 300, 100))[0]).toBeGreaterThan(250);
  const halfway = (await pixel(page, 100, 100))[0];
  expect(halfway).toBeGreaterThan(90);
  expect(halfway).toBeLessThan(165);
  await expect(footer(page)).not.toContainText('Gradient applied');
  // Moving further updates the preview: row 300 now lies inside the gradient.
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await expect.poll(async () => (await pixel(page, 300, 100))[0]).toBeLessThan(250);
  await settled(page);
  const preview = await area(page, 0, 100, 400, 1);
  await page.mouse.up();
  await expect(footer(page)).toContainText('Gradient applied');
  await settled(page);
  // The committed layer equals the last preview frame.
  const committed = await area(page, 0, 100, 400, 1);
  for (let index = 0; index < committed.length; index += 1)
    expect(Math.abs(committed[index] - preview[index]), `byte ${index}`).toBeLessThanOrEqual(1);
  // One undo restores the white layer.
  await editMenu(page, /^Undo/);
  expect(await pixel(page, 10, 100)).toEqual([255, 255, 255, 255]);
  expect(await pixel(page, 300, 100)).toEqual([255, 255, 255, 255]);
  await editMenu(page, /^Redo/);
  expect((await pixel(page, 10, 100))[0]).toBeLessThan(40);
});

test('a touch gradient drag cancelled by pointercancel leaves no preview behind', async ({ page }) => {
  await smallDocument(page, 'white');
  await selectTool(page, 'Gradient');
  await setColor(page, 'Drawing color', '#000000');
  await canvas(page).scrollIntoViewIfNeeded();
  const a = await at(page, 0, 100), b = await at(page, 300, 100);
  await canvas(page).evaluate((element) => { element.setPointerCapture = () => undefined; });
  const event = { pointerId: 51, pointerType: 'touch', isPrimary: true, buttons: 1 };
  await canvas(page).dispatchEvent('pointerdown', { ...event, clientX: a.x, clientY: a.y });
  for (let step = 1; step <= 6; step += 1)
    await canvas(page).dispatchEvent('pointermove', { ...event, clientX: a.x + ((b.x - a.x) * step) / 6, clientY: a.y });
  await expect.poll(async () => (await pixel(page, 10, 100))[0]).toBeLessThan(40);
  await canvas(page).dispatchEvent('pointercancel', { ...event, buttons: 0, clientX: b.x, clientY: b.y });
  await expect(footer(page)).toContainText('Gesture cancelled');
  await settled(page);
  expect(await pixel(page, 10, 100)).toEqual([255, 255, 255, 255]);
});

async function brushSetup(page: Page, size: string) {
  await selectTool(page, 'Brush');
  await setColor(page, 'Drawing color', '#000000');
  await page.getByLabel('Size', { exact: true }).fill(size);
  await page.getByLabel('Size', { exact: true }).press('Enter');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
}

async function brushStroke(page: Page, from: [number, number], to: [number, number]) {
  await drag(page, [from, to], 12);
  await expect(footer(page)).toContainText('Paint layer updated', { timeout: 10000 });
  await settled(page);
}

/** Painted (dark) pixel indices in the 400×200 white document. */
async function dark(page: Page) {
  const data = await area(page, 0, 0, 400, 200), result = new Set<number>();
  for (let index = 0; index < data.length; index += 4) if (data[index] < 128) result.add(index / 4);
  return result;
}

test('Count jitter adds as well as removes dabs, bounded by the jittered count range', async ({ page }) => {
  await smallDocument(page, 'white');
  await brushSetup(page, '4');
  await page.getByLabel('Spacing', { exact: true }).fill('300');
  await page.getByLabel('Scatter', { exact: true }).fill('400');
  const paint = async (count: string, jitter: string) => {
    await page.getByLabel('Count', { exact: true }).fill(count);
    await page.getByLabel('Count jitter', { exact: true }).fill(jitter);
    await expect(page.getByLabel('Count jitter', { exact: true })).toHaveValue(jitter);
    await brushStroke(page, [40, 100], [360, 100]);
    const pixels = await dark(page);
    await editMenu(page, /^Undo/);
    return pixels;
  };
  // The same pointer path replays the same dab positions for each setting.
  const single = await paint('1', '0');
  const jittered = await paint('1', '100');
  const double = await paint('2', '0');
  expect(single.size).toBeGreaterThan(0);
  // Count 1 with 100% jitter places one or two dabs per step: a strict
  // superset of Count 1 and a strict subset of Count 2.
  for (const index of single) expect(jittered.has(index)).toBe(true);
  for (const index of jittered) expect(double.has(index)).toBe(true);
  expect(jittered.size).toBeGreaterThan(single.size);
  expect(jittered.size).toBeLessThan(double.size);
  // Every dab stays within the scatter reach of the stroke (400% of 4 px = 12 px + radius).
  for (const index of jittered) expect(Math.abs(Math.floor(index / 400) - 100)).toBeLessThanOrEqual(12 + 2 + 1.5);
});

test('with Scatter both axes off the first dab scatters across the stroke, not along it', async ({ page }) => {
  await smallDocument(page, 'white');
  await brushSetup(page, '4');
  await page.getByLabel('Spacing', { exact: true }).fill('1000');
  await page.getByLabel('Scatter', { exact: true }).fill('400');
  await page.getByLabel('Scatter both axes', { exact: true }).uncheck();
  const rows = [20, 55, 90, 125, 160];
  for (const y of rows) await brushStroke(page, [60, y], [340, y]);
  const painted = await dark(page);
  for (const y of rows) {
    const inRow = [...painted].filter((index) => Math.abs(Math.floor(index / 400) - y) <= 15);
    const xs = inRow.map((index) => index % 400);
    expect(xs.length, `row ${y}`).toBeGreaterThan(0);
    // Dabs land on stroke columns only: the first at x≈60 never slides left.
    expect(Math.min(...xs), `row ${y}`).toBeGreaterThanOrEqual(60 - 4);
    expect(Math.min(...xs), `row ${y}`).toBeLessThanOrEqual(60 + 4);
  }
});
