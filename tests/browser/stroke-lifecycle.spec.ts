import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';

// Bugs found painting a large illustration on the live editor:
//  1. A stroke that crossed a hidden tab or app pane (visibilitychange, no
//     animation frames) stalled or came out corrupted.
//  2. The zoom sometimes reset to 1% on its own: a fit computed against a
//     stage with no size (hidden, or mid-layout) hit the 1% floor.
//  3. Separate dabs were joined by a straight line when a release was lost:
//     a mouse or pen keeps one pointerId, so the next press (and the hover
//     path before it) continued the previous stroke.

const W = 400;
const H = 300;
const canvas = (page: Page) => page.getByTestId('editor-canvas');
const footer = (page: Page) => page.locator('footer');
const zoomLevel = (page: Page) => page.getByTestId('zoom-level');
const settled = (page: Page) =>
  expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }));
  // Let a spec pause animation frames and report the page as hidden, as a
  // backgrounded tab or a hidden app pane does.
  await page.addInitScript(() => {
    const native = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    const paused = new Map<number, FrameRequestCallback>();
    let next = 1e9;
    let hidden = false;
    const control = {
      frames: 0,
      hide() {
        hidden = true;
        document.dispatchEvent(new Event('visibilitychange'));
      },
      show() {
        hidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
        const callbacks = [...paused.values()];
        paused.clear();
        for (const callback of callbacks) callback(performance.now());
      },
    };
    Object.defineProperty(window, '__frameControl', { value: control });
    Object.defineProperty(document, 'visibilityState', { get: () => (hidden ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { get: () => hidden });
    window.requestAnimationFrame = (callback) => {
      if (!hidden) return native((time) => {
        control.frames += 1;
        callback(time);
      });
      next += 1;
      paused.set(next, callback);
      return next;
    };
    window.cancelAnimationFrame = (handle) => {
      if (!paused.delete(handle)) nativeCancel(handle);
    };
  });
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

async function newDocument(page: Page, width: number, height: number, background = 'black') {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('New document width (px)').fill(String(width));
  await dialog.getByLabel('New document height (px)').fill(String(height));
  await dialog.getByLabel('Background contents').selectOption(background);
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

async function brushDocument(page: Page) {
  await newDocument(page, W, H);
  await expect(canvas(page)).toHaveJSProperty('width', W);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await selectTool(page, 'Brush');
  await page.getByLabel('Drawing color', { exact: true }).evaluate((input: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '#ffffff');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.getByLabel('Size', { exact: true }).fill('12');
  await canvas(page).scrollIntoViewIfNeeded();
  await canvas(page).evaluate((element: HTMLCanvasElement) => {
    element.setPointerCapture = () => undefined;
  });
}

/** Lit (non-black) pixels in a box of the displayed composite. */
const litIn = (page: Page, box: [number, number, number, number]) =>
  canvas(page).evaluate((element: HTMLCanvasElement, [x, y, w, h]) => {
    const data = element.getContext('2d')!.getImageData(x, y, w, h).data;
    let lit = 0;
    for (let index = 0; index < data.length; index += 4)
      if (Math.max(data[index], data[index + 1], data[index + 2]) > 40) lit += 1;
    return lit;
  }, box);

type Step = { type: 'down' | 'move' | 'up' | 'wait'; x?: number; y?: number; buttons?: number; ms?: number; coalesce?: Array<[number, number]> };

/** Dispatch a pointer script on the canvas in document coordinates. */
async function dispatch(page: Page, steps: Step[], pointerType: string) {
  await canvas(page).evaluate(
    async (element: HTMLCanvasElement, { steps, pointerType }) => {
      const rect = element.getBoundingClientRect();
      const client = (x: number, y: number) => ({
        clientX: rect.left + ((x + 0.5) / element.width) * rect.width,
        clientY: rect.top + ((y + 0.5) / element.height) * rect.height,
      });
      const common = { pointerId: 1, pointerType, isPrimary: true, bubbles: true };
      for (const step of steps) {
        if (step.type === 'wait') {
          await new Promise((resolve) => setTimeout(resolve, step.ms));
          continue;
        }
        const buttons = step.buttons ?? (step.type === 'up' ? 0 : 1);
        const init = { ...common, button: 0, buttons, pressure: buttons ? 0.6 : 0, ...client(step.x!, step.y!) };
        const coalescedEvents = step.coalesce?.map(([x, y]) =>
          new PointerEvent('pointermove', { ...init, ...client(x, y) }));
        element.dispatchEvent(new PointerEvent(`pointer${step.type}`, { ...init, coalescedEvents } as PointerEventInit));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    },
    { steps, pointerType },
  );
}

const frameControl = (page: Page, action: 'hide' | 'show') =>
  page.evaluate((name) => (window as unknown as { __frameControl: Record<string, () => void> }).__frameControl[name](), action);

test('a brush stroke that crosses a hidden tab commits every segment in order and finishes while hidden', async ({ page }, info) => {
  await brushDocument(page);
  const pointerType = info.project.name === 'mobile' ? 'pen' : 'mouse';
  const visible: Step[] = [{ type: 'down', x: 40, y: 150 }, { type: 'wait', ms: 150 }];
  for (let x = 50; x <= 140; x += 10) visible.push({ type: 'move', x, y: 150 });
  await dispatch(page, visible, pointerType);
  await frameControl(page, 'hide');
  // Hidden: one delivered move per group carries every sample in its
  // coalesced list, then the release arrives, all without a frame.
  const hidden: Step[] = [];
  for (let start = 150; start <= 360; start += 30) {
    const group: Array<[number, number]> = [];
    for (let x = start; x < start + 30 && x <= 360; x += 5) group.push([x, 150 + Math.round(60 * Math.sin((x - 150) / 40))]);
    const last = group[group.length - 1];
    hidden.push({ type: 'move', x: last[0], y: last[1], coalesce: group });
  }
  await dispatch(page, hidden, pointerType);
  // The live preview keeps up while hidden: it must not wait for a frame
  // that a hidden page never gets.
  await expect
    .poll(() => litIn(page, [297, 150 + Math.round(60 * Math.sin(150 / 40)) - 3, 7, 7]), {
      message: 'the hidden part of the stroke previews before release',
      timeout: 5_000,
    })
    .toBeGreaterThan(0);
  await dispatch(page, [{ type: 'up', x: 360, y: 150 + Math.round(60 * Math.sin(210 / 40)) }], pointerType);
  // The commit and its render do not wait for the page to be shown.
  await expect(footer(page)).toContainText('Paint layer updated', { timeout: 30_000 });
  await settled(page);
  await frameControl(page, 'show');
  await settled(page);
  // Every part of the path is painted: visible part, hidden curve peaks.
  for (const x of [45, 100, 140, 180, 220, 260, 300, 340]) {
    const y = x <= 140 ? 150 : 150 + Math.round(60 * Math.sin((x - 150) / 40));
    expect(await litIn(page, [x - 3, y - 3, 7, 7]), `stroke painted near ${x},${y}`).toBeGreaterThan(0);
  }
  // No chord across the curve, no jump towards the corners.
  expect(await litIn(page, [0, 0, W, 60]), 'nothing painted above the stroke').toBe(0);
  expect(await litIn(page, [200, 90, 30, 30]), 'no straight chord across the curve').toBe(0);
});

test('a lost release ends the dab: hover moves and the next press start nothing from it', async ({ page }, info) => {
  await brushDocument(page);
  const pointerType = info.project.name === 'mobile' ? 'pen' : 'mouse';
  // Dab A, then its pointerup never arrives; the pointer hovers (no button)
  // diagonally towards dab B.
  const hover: Step[] = [];
  for (let t = 1; t <= 10; t += 1) hover.push({ type: 'move', x: 60 + t * 24, y: 60 + t * 18, buttons: 0 });
  await dispatch(page, [{ type: 'down', x: 60, y: 60 }, { type: 'wait', ms: 150 }, { type: 'move', x: 63, y: 60 }, ...hover], pointerType);
  await expect(footer(page)).toContainText('Paint layer updated');
  await settled(page);
  // Dab B is pressed and released normally.
  await dispatch(page, [{ type: 'down', x: 300, y: 240 }, { type: 'wait', ms: 150 }, { type: 'up', x: 300, y: 240 }], pointerType);
  await settled(page);
  expect(await litIn(page, [52, 52, 18, 18]), 'dab A').toBeGreaterThan(0);
  expect(await litIn(page, [292, 232, 16, 16]), 'dab B').toBeGreaterThan(0);
  expect(await litIn(page, [110, 95, 150, 110]), 'nothing along the hover path between the dabs').toBe(0);
});

test('quick dabs whose releases are lost stay separate, each its own stroke', async ({ page }, info) => {
  await brushDocument(page);
  const pointerType = info.project.name === 'mobile' ? 'pen' : 'mouse';
  // Three presses of the same pointer at different spots with no pointerup
  // between them, then a final release: the browser dropped two releases.
  await dispatch(page, [
    { type: 'down', x: 50, y: 50 },
    { type: 'wait', ms: 120 },
    { type: 'down', x: 200, y: 150 },
    { type: 'wait', ms: 120 },
    { type: 'down', x: 350, y: 250 },
    { type: 'wait', ms: 120 },
    { type: 'up', x: 350, y: 250 },
  ], pointerType);
  await settled(page);
  await expect(footer(page)).toContainText('Paint layer updated');
  for (const [x, y] of [[50, 50], [200, 150], [350, 250]])
    expect(await litIn(page, [x - 8, y - 8, 16, 16]), `dab at ${x},${y}`).toBeGreaterThan(0);
  // The diagonal between the dabs stays empty.
  expect(await litIn(page, [100, 75, 50, 40]), 'no line from dab 1 to dab 2').toBe(0);
  expect(await litIn(page, [250, 175, 50, 40]), 'no line from dab 2 to dab 3').toBe(0);
  // Each dab is its own undoable stroke.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await settled(page);
  expect(await litIn(page, [342, 242, 16, 16]), 'undo removes only the last dab').toBe(0);
  expect(await litIn(page, [192, 142, 16, 16]), 'the middle dab is kept').toBeGreaterThan(0);
});

/** Collapse the stage to 0×0, as a hidden pane or mid-layout resize reports. */
const collapseStage = (page: Page, collapsed: boolean) =>
  page.locator('section.stage').evaluate((element: HTMLElement, value) => {
    element.style.display = value ? 'none' : '';
  }, collapsed);

test('Fit on a zero-size stage keeps the zoom instead of resetting it to 1%', async ({ page }) => {
  await newDocument(page, 3000, 4000, 'white');
  await expect(canvas(page)).toHaveJSProperty('width', 3000);
  await settled(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('0');
  const fitted = await zoomLevel(page).textContent();
  expect(fitted).not.toBe('1%');
  await page.keyboard.press('1');
  await expect(zoomLevel(page)).toHaveText('100%');
  await collapseStage(page, true);
  await page.keyboard.press('0');
  await page.waitForTimeout(100);
  await expect(zoomLevel(page), 'the zoom is kept while the stage has no size').toHaveText('100%');
  await collapseStage(page, false);
  await page.keyboard.press('0');
  await expect(zoomLevel(page)).toHaveText(fitted!);
});

test('a document opened while the stage has no size is fitted once the stage is measurable', async ({ page }) => {
  await newDocument(page, W, H);
  await settled(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('1');
  await expect(zoomLevel(page)).toHaveText('100%');
  await collapseStage(page, true);
  await newDocument(page, 3000, 4000, 'white');
  await expect(canvas(page)).toHaveJSProperty('width', 3000);
  await expect(zoomLevel(page)).not.toHaveText('1%');
  await expect(zoomLevel(page)).toHaveText('100%');
  await collapseStage(page, false);
  // The deferred fit runs when the stage gets its size back.
  await expect(zoomLevel(page)).not.toHaveText('100%');
  const deferred = await zoomLevel(page).textContent();
  expect(deferred).not.toBe('1%');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('0');
  await expect(zoomLevel(page)).toHaveText(deferred!);
});
