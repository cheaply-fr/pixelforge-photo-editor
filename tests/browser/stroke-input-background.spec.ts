import { selectTool } from './tool-selection';
import { test, expect, type Page } from '@playwright/test';

// A stroke made while the editor tab or the app's browser pane is hidden must
// commit the same pixels as the same stroke made while visible. A hidden page
// gets no (or rare) animation frames, and Chromium then delivers pointer input
// aligned to those frames: one pointermove per frame carrying every sample
// since the last one in getCoalescedEvents(). Each sample must reach the
// stroke; only the live preview may wait for a frame.

const WIDTH = 400;
const HEIGHT = 300;
const SAMPLES = 200;
// Samples per delivered event while hidden. 16 does not divide the 50-sample
// quarter period, so every peak of the curve falls inside a coalesced group.
const GROUP = 16;

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const footer = (page: Page) => page.locator('footer');
const settled = (page: Page) =>
  expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });

/** A dense two-period sine from x=40 to x=360 around y=150. */
const sinePath = (): Array<[number, number]> =>
  Array.from({ length: SAMPLES + 1 }, (_, index) => {
    const t = index / SAMPLES;
    return [40 + t * 320, 150 + 90 * Math.sin(t * Math.PI * 4)];
  });

/** Peaks and zero crossings of the curve, where a chord would miss. */
const curvePoints: Array<[number, number]> = [
  [80, 240], [160, 60], [240, 240], [320, 60], [120, 150], [200, 150], [280, 150],
];

async function openEditor(page: Page) {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  // Let a spec pause animation frames and report the page as hidden, as a
  // backgrounded tab or a hidden app pane does. Paused callbacks run when the
  // page becomes visible again.
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
}

/** Vertical stripes with a vertical ramp, so smudge and tonal tools change pixels. */
const fixture = (page: Page) =>
  page.evaluate(({ width, height }) => {
    const element = document.createElement('canvas');
    element.width = width;
    element.height = height;
    const context = element.getContext('2d')!;
    for (let x = 0; x < width; x += 8) {
      const band = (x / 8) % 3;
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, band === 0 ? '#c03040' : band === 1 ? '#3070c0' : '#60a040');
      gradient.addColorStop(1, band === 0 ? '#401018' : band === 1 ? '#a0c8f0' : '#203810');
      context.fillStyle = gradient;
      context.fillRect(x, 0, 8, height);
    }
    return element.toDataURL().split(',')[1];
  }, { width: WIDTH, height: HEIGHT });

async function importFixture(page: Page) {
  await page.getByTestId('file-input').setInputFiles({
    name: 'stripes.png',
    mimeType: 'image/png',
    buffer: Buffer.from(await fixture(page), 'base64'),
  });
  await expect(canvas(page)).toHaveAttribute('width', String(WIDTH));
  await settled(page);
}

async function setColor(page: Page, value: string) {
  await page.getByLabel('Drawing color', { exact: true }).evaluate((input: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

const snapshot = (page: Page) =>
  canvas(page).evaluate((element: HTMLCanvasElement) =>
    Array.from(element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data));

const pixels = (page: Page, points: Array<[number, number]>) =>
  canvas(page).evaluate(
    (element: HTMLCanvasElement, list) =>
      list.map(([x, y]) => Array.from(element.getContext('2d')!.getImageData(Math.round(x), Math.round(y), 1, 1).data)),
    points,
  );

/**
 * Dispatch the sine stroke. Visible: one pointermove per sample, four per
 * animation frame. Hidden: animation frames paused and the page hidden; the
 * samples arrive as one pointermove per GROUP samples whose
 * getCoalescedEvents() lists every sample, as Chromium delivers input aligned
 * to throttled frames. The release arrives while still hidden.
 */
async function stroke(page: Page, mode: 'visible' | 'hidden', pointerType: string) {
  await canvas(page).scrollIntoViewIfNeeded();
  const points = sinePath();
  const result = await canvas(page).evaluate(
    async (element: HTMLCanvasElement, { points, mode, pointerType, group }) => {
      element.setPointerCapture = () => undefined;
      const control = (window as unknown as { __frameControl: { hide(): void; frames: number } }).__frameControl;
      const rect = element.getBoundingClientRect();
      const client = ([x, y]: number[]) => ({
        clientX: rect.left + ((x + 0.5) / element.width) * rect.width,
        clientY: rect.top + ((y + 0.5) / element.height) * rect.height,
      });
      const common = { pointerId: 61, pointerType, pressure: 0.8, isPrimary: true, bubbles: true, buttons: 1 };
      const sample = (point: number[]) => new PointerEvent('pointermove', { ...common, ...client(point) });
      element.dispatchEvent(new PointerEvent('pointerdown', { ...common, button: 0, ...client(points[0]) }));
      // The layer decodes asynchronously; let it start before moving.
      await new Promise((resolve) => setTimeout(resolve, 150));
      let coalescedSupported = true;
      if (mode === 'visible') {
        for (let index = 1; index < points.length; index += 1) {
          element.dispatchEvent(sample(points[index]));
          if (index % 4 === 0) await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      } else {
        control.hide();
        const framesBefore = control.frames;
        for (let index = 1; index < points.length; index += group) {
          const batch = points.slice(index, index + group);
          const event = new PointerEvent('pointermove', {
            ...common,
            ...client(batch[batch.length - 1]),
            coalescedEvents: batch.map(sample),
          } as PointerEventInit);
          coalescedSupported &&= event.getCoalescedEvents().length === batch.length;
          element.dispatchEvent(event);
          // Background timers still run, just late; yield like a hidden tab.
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        if (control.frames !== framesBefore) throw new Error('an animation frame ran while hidden');
      }
      element.dispatchEvent(
        new PointerEvent('pointerup', { ...common, buttons: 0, button: 0, pressure: 0, ...client(points[points.length - 1]) }),
      );
      return { coalescedSupported };
    },
    { points, mode, pointerType, group: GROUP },
  );
  expect(result.coalescedSupported, 'PointerEventInit.coalescedEvents is supported').toBe(true);
}

async function show(page: Page) {
  await page.evaluate(() => (window as unknown as { __frameControl: { show(): void } }).__frameControl.show());
}

async function undo(page: Page) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await settled(page);
}

type ToolCase = {
  tool: string;
  notice: RegExp | string;
  /** Prepare the document and tool; runs once. */
  setup: (page: Page) => Promise<void>;
  /** Whether the stroke paints a recognisable color on the curve. */
  curveColor?: number[];
};

const brushSetup = (tool: string) => async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('New document width (px)').fill(String(WIDTH));
  await dialog.getByLabel('New document height (px)').fill(String(HEIGHT));
  await dialog.getByLabel('Background contents').selectOption('white');
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await settled(page);
  // A new (trimmed) paint layer also exercises the moves buffered while the
  // layer grows on the first press.
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await selectTool(page, tool);
  await page.getByLabel('Size', { exact: true }).fill('6');
  const hardness = page.getByLabel('Hardness', { exact: true });
  if (await hardness.count()) await hardness.fill('100');
  await setColor(page, '#ff0000');
};

const retouchSetup = (tool: string) => async (page: Page) => {
  await importFixture(page);
  await selectTool(page, tool);
  await page.getByLabel('Size', { exact: true }).fill('14');
};

const cases: ToolCase[] = [
  { tool: 'Brush', notice: 'Paint layer updated', setup: brushSetup('Brush'), curveColor: [255, 0, 0, 255] },
  { tool: 'Pencil', notice: 'Paint layer updated', setup: brushSetup('Pencil'), curveColor: [255, 0, 0, 255] },
  {
    tool: 'Eraser',
    notice: 'Paint layer updated',
    setup: async (page) => {
      await importFixture(page);
      await selectTool(page, 'Eraser');
      await page.getByLabel('Size', { exact: true }).fill('6');
      const hardness = page.getByLabel('Hardness', { exact: true });
      if (await hardness.count()) await hardness.fill('100');
    },
    curveColor: [0, 0, 0, 0],
  },
  { tool: 'Smudge', notice: 'Smudge stroke applied', setup: retouchSetup('Smudge') },
  { tool: 'Dodge', notice: 'Dodge stroke applied', setup: retouchSetup('Dodge') },
  { tool: 'Blur', notice: 'Blur stroke applied', setup: retouchSetup('Blur') },
  {
    tool: 'Clone',
    notice: 'Clone stroke applied',
    setup: async (page) => {
      await retouchSetup('Clone')(page);
      // Alt-click a source above the stroke.
      await canvas(page).evaluate((element: HTMLCanvasElement) => {
        element.setPointerCapture = () => undefined;
        const rect = element.getBoundingClientRect();
        const at = { clientX: rect.left + (20.5 / element.width) * rect.width, clientY: rect.top + (12.5 / element.height) * rect.height };
        const common = { pointerId: 60, pointerType: 'mouse', isPrimary: true, bubbles: true, altKey: true, button: 0 };
        element.dispatchEvent(new PointerEvent('pointerdown', { ...common, buttons: 1, pressure: 0.5, ...at }));
        element.dispatchEvent(new PointerEvent('pointerup', { ...common, buttons: 0, pressure: 0, ...at }));
      });
      await expect(footer(page)).toContainText('Clone source set');
    },
  },
];

test.beforeEach(async ({ page }) => openEditor(page));

for (const toolCase of cases) {
  test(`${toolCase.tool}: a stroke made while the page is hidden commits the same pixels as a visible one`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const pointerType = testInfo.project.name === 'mobile' ? 'touch' : 'mouse';
    await toolCase.setup(page);
    const before = await snapshot(page);

    await stroke(page, 'visible', pointerType);
    await expect(footer(page)).toContainText(toolCase.notice);
    await settled(page);
    const visible = await snapshot(page);
    expect(visible).not.toEqual(before);

    await undo(page);
    expect(await snapshot(page)).toEqual(before);

    // The stroke commits while the page is still hidden: the release must
    // apply every sample without waiting for an animation frame.
    await stroke(page, 'hidden', pointerType);
    await expect(footer(page)).toContainText(toolCase.notice);
    await settled(page);
    await show(page);
    await settled(page);
    const hidden = await snapshot(page);

    let differing = 0;
    for (let index = 0; index < visible.length; index += 4) {
      if (
        Math.abs(visible[index] - hidden[index]) > 2 ||
        Math.abs(visible[index + 1] - hidden[index + 1]) > 2 ||
        Math.abs(visible[index + 2] - hidden[index + 2]) > 2 ||
        Math.abs(visible[index + 3] - hidden[index + 3]) > 2
      )
        differing += 1;
    }
    expect(differing, 'pixels that differ between the visible and hidden strokes').toBe(0);

    if (toolCase.curveColor) {
      // The peaks and crossings of the curve are painted, not cut by chords.
      for (const [index, sample] of (await pixels(page, curvePoints)).entries())
        expect(sample, `curve point ${curvePoints[index].join(',')}`).toEqual(toolCase.curveColor);
    }
  });
}
