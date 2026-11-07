import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';

// "Gradient end: Transparent" must fade the drawing colour's own opacity
// (Photoshop's Foreground to Transparent). It previously faded toward
// transparent white, which canvas gradients interpolate un-premultiplied and
// so left a pale grey halo over dark documents.

const START = [0x2b, 0x3a, 0x8f];

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  // A small black document with an empty paint layer on top.
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('New document width (px)').fill('400');
  await dialog.getByLabel('New document height (px)').fill('200');
  await dialog.getByLabel('Background contents').selectOption('black');
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(canvas(page)).toHaveJSProperty('width', 400);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await selectTool(page, 'Gradient');
  await setColor(page, 'Drawing color', '#2b3a8f');
  await page.getByLabel('Gradient end', { exact: true }).selectOption('transparent');
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

async function at(page: Page, x: number, y: number) {
  return canvas(page).evaluate((element: HTMLCanvasElement, point) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + (point.x / element.width) * rect.width, y: rect.top + (point.y / element.height) * rect.height };
  }, { x, y });
}

async function drag(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await canvas(page).scrollIntoViewIfNeeded();
  const a = await at(page, x0, y0), b = await at(page, x1, y1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('footer')).toContainText('Gradient applied');
  await settled(page);
}

/** Composited pixels along row y, for x in [x0, x1]. */
const row = (page: Page, x0: number, x1: number, y: number) =>
  canvas(page).evaluate((element: HTMLCanvasElement, area) => {
    const data = element.getContext('2d')!.getImageData(area.x0, area.y, area.x1 - area.x0 + 1, 1).data;
    const pixels: number[][] = [];
    for (let index = 0; index < data.length; index += 4) pixels.push(Array.from(data.slice(index, index + 4)));
    return pixels;
  }, { x0, x1, y });

/** Over black, every ramp pixel must be a darker copy of the start colour. */
function expectStartHueOverBlack(pixel: number[], where: string) {
  expect(pixel[3], where).toBe(255);
  for (let channel = 0; channel < 3; channel += 1)
    expect(pixel[channel], `${where} channel ${channel}`).toBeLessThanOrEqual(START[channel] + 3);
  // Same hue: red/green stay proportional to blue (white drift raises them).
  expect(Math.abs(pixel[0] - pixel[2] * (START[0] / START[2])), `${where} red ratio`).toBeLessThanOrEqual(4);
  expect(Math.abs(pixel[1] - pixel[2] * (START[1] / START[2])), `${where} green ratio`).toBeLessThanOrEqual(4);
}

test('a linear colour→transparent gradient over black has no light fringe', async ({ page }) => {
  await drag(page, 0, 100, 399, 100);
  const pixels = await row(page, 0, 399, 100);
  pixels.forEach((pixel, x) => expectStartHueOverBlack(pixel, `x=${x}`));
  // Halfway is about half the start colour, not light grey (the old bug gave ~rgb(75, 78, 100)).
  const [r, g, b] = pixels[200];
  expect(r).toBeLessThan(32);
  expect(g).toBeLessThan(40);
  expect(b).toBeGreaterThan(50);
  expect(b).toBeLessThan(90);
  // The start is opaque drawing colour and the far end fades to the black document.
  expect(pixels[2].slice(0, 3).every((value, channel) => Math.abs(value - START[channel]) <= 4)).toBe(true);
  expect(Math.max(...pixels[398].slice(0, 3))).toBeLessThan(6);
});

test('a reversed transparent gradient fades in from the start hue', async ({ page }) => {
  await page.getByLabel('Reverse gradient', { exact: true }).check();
  await drag(page, 0, 100, 399, 100);
  const reversed = await row(page, 0, 399, 100);
  reversed.forEach((pixel, x) => expectStartHueOverBlack(pixel, `reversed x=${x}`));
  expect(Math.max(...reversed[2].slice(0, 3))).toBeLessThan(6);
  expect(reversed[397][2]).toBeGreaterThan(START[2] - 6);
  expect(reversed[200][0]).toBeLessThan(32);
});

test('a reflected transparent gradient fades its midpoint without a fringe', async ({ page }) => {
  await page.getByLabel('Gradient type', { exact: true }).selectOption('reflected');
  await drag(page, 0, 100, 399, 100);
  const reflected = await row(page, 0, 399, 100);
  reflected.forEach((pixel, x) => expectStartHueOverBlack(pixel, `reflected x=${x}`));
  // Quarter points are half-faded start colour; the midpoint is the black document.
  for (const x of [100, 300]) {
    expect(reflected[x][0], `x=${x}`).toBeLessThan(32);
    expect(reflected[x][2], `x=${x}`).toBeGreaterThan(50);
  }
  expect(Math.max(...reflected[200].slice(0, 3))).toBeLessThan(6);
});
