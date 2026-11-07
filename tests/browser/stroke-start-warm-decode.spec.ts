import { selectTool } from './tool-selection';
import { test, expect, type Page } from '@playwright/test';

// A committed brush stroke keeps its decoded pixels warm: the next stroke on
// the same layer starts from them instead of decoding the PNG data URL the
// commit just produced, and the render worker receives the pixels with the
// commit render. Pixels, undo and redo must be exactly as before.

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  // Count main-thread PNG decodes of data URLs (the decoded-asset cache path).
  await page.addInitScript(() => {
    const scope = window as typeof window & { __pfDecodes?: number };
    scope.__pfDecodes = 0;
    const prototype = HTMLImageElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'decode')!;
    const decode = descriptor.value as (this: HTMLImageElement) => Promise<void>;
    Object.defineProperty(prototype, 'decode', {
      ...descriptor,
      value(this: HTMLImageElement) {
        if (this.src.startsWith('data:image/png')) scope.__pfDecodes! += 1;
        return decode.call(this);
      },
    });
  });
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const WIDTH = 2646;
const HEIGHT = 4096;
const WHITE = [255, 255, 255, 255];
const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const footer = (page: Page) => page.locator('footer');
const settled = (page: Page) =>
  expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });
const decodes = (page: Page) =>
  page.evaluate(() => (window as typeof window & { __pfDecodes?: number }).__pfDecodes ?? 0);

async function newDocument(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('New document width (px)').fill(String(WIDTH));
  await dialog.getByLabel('New document height (px)').fill(String(HEIGHT));
  await dialog.getByLabel('Background contents').selectOption('white');
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(canvas(page)).toHaveJSProperty('width', WIDTH);
  await settled(page);
}

async function setColor(page: Page, value: string) {
  await page.getByLabel('Drawing color', { exact: true }).evaluate((input: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** Horizontal stroke at document row y; resolves once the commit render settles. */
async function stroke(page: Page, pointerId: number, x0: number, x1: number, y: number) {
  await canvas(page).scrollIntoViewIfNeeded();
  await canvas(page).evaluate(
    async (element: HTMLCanvasElement, { pointerId, x0, x1, y }) => {
      element.setPointerCapture = () => undefined;
      const rect = element.getBoundingClientRect();
      const client = (x: number) => ({
        clientX: rect.left + ((x + 0.5) / element.width) * rect.width,
        clientY: rect.top + ((y + 0.5) / element.height) * rect.height,
      });
      const common = { pointerId, pointerType: 'mouse', pressure: 1, isPrimary: true, bubbles: true };
      element.dispatchEvent(new PointerEvent('pointerdown', { ...common, buttons: 1, button: 0, ...client(x0) }));
      for (let i = 1; i <= 24; i++) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        element.dispatchEvent(
          new PointerEvent('pointermove', { ...common, buttons: 1, ...client(x0 + ((x1 - x0) * i) / 24) }),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      element.dispatchEvent(new PointerEvent('pointerup', { ...common, buttons: 0, button: 0, ...client(x1) }));
    },
    { pointerId, x0, x1, y },
  );
  await settled(page);
}

const composite = (page: Page, points: Array<[number, number]>) =>
  canvas(page).evaluate(
    (element: HTMLCanvasElement, list) =>
      list.map(([x, y]) => Array.from(element.getContext('2d')!.getImageData(x, y, 1, 1).data)),
    points,
  );

async function menu(page: Page, name: string, item: RegExp) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
  await settled(page);
}

test('consecutive brush strokes on a 2646×4096 layer reuse warm pixels, with exact pixels, undo and redo', async ({ page }) => {
  test.setTimeout(180_000);
  await newDocument(page);
  await selectTool(page, 'Brush');
  await page.getByLabel('Size', { exact: true }).fill('30');
  const hardness = page.getByLabel('Hardness', { exact: true });
  if (await hardness.count()) await hardness.fill('100');

  await setColor(page, '#ff0000');
  await stroke(page, 31, 400, 2200, 1000);
  await expect(footer(page)).toContainText('Paint layer updated');
  expect(await composite(page, [[400, 1000], [1300, 1000], [2200, 1000], [1300, 1100]])).toEqual([
    RED, RED, RED, WHITE,
  ]);

  // The second stroke starts from the warm pixels of the first commit: no
  // main-thread PNG decode happens between the commit and the next stroke.
  const before = await decodes(page);
  await setColor(page, '#0000ff');
  await stroke(page, 32, 1300, 1300 + 1, 1000);
  await stroke(page, 33, 400, 2200, 2000);
  expect(await decodes(page)).toBe(before);
  // Both strokes are present: the warm source carried the first commit.
  expect(await composite(page, [[1300, 1000], [400, 1000], [1300, 2000], [2200, 2000], [1300, 2100]])).toEqual([
    BLUE, RED, BLUE, BLUE, WHITE,
  ]);

  // Undo/redo walk the same history as before (commits are unchanged).
  await menu(page, 'Edit', /^Undo/);
  expect(await composite(page, [[1300, 2000], [1300, 1000]])).toEqual([WHITE, BLUE]);
  await menu(page, 'Edit', /^Undo/);
  expect(await composite(page, [[1300, 1000], [400, 1000]])).toEqual([RED, RED]);
  await menu(page, 'Edit', /^Undo/);
  expect(await composite(page, [[400, 1000]])).toEqual([WHITE]);
  await menu(page, 'Edit', /^Redo/);
  await menu(page, 'Edit', /^Redo/);
  await menu(page, 'Edit', /^Redo/);
  expect(await composite(page, [[1300, 1000], [400, 1000], [1300, 2000]])).toEqual([BLUE, RED, BLUE]);

  // A stroke after undo starts from the restored state, not a stale warm copy.
  await menu(page, 'Edit', /^Undo/);
  await setColor(page, '#ff0000');
  await stroke(page, 34, 400, 2200, 3000);
  expect(await composite(page, [[1300, 3000], [1300, 2000], [1300, 1000]])).toEqual([RED, WHITE, BLUE]);
});
