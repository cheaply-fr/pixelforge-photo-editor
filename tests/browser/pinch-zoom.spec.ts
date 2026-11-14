import { test, expect, type CDPSession, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';
import { closePanels, openPanel, openPropertiesSheet } from './sidebar-panels';

/*
 * Two-finger pinch zoom/pan on the canvas and the Move tool's touch
 * long-press (select layer at point), driven by real touch input.
 *
 * Touches are injected with the Chrome DevTools Protocol
 * (Input.dispatchTouchEvent), which goes through Chromium's input pipeline
 * like a touch screen: the page receives trusted pointerdown/move/up events
 * with pointerType "touch", implicit pointer capture, isPrimary and the
 * browser's own gesture handling (touch-action, long-press contextmenu). The
 * desktop project runs with `hasTouch` as a touchscreen laptop would; the
 * mobile project is Playwright's Pixel 7 profile. Neither is a real phone:
 * see docs/view-zoom-contract.md for what remains unverified.
 */

test.use({ hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

type Point = { x: number; y: number };

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const level = (page: Page) => page.getByTestId('zoom-level');
const settled = (page: Page) =>
  expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });
const pixels = (page: Page) => canvas(page).evaluate((element: HTMLCanvasElement) => element.toDataURL());
const activeRowName = (page: Page) => page.locator('button.layer-row.selected').getAttribute('aria-label');
const rows = (page: Page) => page.getByRole('button', { name: /^Select layer / });

async function viewZoom(page: Page) {
  return Number(await page.getByTestId('canvas-wrap').getAttribute('data-view-zoom'));
}

/** Image pixel under a client point, from the canvas's on-screen box. */
async function imagePointAt(page: Page, point: Point) {
  return canvas(page).evaluate((element: HTMLCanvasElement, at) => {
    const rect = element.getBoundingClientRect();
    return {
      x: ((at.x - rect.left) / rect.width) * element.width,
      y: ((at.y - rect.top) / rect.height) * element.height,
    };
  }, point);
}

/** Collapse the phone properties sheet so the canvas is under the finger. */
async function collapseSheet(page: Page) {
  const handle = page.locator('.inspector-sheet-handle');
  if ((await handle.isVisible()) && (await handle.getAttribute('aria-expanded')) === 'true') await handle.click();
}

/** The History panel's position, e.g. "2 / 2": changes with every history step. */
async function historyPosition(page: Page) {
  await openPanel(page, 'History');
  const position = await page.getByLabel('History position', { exact: true }).textContent();
  await closePanels(page);
  await collapseSheet(page);
  return position;
}

/** Visible part of the stage, in client pixels. */
async function stageArea(page: Page) {
  const box = (await page.locator('.stage').boundingBox())!;
  const viewport = page.viewportSize()!;
  const top = Math.max(box.y, 0), bottom = Math.min(box.y + box.height, viewport.height);
  return { left: box.x, right: box.x + box.width, top, bottom };
}

/** Scroll the stage so the image's centre is in the middle of the visible stage. */
async function centreStage(page: Page) {
  await page.locator('.stage').evaluate((element) =>
    element.scrollTo((element.scrollWidth - element.clientWidth) / 2, (element.scrollHeight - element.clientHeight) / 2),
  );
}

/** Raw multi-touch through CDP. Each call lists every finger still down. */
class Touch {
  private constructor(private readonly cdp: CDPSession) {}
  static async open(page: Page) {
    return new Touch(await page.context().newCDPSession(page));
  }
  private send(type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: Array<Point & { id: number }>) {
    return this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((point) => ({ x: point.x, y: point.y, id: point.id, radiusX: 4, radiusY: 4, force: 1 })),
    });
  }
  start(points: Array<Point & { id: number }>) {
    return this.send('touchStart', points);
  }
  move(points: Array<Point & { id: number }>) {
    return this.send('touchMove', points);
  }
  /** Lift the listed fingers; with none listed, every finger lifts. */
  end(lifted: Array<Point & { id: number }> = []) {
    return this.send('touchEnd', lifted);
  }
  detach() {
    return this.cdp.detach();
  }
}

/**
 * Two fingers placed `fromGap` apart around `centre`, moved in `steps` to
 * `toGap` apart around `centre + pan`, then lifted.
 */
async function pinch(
  page: Page,
  centre: Point,
  fromGap: number,
  toGap: number,
  options: { pan?: Point; steps?: number; angle?: number } = {},
) {
  const touch = await Touch.open(page);
  const steps = options.steps ?? 10, pan = options.pan ?? { x: 0, y: 0 }, angle = options.angle ?? 0;
  const fingers = (t: number) => {
    const gap = fromGap + (toGap - fromGap) * t,
      cx = centre.x + pan.x * t,
      cy = centre.y + pan.y * t,
      dx = (Math.cos(angle) * gap) / 2,
      dy = (Math.sin(angle) * gap) / 2;
    return [
      { id: 1, x: cx - dx, y: cy - dy },
      { id: 2, x: cx + dx, y: cy + dy },
    ];
  };
  const [a] = fingers(0);
  await touch.start([a]);
  await touch.start(fingers(0));
  for (let step = 1; step <= steps; step += 1) {
    await touch.move(fingers(step / steps));
    // One sample per frame, like a real panel.
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  await touch.end();
  await touch.detach();
  return { centre: { x: centre.x + pan.x, y: centre.y + pan.y } };
}

test('a two-finger spread zooms in about the midpoint and a pinch zooms out', async ({ page }) => {
  // At 100% the 1200×800 document overflows the stage on desktop and mobile,
  // so the stage can scroll to keep the anchored point in place.
  await page.keyboard.press('1');
  await expect(level(page)).toHaveText('100%');
  await centreStage(page);
  const area = await stageArea(page);
  const centre = { x: area.left + (area.right - area.left) * 0.55, y: area.top + (area.bottom - area.top) * 0.45 };
  const before = await imagePointAt(page, centre);
  const historyBefore = await historyPosition(page);

  // Spread 80 → 200 CSS px: 2.5× the zoom.
  await pinch(page, centre, 80, 200);
  await expect.poll(() => viewZoom(page)).toBeGreaterThan(240);
  expect(await viewZoom(page)).toBeLessThan(260);
  // The readout follows the zoom.
  await expect(level(page)).toHaveText(/^25\d(\.\d+)?%$/);
  await expect(page.locator('footer')).toContainText(/Pinch zoom: 25\d/);
  let after = await imagePointAt(page, centre);
  expect(Math.abs(after.x - before.x)).toBeLessThan(2);
  expect(Math.abs(after.y - before.y)).toBeLessThan(2);

  // Pinch 200 → 80 returns to (about) 100% around the same point.
  await pinch(page, centre, 200, 80);
  await expect.poll(() => viewZoom(page)).toBeLessThan(105);
  expect(await viewZoom(page)).toBeGreaterThan(95);
  after = await imagePointAt(page, centre);
  expect(Math.abs(after.x - before.x)).toBeLessThan(3);
  expect(Math.abs(after.y - before.y)).toBeLessThan(3);

  // Gestures change the view only: no history step, no pixels.
  expect(await historyPosition(page)).toEqual(historyBefore);
});

test('two fingers moved together pan the view, keeping the image point under them', async ({ page }) => {
  await page.keyboard.press('1');
  await page.keyboard.press('+');
  await expect(level(page)).toHaveText('150%');
  await centreStage(page);
  const area = await stageArea(page);
  const centre = { x: (area.left + area.right) / 2, y: (area.top + area.bottom) / 2 };
  const before = await imagePointAt(page, centre);
  const scrollBefore = await page.locator('.stage').evaluate((element) => [element.scrollLeft, element.scrollTop]);
  // A pan with a slight spread, at an angle.
  const { centre: end } = await pinch(page, centre, 120, 150, { pan: { x: -50, y: -40 }, angle: Math.PI / 5 });
  await expect.poll(() => viewZoom(page)).toBeGreaterThan(180);
  const after = await imagePointAt(page, end);
  expect(Math.abs(after.x - before.x)).toBeLessThan(2);
  expect(Math.abs(after.y - before.y)).toBeLessThan(2);
  const scrollAfter = await page.locator('.stage').evaluate((element) => [element.scrollLeft, element.scrollTop]);
  expect(scrollAfter).not.toEqual(scrollBefore);
});

test('pinch zoom clamps to the editor zoom range', async ({ page }) => {
  await page.keyboard.press('1');
  await centreStage(page);
  const area = await stageArea(page);
  const centre = { x: (area.left + area.right) / 2, y: (area.top + area.bottom) / 2 };
  // Fingers stay inside the stage (narrow on a phone): a 10× spread each time.
  const wide = Math.min(area.right - area.left, area.bottom - area.top) * 0.8, narrow = wide / 10;
  // Repeated wide spreads stop at 3200%.
  for (let index = 0; index < 4; index += 1) await pinch(page, centre, narrow, wide, { steps: 6 });
  await expect(level(page)).toHaveText('3200%');
  for (let index = 0; index < 5; index += 1) await pinch(page, centre, wide, narrow, { steps: 6 });
  await expect(level(page)).toHaveText('1%');
});

test('a second finger cancels a one-finger brush stroke without pixels or history', async ({ page }) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await selectTool(page, 'Brush');
  await settled(page);
  const box = (await canvas(page).boundingBox())!;
  const viewport = page.viewportSize()!;
  const top = Math.max(box.y, 0) + 20, bottom = Math.min(box.y + box.height, viewport.height) - 20;
  const y = (top + bottom) / 2;
  const x = (t: number) => box.x + 20 + (box.width - 40) * t;
  const original = await pixels(page);
  const historyBefore = await historyPosition(page);
  const zoomBefore = await viewZoom(page);

  // One finger paints part of a stroke, then a second finger lands.
  const touch = await Touch.open(page);
  await touch.start([{ id: 1, x: x(0.2), y }]);
  for (let step = 1; step <= 8; step += 1) await touch.move([{ id: 1, x: x(0.2 + step * 0.03), y }]);
  // The stroke is live on screen before the second finger arrives.
  await expect.poll(() => pixels(page)).not.toBe(original);
  const first = { id: 1, x: x(0.44), y };
  await touch.start([first, { id: 2, x: x(0.6), y: y + 30 }]);
  // Both fingers move without changing their distance: a pure two-finger pan.
  for (let step = 1; step <= 4; step += 1)
    await touch.move([{ id: 1, x: x(0.44), y: y - step * 4 }, { id: 2, x: x(0.6), y: y + 30 - step * 4 }]);
  // The live stroke is gone as soon as the pinch starts, fingers still down.
  await expect.poll(() => pixels(page)).toBe(original);
  // Lift the second finger (CDP's touchEnd lists the contacts that lift);
  // the first one keeps moving: it must not paint.
  await touch.end([{ id: 2, x: x(0.6), y: y + 14 }]);
  for (let step = 1; step <= 6; step += 1) await touch.move([{ id: 1, x: x(0.44 + step * 0.04), y: y - 16 }]);
  await touch.end();
  await touch.detach();
  await settled(page);

  expect(await pixels(page)).toBe(original);
  expect(await historyPosition(page)).toEqual(historyBefore);
  expect(Math.abs((await viewZoom(page)) - zoomBefore)).toBeLessThan(1);

  // A normal one-finger stroke paints and records one history step afterwards.
  const again = await Touch.open(page);
  await again.start([{ id: 3, x: x(0.2), y: y + 10 }]);
  for (let step = 1; step <= 10; step += 1) await again.move([{ id: 3, x: x(0.2 + step * 0.05), y: y + 10 }]);
  await again.end();
  await again.detach();
  await settled(page);
  expect(await pixels(page)).not.toBe(original);
  expect(await historyPosition(page)).not.toBe(historyBefore);
});

test('touch on the canvas never zooms or scrolls the page and shows no callout', async ({ page }) => {
  const style = await canvas(page).evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      touchAction: computed.touchAction,
      userSelect: computed.userSelect || computed.getPropertyValue('-webkit-user-select'),
      callout: computed.getPropertyValue('-webkit-touch-callout'),
    };
  });
  expect(style.touchAction).toBe('none');
  expect(style.userSelect).toBe('none');
  // -webkit-touch-callout is WebKit-only; Chromium may not report it.
  if (style.callout) expect(style.callout).toBe('none');
  // Around the image the stage still scrolls with one finger but never pinch-zooms the page.
  expect(await page.locator('.stage').evaluate((element) => getComputedStyle(element).touchAction)).toBe('pan-x pan-y');
  // Panels elsewhere keep their default touch behaviour.
  await page.keyboard.press('1');
  await centreStage(page);
  const area = await stageArea(page);
  const centre = { x: (area.left + area.right) / 2, y: (area.top + area.bottom) / 2 };
  await pinch(page, centre, 60, 180);
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
});

test.describe('Move tool touch long-press', () => {
  test.skip(({ isMobile }) => !isMobile, 'Touch long-press runs on the mobile (Pixel 7) project');

  /** Paint a stroke on a new layer, then select the Background and the Move tool. */
  async function setup(page: Page) {
    await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
    await settled(page);
    await selectTool(page, 'Brush');
    await collapseSheet(page);
    const blank = await pixels(page);
    const box = (await canvas(page).boundingBox())!;
    const viewport = page.viewportSize()!;
    const top = Math.max(box.y, 0) + 8, bottom = Math.min(box.y + box.height, viewport.height) - 8;
    const at = (fx: number, fy: number) => ({
      x: box.x + 8 + (box.width - 16) * fx,
      y: top + (bottom - top) * fy,
    });
    const touch = await Touch.open(page);
    await touch.start([{ id: 1, ...at(0.1, 0.5) }]);
    for (let step = 1; step <= 10; step += 1) await touch.move([{ id: 1, ...at(0.1 + step * 0.04, 0.5) }]);
    await touch.end();
    await touch.detach();
    await settled(page);
    expect(await pixels(page)).not.toBe(blank);
    const painted = await activeRowName(page);
    await openPropertiesSheet(page);
    await rows(page).last().click();
    await settled(page);
    const background = await activeRowName(page);
    expect(background).not.toBe(painted);
    await selectTool(page, 'Move');
    await collapseSheet(page);
    for (const point of [at(0.3, 0.5), at(0.8, 0.15)])
      expect(await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.getAttribute('data-testid'), point)).toBe('editor-canvas');
    // Record every contextmenu the browser fires and whether it was handled.
    await page.evaluate(() => {
      const log: boolean[] = [];
      (window as unknown as { contextMenus: boolean[] }).contextMenus = log;
      window.addEventListener('contextmenu', (event) => log.push(event.defaultPrevented));
    });
    return { painted, background, onStroke: at(0.3, 0.5), offStroke: at(0.8, 0.15) };
  }

  const contextMenus = (page: Page) =>
    page.evaluate(() => (window as unknown as { contextMenus: boolean[] }).contextMenus.slice());

  async function press(page: Page, at: Point, holdMs: number, path: Point[] = []) {
    const touch = await Touch.open(page);
    await touch.start([{ id: 1, ...at }]);
    for (const point of path) await touch.move([{ id: 1, ...point }]);
    await page.waitForTimeout(holdMs);
    await touch.end();
    await touch.detach();
  }

  test('a long-press selects the layer under the finger without moving it', async ({ page }) => {
    const { painted, background, onStroke, offStroke } = await setup(page);
    const before = await pixels(page);
    const historyBefore = await historyPosition(page);
    await press(page, onStroke, 800);
    await expect.poll(() => activeRowName(page)).toBe(painted);
    await expect(page.locator('footer')).toContainText(`Selected layer ${painted?.replace(/^Select layer /, '') ?? ''}`.trim());
    await settled(page);
    expect(await pixels(page)).toBe(before);
    // Any contextmenu the browser fired for the long-press was cancelled, so
    // no native menu or callout covered the canvas.
    expect((await contextMenus(page)).every(Boolean)).toBe(true);
    // Away from the stroke only the Background has pixels.
    await press(page, offStroke, 800);
    await expect.poll(() => activeRowName(page)).toBe(background);
    expect(await pixels(page)).toBe(before);
    expect((await contextMenus(page)).every(Boolean)).toBe(true);
    // Selecting a layer is not an undoable document edit here, and nothing moved.
    expect(await historyPosition(page)).toBe(historyBefore);
  });

  test('a short tap does not pick a layer', async ({ page }) => {
    const { background, onStroke } = await setup(page);
    const before = await pixels(page);
    await press(page, onStroke, 120);
    // Wait past the long-press time: nothing fires late.
    await page.waitForTimeout(700);
    expect(await activeRowName(page)).toBe(background);
    expect(await pixels(page)).toBe(before);
    expect(await contextMenus(page)).toEqual([]);
  });

  test('moving beyond the slop cancels the long-press', async ({ page }) => {
    const { background, onStroke } = await setup(page);
    // Travel 40 px (well beyond the 10 px slop), then hold still on the stroke.
    const start = { x: onStroke.x - 40, y: onStroke.y };
    const path = [1, 2, 3, 4].map((step) => ({ x: start.x + step * 10, y: start.y }));
    await press(page, start, 900, path);
    await page.waitForTimeout(200);
    expect(await activeRowName(page)).toBe(background);
    expect((await contextMenus(page)).every(Boolean)).toBe(true);
  });

  test('finger jitter within the slop neither nudges the layer nor stops the long-press', async ({ page }) => {
    const { painted, background, onStroke, offStroke } = await setup(page);
    // Make the painted layer active, then long-press off the stroke with a
    // few pixels of jitter: the Background is picked and nothing moves.
    await press(page, onStroke, 800);
    await expect.poll(() => activeRowName(page)).toBe(painted);
    await settled(page);
    const before = await pixels(page);
    const jitter = [
      { x: offStroke.x + 3, y: offStroke.y },
      { x: offStroke.x + 3, y: offStroke.y + 4 },
      { x: offStroke.x - 2, y: offStroke.y + 2 },
    ];
    await press(page, offStroke, 800, jitter);
    await expect.poll(() => activeRowName(page)).toBe(background);
    await settled(page);
    expect(await pixels(page)).toBe(before);
  });
});
