import { expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

/** Shared helpers for specs that paint on a fresh document and read its pixels. */

export const WHITE = [255, 255, 255, 255];
export const canvas = (page: Page) => page.getByTestId('editor-canvas');
export const footer = (page: Page) => page.locator('footer');
export const settled = (page: Page, timeout = 60_000) =>
  expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout });

export async function openEditor(page: Page) {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
}

export async function newDocument(page: Page, width: number, height: number) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('New document width (px)').fill(String(width));
  await dialog.getByLabel('New document height (px)').fill(String(height));
  await dialog.getByLabel('Background contents').selectOption('white');
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(canvas(page)).toHaveJSProperty('width', width);
  await settled(page, 120_000);
}

export async function addPaintLayer(page: Page) {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
}

export async function setColor(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).evaluate((input: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** Set an <input type="color"> inside a dialog the way a picker would. */
export async function setInputColor(page: Page, locator: ReturnType<Page['getByLabel']>, value: string) {
  await locator.evaluate((input: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** RGBA of rendered document pixels (document coordinates). */
export async function pixels(page: Page, points: Array<[number, number]>) {
  await settled(page);
  return canvas(page).evaluate(
    (element: HTMLCanvasElement, list) =>
      list.map(([x, y]) => Array.from(element.getContext('2d')!.getImageData(x, y, 1, 1).data)),
    points,
  );
}

/** Every rendered pixel, for "nothing changed" checks. */
export async function snapshot(page: Page) {
  await settled(page);
  return canvas(page).evaluate((element: HTMLCanvasElement) =>
    Array.from(element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data).join(','),
  );
}

export async function menu(page: Page, name: string, item: string | RegExp) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', typeof item === 'string' ? { name: item, exact: true } : { name: item }).click();
}

export async function undo(page: Page) {
  await menu(page, 'Edit', /^Undo/);
  await settled(page);
}

type Point = { x: number; y: number };

/**
 * Dispatch a pointer gesture in document coordinates without yielding
 * between events (desktop and touch profiles alike).
 */
export async function gesture(page: Page, points: Point[], id = 5, kind = 'mouse') {
  await canvas(page).scrollIntoViewIfNeeded();
  await canvas(page).evaluate(
    (element: HTMLCanvasElement, { list, id, kind }) => {
      element.setPointerCapture = () => undefined;
      const rect = element.getBoundingClientRect();
      list.forEach((point, index) => {
        const type = index === 0 ? 'pointerdown' : index === list.length - 1 ? 'pointerup' : 'pointermove';
        const up = type === 'pointerup';
        element.dispatchEvent(new PointerEvent(type, {
          pointerId: id,
          pointerType: kind,
          isPrimary: true,
          bubbles: true,
          button: 0,
          buttons: up ? 0 : 1,
          pressure: up ? 0 : 0.5,
          clientX: rect.left + ((point.x + 0.5) / element.width) * rect.width,
          clientY: rect.top + ((point.y + 0.5) / element.height) * rect.height,
        }));
      });
    },
    { list: points, id, kind },
  );
}

/** A rectangular marquee from (x0, y0) to (x1, y1) in document pixels. */
export async function marquee(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await selectTool(page, 'Select');
  await gesture(page, [{ x: x0, y: y0 }, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, { x: x1, y: y1 }, { x: x1, y: y1 }]);
  await expect(footer(page)).toContainText(/selection/i);
  await settled(page);
}

/** A closed lasso polygon through `points` (document pixels). */
export async function lassoPath(page: Page, points: Point[], id = 9) {
  await gesture(page, [...points, points[0]], id);
}

/** The current history frame of a downloaded project file. */
export async function projectFrame(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  const value = await downloadedProject((await download.path())!);
  return value.history[value.index];
}

/** The marching-ants path, used to wait for a selection change to finish. */
export const outlinePath = (page: Page) =>
  page.evaluate(() => document.querySelector('.selection-outline-base')?.getAttribute('d') ?? '');
