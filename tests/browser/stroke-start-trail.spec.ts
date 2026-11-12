import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';

// A new stroke starts where it was pressed. Moving the pointer between two
// strokes (button up) must never paint: with the Star field preset (wide
// scatter, several dabs per step) a leaked hover sample showed up as a long
// diagonal trail of dots from the previous stroke's end to the new start.
//
// When the page gets few animation frames (a hidden tab or app pane),
// Chromium delivers pointer input aligned to frames, and the first move after
// a press can list hover samples from before the press in
// getCoalescedEvents(). Those samples are not part of the stroke.

const W = 400;
const H = 300;
const canvas = (page: Page) => page.getByTestId('editor-canvas');
const footer = (page: Page) => page.locator('footer');
const settled = (page: Page) => expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 30_000 });

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

async function starFieldDocument(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('New document width (px)').fill(String(W));
  await dialog.getByLabel('New document height (px)').fill(String(H));
  await dialog.getByLabel('Background contents').selectOption('black');
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(canvas(page)).toHaveJSProperty('width', W);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await selectTool(page, 'Brush');
  await page.getByLabel('Drawing color', { exact: true }).evaluate((input: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '#ffffff');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.getByLabel('Saved brush preset', { exact: true }).selectOption({ label: 'Star field' });
  await expect(footer(page)).toContainText('Brush preset “Star field” applied');
  // The reported preset: Scatter in the 200–500% range, Count 3.
  await page.getByLabel('Scatter', { exact: true }).fill('400');
  await page.getByLabel('Count', { exact: true }).fill('3');
}

const clientAt = (page: Page, x: number, y: number) =>
  canvas(page).evaluate((element: HTMLCanvasElement, point) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + ((point.x + 0.5) / element.width) * rect.width, y: rect.top + ((point.y + 0.5) / element.height) * rect.height };
  }, { x, y });

/** Lit pixels inside a box well away from both strokes (dots reach 3 × size × scatter). */
const litBetween = (page: Page) =>
  canvas(page).evaluate((element: HTMLCanvasElement) => {
    const data = element.getContext('2d')!.getImageData(150, 110, 100, 80).data;
    let lit = 0;
    for (let index = 0; index < data.length; index += 4)
      if (Math.max(data[index], data[index + 1], data[index + 2]) > 40) lit += 1;
    return lit;
  });

const litTotal = (page: Page) =>
  canvas(page).evaluate((element: HTMLCanvasElement) => {
    const data = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    let lit = 0;
    for (let index = 0; index < data.length; index += 4)
      if (Math.max(data[index], data[index + 1], data[index + 2]) > 40) lit += 1;
    return lit;
  });

async function mouseStroke(page: Page, from: [number, number], to: [number, number]) {
  await canvas(page).scrollIntoViewIfNeeded();
  const a = await clientAt(page, ...from), b = await clientAt(page, ...to);
  await page.mouse.move(a.x, a.y, { steps: 6 });
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
  await expect(footer(page)).toContainText('Paint layer updated');
  await settled(page);
}

test('separate Star field strokes on two layers leave no dots between them', async ({ page }) => {
  await starFieldDocument(page);
  await canvas(page).scrollIntoViewIfNeeded();
  await mouseStroke(page, [30, 40], [110, 40]);
  const first = await litTotal(page);
  expect(first).toBeGreaterThan(10);
  // A different layer for the second stroke, as in the report.
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  // The pointer travels diagonally (button up) to the next start.
  await mouseStroke(page, [290, 260], [370, 260]);
  expect(await litTotal(page)).toBeGreaterThan(first);
  expect(await litBetween(page), 'no dots along the path between strokes').toBe(0);
});

test('hover samples coalesced into the first move after a press are not painted', async ({ page }) => {
  await starFieldDocument(page);
  await canvas(page).scrollIntoViewIfNeeded();
  await mouseStroke(page, [30, 40], [110, 40]);
  const first = await litTotal(page);
  const result = await canvas(page).evaluate(async (element: HTMLCanvasElement) => {
    element.setPointerCapture = () => undefined;
    const rect = element.getBoundingClientRect();
    const client = (x: number, y: number) => ({
      clientX: rect.left + ((x + 0.5) / element.width) * rect.width,
      clientY: rect.top + ((y + 0.5) / element.height) * rect.height,
    });
    const common = { pointerId: 1, pointerType: 'mouse', isPrimary: true, bubbles: true };
    // Hover path from the first stroke's end to the new start, recorded
    // before the press (button up), as a frame-starved page queues it.
    const hover = Array.from({ length: 16 }, (_, index) => {
      const t = index / 15;
      return new PointerEvent('pointermove', { ...common, buttons: 0, pressure: 0, ...client(110 + t * 180, 40 + t * 220) });
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    element.dispatchEvent(new PointerEvent('pointerdown', { ...common, button: 0, buttons: 1, pressure: 0.5, ...client(290, 260) }));
    await new Promise((resolve) => setTimeout(resolve, 150));
    const drag = Array.from({ length: 10 }, (_, index) =>
      new PointerEvent('pointermove', { ...common, buttons: 1, pressure: 0.5, ...client(290 + (index + 1) * 8, 260) }));
    // The first delivered move lists the stale hover samples, then its own.
    const firstMove = new PointerEvent('pointermove', {
      ...common, buttons: 1, pressure: 0.5, ...client(298, 260), coalescedEvents: [...hover, drag[0]],
    } as PointerEventInit);
    const supported = firstMove.getCoalescedEvents().length === hover.length + 1;
    element.dispatchEvent(firstMove);
    for (const move of drag.slice(1)) element.dispatchEvent(move);
    element.dispatchEvent(new PointerEvent('pointerup', { ...common, button: 0, buttons: 0, pressure: 0, ...client(370, 260) }));
    return { supported };
  });
  expect(result.supported, 'PointerEventInit.coalescedEvents is supported').toBe(true);
  await expect(footer(page)).toContainText('Paint layer updated');
  await settled(page);
  expect(await litTotal(page), 'the second stroke painted').toBeGreaterThan(first);
  expect(await litBetween(page), 'no dots along the hover path').toBe(0);
});
