import { selectTool } from './tool-selection';
import { test, expect, type Page } from '@playwright/test';

// Painting tools stamp every pointer event synchronously, but the full
// composite preview of a large document is coalesced to one render in flight
// and at most one per animation frame. Before this change each pointermove
// started (and cancelled) a full-document render, so a long high-rate stroke
// on a 10.8 MP document spent minutes rendering previews nobody could see.

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const WIDTH = 2646;
const HEIGHT = 4096;
const RED = [255, 0, 0, 255];
const TRANSPARENT = [0, 0, 0, 0];

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const footer = (page: Page) => page.locator('footer');
const settled = (page: Page) =>
  expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 30_000 });

async function newDocument(page: Page, width: number, height: number) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('New document width (px)').fill(String(width));
  await dialog.getByLabel('New document height (px)').fill(String(height));
  await dialog.getByLabel('Background contents').selectOption('transparent');
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(canvas(page)).toHaveJSProperty('width', width);
  await settled(page);
}

const composite = (page: Page, points: Array<[number, number]>) =>
  canvas(page).evaluate(
    (element: HTMLCanvasElement, list) =>
      list.map(([x, y]) => Array.from(element.getContext('2d')!.getImageData(x, y, 1, 1).data)),
    points,
  );

const renderStarts = (page: Page) =>
  page.evaluate(() => performance.getEntriesByName('pixelforge.render.start', 'mark').length);

/**
 * Press at the first document point, then deliver `points` as pointermoves in
 * bursts of `perFrame` events per animation frame (a 240 Hz pen on a 60 Hz
 * display delivers about four per frame). Returns the number of frames used.
 */
async function burstStroke(page: Page, points: Array<[number, number]>, perFrame: number) {
  await canvas(page).scrollIntoViewIfNeeded();
  await canvas(page).evaluate((element: HTMLCanvasElement) => {
    element.setPointerCapture = () => undefined;
  });
  const common = { pointerId: 91, pointerType: 'mouse', pressure: 1, isPrimary: true, bubbles: true };
  await canvas(page).evaluate(
    (element: HTMLCanvasElement, { point, common }) => {
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(
        new PointerEvent('pointerdown', {
          ...common,
          buttons: 1,
          button: 0,
          clientX: rect.left + ((point[0] + 0.5) / element.width) * rect.width,
          clientY: rect.top + ((point[1] + 0.5) / element.height) * rect.height,
        }),
      );
    },
    { point: points[0], common },
  );
  // The gesture buffer for a paint layer is prepared asynchronously.
  await page.waitForTimeout(250);
  await settled(page);
  return canvas(page).evaluate(
    async (element: HTMLCanvasElement, { points, perFrame, common }) => {
      const rect = element.getBoundingClientRect();
      const client = ([x, y]: number[]) => ({
        clientX: rect.left + ((x + 0.5) / element.width) * rect.width,
        clientY: rect.top + ((y + 0.5) / element.height) * rect.height,
      });
      let frames = 0;
      for (let index = 1; index < points.length; index += perFrame) {
        for (const point of points.slice(index, index + perFrame))
          element.dispatchEvent(
            new PointerEvent('pointermove', { ...common, buttons: 1, ...client(point) }),
          );
        frames += 1;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      element.dispatchEvent(
        new PointerEvent('pointerup', {
          ...common,
          buttons: 0,
          button: 0,
          ...client(points[points.length - 1]),
        }),
      );
      return frames;
    },
    { points, perFrame, common },
  );
}

test('a high-rate brush stroke on a 2646×4096 document renders a bounded number of previews and commits every stamp', async ({ page }) => {
  test.setTimeout(240_000);
  await newDocument(page, WIDTH, HEIGHT);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await selectTool(page, 'Brush');
  await page.getByLabel('Size', { exact: true }).fill('24');
  const hardness = page.getByLabel('Hardness', { exact: true });
  if (await hardness.count()) await hardness.fill('100');
  await page.getByLabel('Drawing color', { exact: true }).evaluate((input: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '#ff0000');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // An L-shaped stroke of 1,200 pointermoves: right along y=1000, then down x=2200.
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= 800; i++) points.push([200 + i * 2.5, 1000]);
  for (let i = 1; i <= 400; i++) points.push([2200, 1000 + i * 5]);

  const before = await renderStarts(page);
  const frames = await burstStroke(page, points, 6);
  await expect(footer(page)).toContainText('Paint layer updated', { timeout: 60_000 });
  await settled(page);
  const renders = (await renderStarts(page)) - before;
  // Without coalescing every pointermove started its own full render
  // (1,200 renders). Now at most one preview starts per frame, plus the commit.
  expect(frames).toBe(200);
  expect(renders).toBeGreaterThan(0);
  expect(renders).toBeLessThanOrEqual(frames + 2);
  expect(renders).toBeLessThan(points.length / 4);

  // Every stamp reached the committed pixels, including the final segment.
  const onStroke: Array<[number, number]> = [
    [200, 1000], [700, 1000], [1200, 1000], [1700, 1000], [2190, 1000],
    [2200, 1500], [2200, 2200], [2200, 2990], [2200, 3000],
  ];
  const offStroke: Array<[number, number]> = [[200, 1100], [1200, 900], [2300, 2000], [100, 3000]];
  const committed = await composite(page, [...onStroke, ...offStroke]);
  for (const [index, sample] of committed.slice(0, onStroke.length).entries())
    expect(sample, `on stroke ${onStroke[index].join(',')}`).toEqual(RED);
  for (const [index, sample] of committed.slice(onStroke.length).entries())
    expect(sample, `off stroke ${offStroke[index].join(',')}`).toEqual(TRANSPARENT);

  // No stale preview paints over the commit after it lands.
  await page.waitForTimeout(300);
  expect(await composite(page, [[2200, 3000]])).toEqual([RED]);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await settled(page);
  for (const sample of await composite(page, onStroke)) expect(sample).toEqual(TRANSPARENT);
  // A queued preview from the undone stroke never reappears.
  await page.waitForTimeout(300);
  expect(await composite(page, [[1200, 1000]])).toEqual([TRANSPARENT]);
});

test('a burst inside one frame renders one preview with the latest buffer and the stroke still commits', async ({ page }) => {
  test.setTimeout(120_000);
  await newDocument(page, 1200, 800);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await selectTool(page, 'Pencil');
  await page.getByLabel('Size', { exact: true }).fill('10');
  await page.getByLabel('Drawing color', { exact: true }).evaluate((input: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '#ff0000');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= 300; i++) points.push([100 + i * 3, 400]);
  const before = await renderStarts(page);
  // All 300 moves arrive within a single frame.
  const frames = await burstStroke(page, points, 1000);
  expect(frames).toBe(1);
  await expect(footer(page)).toContainText('Paint layer updated');
  await settled(page);
  // One coalesced preview (at most) plus the commit render.
  expect((await renderStarts(page)) - before).toBeLessThanOrEqual(3);
  for (const sample of await composite(page, [[100, 400], [550, 400], [1000, 400]]))
    expect(sample).toEqual(RED);
  expect(await composite(page, [[550, 500]])).toEqual([TRANSPARENT]);
});
