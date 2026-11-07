import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';

// Photoshop confines Brush, Pencil, Eraser and layer-mask painting to the
// active selection (feathered coverage paints proportionally). Before this
// fix those tools painted straight through the selection boundary.

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  // A fresh transparent document with an empty paint layer on top.
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
});

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const settled = (page: Page) => expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
const footer = (page: Page) => page.locator('footer');

async function setColor(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).evaluate((input: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/**
 * Client point for an image pixel. Tool option fields live below the canvas
 * on phones, so bring the canvas back into view before pointing at it.
 */
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

/** Rectangular marquee from image (x0, y0) to (x1, y1). */
async function selectRect(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await selectTool(page, 'Select');
  const a = await at(page, x0, y0), b = await at(page, x1, y1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect(footer(page)).toContainText(/selection/i);
}

async function selectMenu(page: Page, item: string | RegExp) {
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

async function feather(page: Page, radius: number) {
  await selectMenu(page, 'Feather…');
  await page.getByLabel('Selection feather radius (px)').fill(String(radius));
  await page.getByRole('button', { name: 'Apply feather', exact: true }).click();
}

async function undo(page: Page) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await settled(page);
}

/** Configure a hard, fully opaque brush-family tool. */
async function brushTool(page: Page, tool: 'Brush' | 'Pencil' | 'Eraser', size: number) {
  await selectTool(page, tool);
  await page.getByLabel('Size', { exact: true }).fill(String(size));
  const hardness = page.getByLabel('Hardness', { exact: true });
  if (tool !== 'Pencil' && await hardness.count()) await hardness.fill('100');
}

/** Horizontal stroke at image row y; optionally sample the live preview before release. */
async function stroke(
  page: Page,
  x0: number,
  x1: number,
  y: number,
  preview?: Array<[number, number]>,
) {
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

/** Cover the whole paint layer with an opaque colour (Fill, no selection). */
async function fillLayer(page: Page, color: string) {
  await selectTool(page, 'Fill');
  await setColor(page, 'Drawing color', color);
  const point = await at(page, 600, 400);
  await page.mouse.click(point.x, point.y);
  await expect(footer(page)).toContainText('Area filled');
  await settled(page);
}

const TRANSPARENT = [0, 0, 0, 0];

test('a brush stroke crossing a rectangular selection paints only inside it, live and committed, and undo restores', async ({ page }) => {
  await selectRect(page, 300, 200, 900, 600);
  await brushTool(page, 'Brush', 40);
  await setColor(page, 'Drawing color', '#ff0000');
  const outsidePoints: Array<[number, number]> = [[150, 400], [280, 400], [920, 400], [1050, 400]];
  const live = await stroke(page, 100, 1100, 400, [[600, 400], ...outsidePoints]);
  // The live preview already matches the confined result.
  expect(live[0]).toEqual([255, 0, 0, 255]);
  for (const [index, sample] of live.slice(1).entries())
    expect(sample, `live ${outsidePoints[index].join(',')}`).toEqual(TRANSPARENT);
  await expect(footer(page)).toContainText('Paint layer updated');

  for (const [x, y] of [[310, 400], [600, 400], [890, 400]])
    expect(await pixel(page, x, y), `${x},${y}`).toEqual([255, 0, 0, 255]);
  for (const [x, y] of outsidePoints) expect(await pixel(page, x, y), `${x},${y}`).toEqual(TRANSPARENT);

  await undo(page);
  expect(await pixel(page, 600, 400)).toEqual(TRANSPARENT);
});

test('the eraser only erases inside the selection', async ({ page }) => {
  await fillLayer(page, '#0000ff');
  await selectRect(page, 300, 200, 900, 600);
  await brushTool(page, 'Eraser', 40);
  await stroke(page, 100, 1100, 400);
  expect(await pixel(page, 600, 400)).toEqual(TRANSPARENT);
  expect(await pixel(page, 310, 400)).toEqual(TRANSPARENT);
  for (const [x, y] of [[150, 400], [280, 400], [920, 400], [1050, 400]])
    expect(await pixel(page, x, y), `${x},${y}`).toEqual([0, 0, 255, 255]);

  await undo(page);
  expect(await pixel(page, 600, 400)).toEqual([0, 0, 255, 255]);
});

test('the pencil respects an inverted selection', async ({ page }) => {
  await selectRect(page, 300, 200, 900, 600);
  await selectMenu(page, /^Inverse/);
  await brushTool(page, 'Pencil', 30);
  await setColor(page, 'Drawing color', '#00ff00');
  await stroke(page, 100, 1100, 400);
  // Outside the original rectangle is now selected and painted.
  for (const [x, y] of [[150, 400], [280, 400], [920, 400], [1050, 400]])
    expect(await pixel(page, x, y), `${x},${y}`).toEqual([0, 255, 0, 255]);
  // The deselected rectangle is untouched.
  for (const [x, y] of [[310, 400], [600, 400], [890, 400]])
    expect(await pixel(page, x, y), `${x},${y}`).toEqual(TRANSPARENT);
});

test('a feathered selection edge receives partial brush paint without darkening', async ({ page }) => {
  await selectRect(page, 300, 200, 900, 600);
  await feather(page, 40);
  await brushTool(page, 'Brush', 60);
  await setColor(page, 'Drawing color', '#00ff00');
  await stroke(page, 100, 1100, 400);
  const centre = await pixel(page, 600, 400);
  const edge = await pixel(page, 300, 400);
  expect(centre).toEqual([0, 255, 0, 255]);
  expect(edge[3]).toBeGreaterThan(40);
  expect(edge[3]).toBeLessThan(220);
  expect(edge[1]).toBeGreaterThan(240);
  expect(await pixel(page, 150, 400)).toEqual(TRANSPARENT);
  expect(await pixel(page, 1050, 400)).toEqual(TRANSPARENT);
});

test('without a selection brush strokes still paint the whole path', async ({ page }) => {
  await brushTool(page, 'Brush', 40);
  await setColor(page, 'Drawing color', '#ff0000');
  await stroke(page, 100, 1100, 400);
  for (const [x, y] of [[150, 400], [600, 400], [1050, 400]])
    expect(await pixel(page, x, y), `${x},${y}`).toEqual([255, 0, 0, 255]);
});

test('Mask Eraser only conceals inside the active selection', async ({ page }) => {
  await fillLayer(page, '#ff00ff');
  // Mask the layer to a wide rectangle, then select a smaller one inside it.
  await selectRect(page, 100, 100, 1100, 700);
  await page.getByRole('button', { name: 'Mask from selection', exact: true }).click();
  await expect(page.getByText('Nondestructive mask active', { exact: true })).toBeVisible();
  await settled(page);
  await selectRect(page, 400, 300, 800, 500);
  await selectTool(page, 'Mask Eraser');
  await page.getByLabel('Size', { exact: true }).fill('40');
  await stroke(page, 200, 1000, 400);
  await expect(footer(page)).toContainText('Mask Eraser concealed pixels');
  expect(await pixel(page, 600, 400)).toEqual(TRANSPARENT);
  for (const [x, y] of [[250, 400], [380, 400], [820, 400], [950, 400]])
    expect(await pixel(page, x, y), `${x},${y}`).toEqual([255, 0, 255, 255]);
});
