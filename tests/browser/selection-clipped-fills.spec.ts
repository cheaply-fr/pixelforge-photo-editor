import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';

// Photoshop confines Gradient and Paint Bucket edits to the active selection.
// Before this fix both tools repainted the whole layer.

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

async function setColor(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).evaluate((input: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** Client point for an image pixel. */
async function at(page: Page, x: number, y: number) {
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
  await expect(page.locator('footer')).toContainText(/selection/i);
}

async function drag(page: Page, x0: number, y0: number, x1: number, y1: number) {
  const a = await at(page, x0, y0), b = await at(page, x1, y1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
}

test('a linear gradient stays inside a rectangular selection and undo restores', async ({ page }) => {
  await selectRect(page, 300, 200, 900, 600);
  await selectTool(page, 'Gradient');
  await setColor(page, 'Drawing color', '#ff0000');
  await page.getByLabel('Gradient type', { exact: true }).selectOption('linear');
  await page.getByLabel('Gradient end', { exact: true }).selectOption('background');
  await setColor(page, 'Background color', '#0000ff');
  await drag(page, 100, 400, 1100, 400);
  await expect(page.locator('footer')).toContainText('Gradient applied');
  await settled(page);

  // Inside: opaque gradient colour. Outside: still transparent.
  const inside = await pixel(page, 600, 400);
  expect(inside[3]).toBe(255);
  expect(inside[0] + inside[2]).toBeGreaterThan(200);
  for (const [x, y] of [[100, 100], [1100, 700], [299, 400], [600, 199], [905, 400], [600, 605]])
    expect(await pixel(page, x, y), `${x},${y}`).toEqual([0, 0, 0, 0]);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await settled(page);
  expect(await pixel(page, 600, 400)).toEqual([0, 0, 0, 0]);
});

test('a feathered selection fades the gradient in at its edge', async ({ page }) => {
  await selectRect(page, 300, 200, 900, 600);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Feather…', exact: true }).click();
  await page.getByLabel('Selection feather radius (px)').fill('40');
  await page.getByRole('button', { name: 'Apply feather', exact: true }).click();
  await selectTool(page, 'Gradient');
  await setColor(page, 'Drawing color', '#00ff00');
  await page.getByLabel('Gradient end', { exact: true }).selectOption('background');
  await setColor(page, 'Background color', '#00ff00');
  await drag(page, 100, 400, 1100, 400);
  await settled(page);
  const centre = await pixel(page, 600, 400);
  const edge = await pixel(page, 300, 400);
  const far = await pixel(page, 150, 400);
  expect(centre[3]).toBe(255);
  // The edge is partially covered and keeps its colour (not darkened).
  expect(edge[3]).toBeGreaterThan(40);
  expect(edge[3]).toBeLessThan(220);
  expect(edge[1]).toBeGreaterThan(240);
  expect(far).toEqual([0, 0, 0, 0]);
});

test('the paint bucket fills only inside the selection and ignores clicks outside it', async ({ page }) => {
  await selectRect(page, 200, 150, 500, 450);
  await selectTool(page, 'Fill');
  await setColor(page, 'Drawing color', '#ffaa00');
  // Clicking outside the selection changes nothing.
  const outside = await at(page, 800, 600);
  await page.mouse.click(outside.x, outside.y);
  await expect(page.locator('footer')).toContainText('Click inside the selection to fill');
  expect(await pixel(page, 800, 600)).toEqual([0, 0, 0, 0]);
  // Clicking inside fills only the selected area of the contiguous region.
  const inside = await at(page, 350, 300);
  await page.mouse.click(inside.x, inside.y);
  await expect(page.locator('footer')).toContainText('Area filled');
  await settled(page);
  expect(await pixel(page, 350, 300)).toEqual([255, 170, 0, 255]);
  expect(await pixel(page, 600, 300)).toEqual([0, 0, 0, 0]);
  expect(await pixel(page, 350, 100)).toEqual([0, 0, 0, 0]);
});

test('without a selection the gradient still covers the whole layer', async ({ page }) => {
  await selectTool(page, 'Gradient');
  await setColor(page, 'Drawing color', '#ff0000');
  await page.getByLabel('Gradient end', { exact: true }).selectOption('background');
  await setColor(page, 'Background color', '#0000ff');
  await drag(page, 0, 400, 1200, 400);
  await settled(page);
  for (const [x, y] of [[5, 5], [600, 400], [1190, 790]]) expect((await pixel(page, x, y))[3], `${x},${y}`).toBe(255);
});
