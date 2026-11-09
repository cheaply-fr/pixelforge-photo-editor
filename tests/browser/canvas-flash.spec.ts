import { selectTool } from './tool-selection';
import { test, expect, type Page } from '@playwright/test';

// Clicking or painting on a large multi-layer document used to make the whole
// editor flash: every render (each coalesced stroke preview and the commit)
// set aria-busy on the editor shell, and the shell was dimmed to 50 % opacity
// while busy. These tests watch what actually reaches the screen during a
// stroke and a click: the canvas and every ancestor must stay fully opaque and
// visible, the canvas must never be resized or cleared, and pixels away from
// the stroke must never change.

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const SIZE = 1500;
const LAYERS = 8;
const canvas = (page: Page) => page.getByTestId('editor-canvas');
const settled = (page: Page) =>
  expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });

async function menu(page: Page, name: string, item: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

/** A worker-sized (≥ 2 MP) document with an opaque background and 8 paint layers. */
async function largeLayeredDocument(page: Page) {
  await menu(page, 'File', 'New…');
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('New document width (px)').fill(String(SIZE));
  await dialog.getByLabel('New document height (px)').fill(String(SIZE));
  await dialog.getByLabel('Background contents').selectOption('white');
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(canvas(page)).toHaveJSProperty('width', SIZE);
  await settled(page);
  for (let index = 0; index < LAYERS; index += 1) {
    await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
    await settled(page);
  }
  await expect(page.getByRole('button', { name: /^Select layer / })).toHaveCount(LAYERS + 1);
  await selectTool(page, 'Brush');
  await page.getByLabel('Size', { exact: true }).fill('30');
  await page.getByLabel('Drawing color', { exact: true }).evaluate((input: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '#ff0000');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settled(page);
  await canvas(page).scrollIntoViewIfNeeded();
}

/** Document points the stroke and click never touch. */
const PROBES: Array<[number, number]> = [
  [5, 5],
  [SIZE - 6, SIZE - 6],
  [SIZE - 6, 5],
  [5, SIZE - 6],
];

type ProbeReport = {
  samples: number;
  mutations: number;
  minOpacity: number;
  hiddenSamples: string[];
  resized: string[];
  changedPixels: string[];
  sawRendering: boolean;
};

/**
 * Watch the canvas on every animation frame and on every attribute change in
 * the editor: the effective opacity/visibility of the canvas (the product of
 * its own and every ancestor's computed opacity), its backing size, and the
 * pixels at the probe points.
 */
async function startProbe(page: Page) {
  await canvas(page).evaluate((element: HTMLCanvasElement, probes) => {
    const context = element.getContext('2d')!;
    const read = () =>
      probes.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data).join(','));
    const baseline = read();
    const size = `${element.width}x${element.height}`;
    const report = {
      samples: 0,
      mutations: 0,
      minOpacity: 1,
      hiddenSamples: [] as string[],
      resized: [] as string[],
      changedPixels: [] as string[],
      sawRendering: false,
      baseline,
    };
    const effective = (where: string) => {
      let opacity = 1;
      for (let node: Element | null = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        opacity *= Number(style.opacity);
        if (style.visibility !== 'visible' || style.display === 'none')
          report.hiddenSamples.push(`${where}: ${node.tagName} ${style.visibility} ${style.display}`);
      }
      report.minOpacity = Math.min(report.minOpacity, opacity);
      if (element.dataset.rendering === 'true') report.sawRendering = true;
      const now = `${element.width}x${element.height}`;
      if (now !== size) report.resized.push(`${where}: ${now}`);
    };
    const observer = new MutationObserver(() => {
      report.mutations += 1;
      effective('mutation');
    });
    observer.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['aria-busy', 'data-rendering', 'class', 'style', 'hidden'],
    });
    let running = true;
    const frame = () => {
      if (!running) return;
      report.samples += 1;
      effective('frame');
      const pixels = read();
      pixels.forEach((value, index) => {
        if (value !== baseline[index]) report.changedPixels.push(`${probes[index].join(',')}: ${value}`);
      });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    (window as unknown as { __flashProbe: unknown }).__flashProbe = {
      report,
      stop: () => {
        running = false;
        observer.disconnect();
        return report;
      },
    };
  }, PROBES);
}

const stopProbe = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __flashProbe: { stop: () => ProbeReport & { baseline: string[] } } })
        .__flashProbe.stop(),
  );

function expectNoFlash(report: ProbeReport & { baseline: string[] }) {
  // The background is opaque, so a cleared or partly drawn frame shows up here.
  for (const value of report.baseline) expect(value.endsWith(',255'), `opaque probe ${value}`).toBe(true);
  expect(report.samples).toBeGreaterThan(10);
  expect(report.minOpacity, 'effective canvas opacity').toBe(1);
  expect(report.hiddenSamples).toEqual([]);
  expect(report.resized).toEqual([]);
  expect(report.changedPixels).toEqual([]);
}

/** Dispatch a multi-move stroke, one move per animation frame, inside the document. */
async function stroke(page: Page, points: Array<[number, number]>) {
  await canvas(page).evaluate((element: HTMLCanvasElement) => {
    element.setPointerCapture = () => undefined;
  });
  return canvas(page).evaluate(async (element: HTMLCanvasElement, points) => {
    const rect = element.getBoundingClientRect();
    const client = ([x, y]: number[]) => ({
      clientX: rect.left + ((x + 0.5) / element.width) * rect.width,
      clientY: rect.top + ((y + 0.5) / element.height) * rect.height,
    });
    const common = { pointerId: 73, pointerType: 'mouse', pressure: 1, isPrimary: true, bubbles: true };
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    element.dispatchEvent(
      new PointerEvent('pointerdown', { ...common, buttons: 1, button: 0, ...client(points[0]) }),
    );
    for (const point of points.slice(1)) {
      await nextFrame();
      element.dispatchEvent(new PointerEvent('pointermove', { ...common, buttons: 1, ...client(point) }));
    }
    await nextFrame();
    element.dispatchEvent(
      new PointerEvent('pointerup', { ...common, buttons: 0, button: 0, ...client(points.at(-1)!) }),
    );
  }, points);
}

test('a multi-move brush stroke on a large layered document never dims, hides, resizes or clears the canvas', async ({ page }) => {
  test.setTimeout(240_000);
  await largeLayeredDocument(page);
  await startProbe(page);
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= 60; i += 1) points.push([400 + i * 12, 600 + Math.round(Math.sin(i / 6) * 120)]);
  await stroke(page, points);
  await expect(page.locator('footer')).toContainText('Paint layer updated', { timeout: 60_000 });
  await settled(page);
  // Keep sampling after release, across the commit render.
  await page.waitForTimeout(500);
  const report = await stopProbe(page);
  expect(report.sawRendering, 'the stroke rendered at least once while probed').toBe(true);
  expectNoFlash(report);
  // The stroke itself reached the canvas.
  const stamped = await canvas(page).evaluate(
    (element: HTMLCanvasElement) => Array.from(element.getContext('2d')!.getImageData(400, 600, 1, 1).data),
  );
  expect(stamped).toEqual([255, 0, 0, 255]);
});

test('a click (tap) on a large layered document never dims, hides, resizes or clears the canvas', async ({ page }) => {
  test.setTimeout(240_000);
  await largeLayeredDocument(page);
  await startProbe(page);
  const box = (await canvas(page).boundingBox())!;
  const position = { x: box.width * 0.5, y: box.height * 0.5 };
  if (test.info().project.name === 'mobile') await canvas(page).tap({ position });
  else await canvas(page).click({ position });
  await expect(page.locator('footer')).toContainText('Paint layer updated', { timeout: 60_000 });
  await settled(page);
  await page.waitForTimeout(500);
  const report = await stopProbe(page);
  expect(report.sawRendering, 'the click rendered at least once while probed').toBe(true);
  expectNoFlash(report);
  const dot = await canvas(page).evaluate(
    (element: HTMLCanvasElement) =>
      Array.from(element.getContext('2d')!.getImageData(element.width / 2, element.height / 2, 1, 1).data),
  );
  expect(dot).toEqual([255, 0, 0, 255]);
});
