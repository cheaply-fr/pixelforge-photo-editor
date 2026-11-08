import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

/*
 * Lasso paths that leave the canvas are clipped to it, as in Photoshop,
 * instead of failing document validation with "Invalid layer document".
 */

type Point = { x: number; y: number };

const saved = async (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );

async function project(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const download = await pending;
  const value = await downloadedProject((await download.path())!);
  return value.history[value.index];
}

async function canvasBox(page: Page) {
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  // The stage pads the canvas, so there is room to drag past its left edge.
  expect(box.x).toBeGreaterThan(30);
  return box;
}

/** A real drag: mouse on desktop, CDP touch events on the mobile profile. */
async function drag(page: Page, mobile: boolean, path: Point[]) {
  if (!mobile) {
    await page.mouse.move(path[0].x, path[0].y);
    await page.mouse.down();
    for (const point of path.slice(1))
      await page.mouse.move(point.x, point.y, { steps: 6 });
    await page.mouse.up();
    return;
  }
  const client = await page.context().newCDPSession(page);
  const touch = (point: Point) => [{ x: point.x, y: point.y, id: 1 }];
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touch(path[0]) });
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1], to = path[index];
    for (let step = 1; step <= 6; step += 1)
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: touch({
          x: from.x + ((to.x - from.x) * step) / 6,
          y: from.y + ((to.y - from.y) * step) / 6,
        }),
      });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();
}

/** Click-to-place vertices, including ones beyond the canvas element. */
async function placeVertices(page: Page, mobile: boolean, points: Point[]) {
  const canvas = page.getByTestId('editor-canvas');
  // Synthetic pointers have no active pointer id to capture.
  await canvas.evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  const pointerType = mobile ? 'touch' : 'mouse';
  for (const [index, point] of points.entries()) {
    const init = { pointerId: 40 + index, pointerType, pressure: 0.5, clientX: point.x, clientY: point.y, isPrimary: true };
    await canvas.dispatchEvent('pointerdown', { ...init, buttons: 1 });
    await canvas.dispatchEvent('pointerup', { ...init, buttons: 0 });
  }
}

/** RGBA of the rendered document at fractional canvas coordinates. */
async function rendered(page: Page, points: [number, number][]) {
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  return page.getByTestId('editor-canvas').evaluate((element: HTMLCanvasElement, at) => {
    const context = element.getContext('2d')!;
    return at.map(([x, y]) =>
      Array.from(context.getImageData(Math.floor(element.width * x), Math.floor(element.height * y), 1, 1).data),
    );
  }, points);
}

/** Edit > Fill… fills the active selection with the drawing color. */
async function fillSelection(page: Page) {
  await page.getByLabel('Drawing color', { exact: true }).fill('#00ff00');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Fill…/ }).click();
  // The Fill dialog defaults to the foreground (drawing) colour at 100%.
  const dialog = page.getByRole('dialog', { name: 'Fill' });
  await dialog.getByRole('button', { name: 'Fill', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('footer')).toContainText('Selection filled', { timeout: 10000 });
}

const green = (rgba: number[]) => rgba[1] > 200 && rgba[0] < 60 && rgba[2] < 60;

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await saved(page);
});

test('freehand Lasso dragged past the canvas edge is clipped and fills only inside', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  await selectTool(page, 'Lasso');
  const box = await canvasBox(page);
  const at = (x: number, y: number) => ({ x: box.x + box.width * x, y: box.y + box.height * y });
  const outsideLeft = box.x - 24;
  await drag(page, mobile, [
    at(0.3, 0.3),
    { x: outsideLeft, y: at(0, 0.3).y },
    { x: outsideLeft, y: at(0, 0.7).y },
    at(0.3, 0.7),
    at(0.3, 0.32),
  ]);
  await expect(page.locator('footer')).toContainText('Polygonal selection created');
  await expect(page.locator('footer')).not.toContainText('Invalid layer document');

  const frame = await project(page);
  const selection = frame.selection;
  expect(selection.shape).toBe('polygon');
  expect(selection.x).toBe(0);
  expect(selection.w).toBeGreaterThan(frame.w * 0.25);
  expect(selection.h).toBeGreaterThan(frame.h * 0.3);
  for (const point of selection.points) {
    expect(point.x).toBeGreaterThanOrEqual(0);
    expect(point.x).toBeLessThanOrEqual(frame.w);
    expect(point.y).toBeGreaterThanOrEqual(0);
    expect(point.y).toBeLessThanOrEqual(frame.h);
  }

  await fillSelection(page);
  const [inside, edge, right, above] = await rendered(page, [
    [0.15, 0.5],
    [0.03, 0.5],
    [0.7, 0.5],
    [0.15, 0.15],
  ]);
  expect(green(inside)).toBe(true);
  expect(green(edge)).toBe(true);
  expect(green(right)).toBe(false);
  expect(green(above)).toBe(false);
});

test('Lasso points placed on the canvas border survive screen-to-canvas rounding', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  await selectTool(page, 'Lasso');
  const box = await canvasBox(page);
  const at = (x: number, y: number) => ({ x: box.x + box.width * x, y: box.y + box.height * y });
  // Exactly on, and a fraction of a CSS pixel beyond, the right border.
  const border = box.x + box.width;
  await drag(page, mobile, [
    at(0.7, 0.3),
    { x: border, y: at(0, 0.3).y },
    { x: border + 0.6, y: at(0, 0.7).y },
    at(0.7, 0.7),
    at(0.7, 0.32),
  ]);
  await expect(page.locator('footer')).toContainText('Polygonal selection created');
  await expect(page.locator('footer')).not.toContainText('Invalid layer document');
  const frame = await project(page);
  expect(frame.selection.shape).toBe('polygon');
  expect(frame.selection.x + frame.selection.w).toBeLessThanOrEqual(frame.w);
  expect(frame.selection.x + frame.selection.w).toBeGreaterThan(frame.w - 3);
});

test('Lasso add mode keeps combining with an off-canvas loop', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  await selectTool(page, 'Select');
  const box = await canvasBox(page);
  const at = (x: number, y: number) => ({ x: box.x + box.width * x, y: box.y + box.height * y });
  await drag(page, mobile, [at(0.6, 0.6), at(0.8, 0.8)]);
  await expect(page.locator('footer')).toContainText('Rectangular selection created');
  await page.getByLabel('Selection mode', { exact: true }).selectOption('add');
  await selectTool(page, 'Lasso');
  await drag(page, mobile, [
    at(0.3, 0.3),
    { x: box.x - 24, y: at(0, 0.3).y },
    { x: box.x - 24, y: at(0, 0.5).y },
    at(0.3, 0.5),
    at(0.3, 0.32),
  ]);
  await expect(page.locator('footer')).toContainText('Polygonal selection created');
  await expect(page.locator('footer')).not.toContainText('Invalid layer document');
  const frame = await project(page);
  expect(frame.selection.shape).toBe('polygon');
  expect(frame.selection.parts.map((part: { operation: string }) => part.operation)).toEqual(['replace', 'add']);
  const lasso = frame.selection.parts[1];
  expect(lasso.x).toBe(0);
  for (const point of lasso.points) {
    expect(point.x).toBeGreaterThanOrEqual(0);
    expect(point.x).toBeLessThanOrEqual(frame.w);
  }

  await fillSelection(page);
  const [lassoArea, lassoEdge, rectangle, between] = await rendered(page, [
    [0.1, 0.4],
    [0.03, 0.4],
    [0.7, 0.7],
    [0.5, 0.4],
  ]);
  expect(green(lassoArea)).toBe(true);
  expect(green(lassoEdge)).toBe(true);
  expect(green(rectangle)).toBe(true);
  expect(green(between)).toBe(false);
});

test('Polygonal Lasso vertices beyond the canvas are clipped to the image', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  await selectTool(page, 'Polygonal Lasso');
  const box = await canvasBox(page);
  const at = (x: number, y: number) => ({ x: box.x + box.width * x, y: box.y + box.height * y });
  const first = at(0.7, 0.3);
  await placeVertices(page, mobile, [
    first,
    { x: box.x + box.width + 24, y: at(0, 0.3).y },
    { x: box.x + box.width + 24, y: at(0, 0.7).y },
    at(0.7, 0.7),
    first,
  ]);
  await expect(page.locator('footer')).toContainText('Polygonal selection created');
  await expect(page.locator('footer')).not.toContainText('Invalid layer document');
  const frame = await project(page);
  expect(frame.selection.shape).toBe('polygon');
  expect(frame.selection.points).toHaveLength(4);
  expect(frame.selection.x + frame.selection.w).toBe(frame.w);
  expect(Math.max(...frame.selection.points.map((point: Point) => point.x))).toBe(frame.w);

  await fillSelection(page);
  const [inside, edge, left] = await rendered(page, [
    [0.85, 0.5],
    [0.97, 0.5],
    [0.4, 0.5],
  ]);
  expect(green(inside)).toBe(true);
  expect(green(edge)).toBe(true);
  expect(green(left)).toBe(false);
});

test('Elliptical Marquee half off the left edge keeps its true radius', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  await selectTool(page, 'Elliptical marquee');
  const box = await canvasBox(page);
  // A 60 × 60 CSS-px circle centred on the left border.
  const radius = 30, centreY = box.y + box.height * 0.5;
  await drag(page, mobile, [
    { x: box.x + radius, y: centreY - radius },
    { x: box.x - radius, y: centreY + radius },
  ]);
  await expect(page.locator('footer')).toContainText('Elliptical selection created (clipped to the canvas)');
  await expect(page.locator('footer')).not.toContainText('Invalid layer document');
  const frame = await project(page);
  const scale = frame.w / box.width;
  expect(frame.selection.shape).toBe('polygon');
  expect(frame.selection.x).toBe(0);
  // Clipped, not squashed: half the width, the full height.
  expect(Math.abs(frame.selection.w - radius * scale)).toBeLessThan(2 * scale + 1);
  expect(Math.abs(frame.selection.h - 2 * radius * scale)).toBeLessThan(2 * scale + 1);

  await fillSelection(page);
  const [border, beyond] = await rendered(page, [
    [2 / box.width, 0.5],
    [(radius * 1.4) / box.width, 0.5],
  ]);
  expect(green(border)).toBe(true);
  expect(green(beyond)).toBe(false);
});

test('a Lasso loop entirely outside the image leaves the selection unchanged', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  await selectTool(page, 'Lasso');
  const box = await canvasBox(page);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  const pointerType = mobile ? 'touch' : 'mouse';
  const path = [
    { x: box.x - 28, y: box.y + box.height * 0.3 },
    { x: box.x - 6, y: box.y + box.height * 0.4 },
    { x: box.x - 20, y: box.y + box.height * 0.6 },
    { x: box.x - 28, y: box.y + box.height * 0.32 },
  ];
  const init = (point: Point, buttons: number) => ({ pointerId: 61, pointerType, pressure: 0.5, clientX: point.x, clientY: point.y, buttons, isPrimary: true });
  await canvas.dispatchEvent('pointerdown', init(path[0], 1));
  for (const point of path.slice(1)) await canvas.dispatchEvent('pointermove', init(point, 1));
  await canvas.dispatchEvent('pointerup', init(path.at(-1)!, 0));
  await expect(page.locator('footer')).toContainText('Lasso selection is outside the image');
  await expect(page.locator('footer')).not.toContainText('Invalid layer document');
  const frame = await project(page);
  expect(frame.selection).toBeUndefined();
});
