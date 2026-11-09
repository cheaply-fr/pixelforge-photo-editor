import { expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

// Shared helpers for the audit-retouch-*.spec.ts files (toolbar audit items
// I-16..I-23). Coordinates are image pixels of the default 1200×800 document.

export async function openEditor(page: Page) {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
}

export const canvas = (page: Page) => page.getByTestId('editor-canvas');
export const settled = (page: Page) => expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
export const footer = (page: Page) => page.locator('footer');
export const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');

export type Project = {
  settings: {
    retouchOptions?: Record<string, unknown>;
    imagePatterns?: Array<{ id: string; label: string; width: number; height: number }>;
    gradientMode?: string;
    [key: string]: unknown;
  };
  assets: Record<string, { w: number; h: number; url: string }>;
  history: Array<{
    active: string;
    layers: Array<{
      id: string;
      asset?: string;
      spotHealing?: Array<{ type?: string; selectionMask?: string }>;
      patchStrokes?: Array<{ region?: string; sourceOffset: { x: number; y: number }; selectionMask?: string }>;
    }>;
  }>;
  index: number;
};

export async function project(page: Page): Promise<Project> {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return (await downloadedProject((await (await pending).path())!)) as Project;
}

export async function setColor(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).evaluate((input: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** Client point for an image pixel (tool options sit below the canvas on phones). */
export async function at(page: Page, x: number, y: number) {
  await canvas(page).scrollIntoViewIfNeeded();
  return canvas(page).evaluate((element: HTMLCanvasElement, point) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + (point.x / element.width) * rect.width, y: rect.top + (point.y / element.height) * rect.height };
  }, { x, y });
}

export const pixel = (page: Page, x: number, y: number) =>
  canvas(page).evaluate((element: HTMLCanvasElement, point) =>
    Array.from(element.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data), { x, y });

export async function editMenu(page: Page, item: RegExp) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
  await settled(page);
}

export async function deselect(page: Page) {
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Deselect Ctrl\+D$/ }).click();
  await settled(page);
}

/** Mouse drag through image points. */
export async function drag(page: Page, points: Array<[number, number]>, steps = 8) {
  const first = await at(page, ...points[0]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const point of points.slice(1)) {
    const next = await at(page, ...point);
    await page.mouse.move(next.x, next.y, { steps });
  }
  await page.mouse.up();
  await settled(page);
}

export async function click(page: Page, x: number, y: number) {
  const point = await at(page, x, y);
  await page.mouse.click(point.x, point.y);
  await settled(page);
}

/** Option/Alt-click through dispatched pointer events (works on the mobile project too). */
export async function altClick(page: Page, x: number, y: number) {
  await canvas(page).scrollIntoViewIfNeeded();
  await canvas(page).evaluate((element: HTMLCanvasElement, point) => {
    element.setPointerCapture = () => undefined;
    const rect = element.getBoundingClientRect();
    for (const type of ['pointerdown', 'pointerup'])
      element.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true, pointerId: 41, pointerType: 'mouse', isPrimary: true,
        pressure: type === 'pointerdown' ? 0.5 : 0, buttons: type === 'pointerdown' ? 1 : 0, altKey: true,
        clientX: rect.left + (point.x / element.width) * rect.width,
        clientY: rect.top + (point.y / element.height) * rect.height,
      }));
  }, { x, y });
}

export async function selectRect(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await selectTool(page, 'Select');
  await drag(page, [[x0, y0], [x1, y1]], 5);
  await expect(footer(page)).toContainText(/selection/i);
}

export const RED = [255, 0, 0, 255];
export const BLUE = [0, 0, 255, 255];

/** A transparent document with one active paint layer. */
export async function transparentPaintLayer(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
}

/** Opaque blue paint layer with a red band through row 200 (`band` px tall). */
export async function blueLayerWithRedBand(page: Page, band = 80) {
  await transparentPaintLayer(page);
  await selectTool(page, 'Fill');
  await setColor(page, 'Drawing color', '#0000ff');
  await click(page, 600, 400);
  await expect(footer(page)).toContainText('Area filled');
  await selectTool(page, 'Brush');
  await page.getByLabel('Size', { exact: true }).fill(String(band));
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await setColor(page, 'Drawing color', '#ff0000');
  await drag(page, [[20, 200], [1180, 200]], 12);
  await expect(footer(page)).toContainText('Paint layer updated');
  expect(await pixel(page, 600, 200)).toEqual(RED);
}

/** Select a brush-like tool with full size/hardness/opacity. */
export async function brushTool(page: Page, label: string, size: number) {
  await selectTool(page, label);
  await page.getByLabel('Size', { exact: true }).fill(String(size));
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
}
