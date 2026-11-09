import { test, expect, type Locator, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { compileCurves, type Curves } from '../../src/curves';

// Multi-point Curves editing: add, drag and remove control points with mouse,
// touch and keyboard, one history entry per drag, and pixels that follow the
// stored curve through undo, redo and reload.

type Project = {
  history: Array<{
    layers: Array<{ asset?: string; adjustments?: { curves?: Curves } }>;
  }>;
  index: number;
};

const prepare = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );
};

async function project(page: Page): Promise<Project> {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return (await downloadedProject((await download.path())!)) as Project;
}

const storedCurves = async (page: Page) => {
  const saved = await project(page);
  return saved.history[saved.index].layers.at(-1)!.adjustments!.curves!;
};

async function setColor(page: Page, value: string) {
  await page.getByLabel('Drawing color', { exact: true }).evaluate((input, next) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    const setter = Reflect.get(descriptor ?? {}, 'set') as
      | ((this: HTMLInputElement, value: string) => void)
      | undefined;
    if (!setter) throw new Error('color input setter unavailable');
    Reflect.apply(setter, input, [next as string]);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** A mid-grey paint layer so the RGB curve output at input 128 is visible. */
async function greyLayer(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await setColor(page, '#808080');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Fill/ }).click();
  await page.getByRole('dialog', { name: 'Fill' }).getByRole('button', { name: 'Fill', exact: true }).click();
  await expect.poll(() => pixel(page)).toEqual([128, 128, 128, 255]);
}

const pixel = (page: Page) =>
  page
    .getByTestId('editor-canvas')
    .evaluate((node: HTMLCanvasElement) =>
      Array.from(node.getContext('2d')!.getImageData(600, 400, 1, 1).data),
    );

/** The value input 128 maps to under the stored curves, red channel. */
const expectedGrey = (curves: Curves) => compileCurves(curves)[0][128];

const editor = (page: Page) => page.getByRole('group', { name: 'RGB curve editor' });
const graph = (page: Page) => page.getByTestId('rgb-curve-graph');
const pointCount = async (page: Page) =>
  Number(await editor(page).getAttribute('data-point-count'));

async function openCurves(page: Page) {
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Curves…', exact: true }).click();
  await graph(page).scrollIntoViewIfNeeded();
  await expect(graph(page)).toBeVisible();
}

/** Viewport position of a curve coordinate inside the graph. */
async function at(target: Locator, input: number, output: number) {
  // Menus and project downloads can scroll the mobile sidebar; keep the graph
  // inside the viewport so touches reach it.
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  return {
    x: box.x + (input / 255) * box.width,
    y: box.y + (1 - output / 255) * box.height,
  };
}

const isTouch = (page: Page) =>
  page.evaluate(() => matchMedia('(pointer: coarse)').matches);

/** Tap (touch projects) or click (desktop) one curve coordinate. */
async function press(page: Page, input: number, output: number) {
  const point = await at(graph(page), input, output);
  if (await isTouch(page)) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

/** Drag from one viewport point to another with touch or mouse. */
async function dragBetween(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const steps = 8;
  if (await isTouch(page)) {
    const client = await page.context().newCDPSession(page);
    const touch = (x: number, y: number) => [{ x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 }];
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touch(from.x, from.y) });
    for (let step = 1; step <= steps; step += 1)
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: touch(
          from.x + ((to.x - from.x) * step) / steps,
          from.y + ((to.y - from.y) * step) / steps,
        ),
      });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await client.detach();
    return;
  }
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

const handle = (page: Page, index: number) =>
  editor(page).locator('.curve-editor__point').nth(index);

const handleValue = async (page: Page, index: number) => {
  const node = handle(page, index);
  return [
    Number(await node.getAttribute('data-input')),
    Number(await node.getAttribute('data-output')),
  ];
};

async function menu(page: Page, item: RegExp) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

test.beforeEach(async ({ page }) => prepare(page));

test('add, drag and remove RGB curve points with mouse or touch; pixels follow through undo, redo and reload', async ({
  page,
}) => {
  // Several project downloads and reloads; allow for slower runners.
  test.slow();
  await greyLayer(page);
  await openCurves(page);
  await expect(page.getByLabel('Smooth curve interpolation', { exact: true })).toBeChecked();
  expect(await pointCount(page)).toBe(2);

  // Add two interior points.
  await press(page, 64, 120);
  await expect.poll(() => pointCount(page)).toBe(3);
  await press(page, 192, 230);
  await expect.poll(() => pointCount(page)).toBe(4);
  let curves = await storedCurves(page);
  expect(curves.interpolation).toBe('monotone');
  expect(curves.rgb).toHaveLength(4);
  const [addedX, addedY] = curves.rgb[1];
  expect(Math.abs(addedX - 64)).toBeLessThanOrEqual(3);
  expect(Math.abs(addedY - 120)).toBeLessThanOrEqual(3);
  await expect.poll(async () => (await pixel(page))[0]).toBe(expectedGrey(curves));
  const beforeDrag = curves.rgb;
  const pixelBeforeDrag = (await pixel(page))[0];

  // Drag the first interior point up: one history entry for the whole drag.
  const start = await at(graph(page), addedX, addedY);
  const end = await at(graph(page), 90, 200);
  await dragBetween(page, start, end);
  await expect.poll(async () => (await handleValue(page, 1))[1]).toBeGreaterThan(185);
  curves = await storedCurves(page);
  expect(curves.rgb).toHaveLength(4);
  expect(Math.abs(curves.rgb[1][0] - 90)).toBeLessThanOrEqual(3);
  const dragged = curves.rgb;
  await expect.poll(async () => (await pixel(page))[0]).toBe(expectedGrey(curves));
  expect((await pixel(page))[0]).toBeGreaterThan(pixelBeforeDrag);

  await menu(page, /^Undo/);
  await expect.poll(async () => (await storedCurves(page)).rgb).toEqual(beforeDrag);
  await expect.poll(async () => (await pixel(page))[0]).toBe(pixelBeforeDrag);
  await menu(page, /^Redo/);
  await expect.poll(async () => (await storedCurves(page)).rgb).toEqual(dragged);

  // Remove the 192 point: double-click on desktop, drag it off on touch.
  const [x2, y2] = dragged[2];
  const removeFrom = await at(graph(page), x2, y2);
  if (await isTouch(page)) {
    const box = (await graph(page).boundingBox())!;
    await dragBetween(page, removeFrom, { x: removeFrom.x, y: box.y + box.height + 80 });
  } else {
    await page.mouse.dblclick(removeFrom.x, removeFrom.y);
  }
  await expect.poll(() => pointCount(page)).toBe(3);
  curves = await storedCurves(page);
  expect(curves.rgb.map(([x]) => x)).toEqual([0, dragged[1][0], 255]);
  const removedGrey = expectedGrey(curves);
  await expect.poll(async () => (await pixel(page))[0]).toBe(removedGrey);

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await openCurves(page);
  await expect.poll(() => pointCount(page)).toBe(3);
  expect(await handleValue(page, 1)).toEqual([...curves.rgb[1]]);
  await expect.poll(async () => (await pixel(page))[0]).toBe(removedGrey);
});

test('curve points are keyboard accessible: arrows move, Shift moves by 10, Delete and Remove point delete', async ({
  page,
}) => {
  await greyLayer(page);
  await openCurves(page);
  await press(page, 128, 128);
  await expect.poll(() => pointCount(page)).toBe(3);
  const point = handle(page, 1);
  await point.focus();
  await expect(point).toBeFocused();
  const [x, y] = await handleValue(page, 1);
  await point.press('ArrowUp');
  await expect.poll(() => handleValue(page, 1)).toEqual([x, y + 1]);
  await point.press('Shift+ArrowUp');
  await expect.poll(() => handleValue(page, 1)).toEqual([x, y + 11]);
  await point.press('ArrowLeft');
  await expect.poll(() => handleValue(page, 1)).toEqual([x - 1, y + 11]);
  await point.press('Shift+ArrowRight');
  await expect.poll(() => handleValue(page, 1)).toEqual([x + 9, y + 11]);
  await expect(point).toHaveAccessibleName(`RGB curve point 1: input ${x + 9}, output ${y + 11}`);
  let curves = await storedCurves(page);
  expect(curves.rgb[1]).toEqual([x + 9, y + 11]);
  await expect.poll(async () => (await pixel(page))[0]).toBe(expectedGrey(curves));

  // Selected-point fields edit numerically; endpoints only move vertically.
  await editor(page).getByLabel('RGB selected point output', { exact: true }).fill('200');
  await expect.poll(() => handleValue(page, 1)).toEqual([x + 9, 200]);
  const black = handle(page, 0);
  await black.focus();
  await black.press('ArrowRight');
  await black.press('Shift+ArrowUp');
  await expect.poll(() => handleValue(page, 0)).toEqual([0, 10]);
  await expect(editor(page).getByLabel('RGB selected point input', { exact: true })).toBeDisabled();
  await expect(editor(page).getByRole('button', { name: 'Remove selected RGB point' })).toBeDisabled();
  await black.press('Delete');
  expect(await pointCount(page)).toBe(3);

  // Delete on a focused interior point removes it.
  await handle(page, 1).focus();
  await handle(page, 1).press('Delete');
  await expect.poll(() => pointCount(page)).toBe(2);
  curves = await storedCurves(page);
  expect(curves.rgb).toEqual([[0, 10], [255, 255]]);
  await expect.poll(async () => (await pixel(page))[0]).toBe(expectedGrey(curves));

  // The explicit Remove point control also deletes the selected point.
  await press(page, 60, 40);
  await expect.poll(() => pointCount(page)).toBe(3);
  await editor(page).getByRole('button', { name: 'Remove selected RGB point' }).click();
  await expect.poll(() => pointCount(page)).toBe(2);
  await menu(page, /^Undo/);
  await expect.poll(() => pointCount(page)).toBe(3);
});

test('per-channel curves edit independently and the editor caps interior points at 14', async ({
  page,
}) => {
  // Several project downloads and reloads; allow for slower runners.
  test.slow();
  await greyLayer(page);
  await openCurves(page);
  const red = page.getByTestId('red-curve-graph');
  await red.scrollIntoViewIfNeeded();
  const redPoint = await at(red, 128, 40);
  if (await isTouch(page)) await page.touchscreen.tap(redPoint.x, redPoint.y);
  else await page.mouse.click(redPoint.x, redPoint.y);
  await expect(page.getByRole('group', { name: 'Red curve editor' })).toHaveAttribute('data-point-count', '3');
  const curves = await storedCurves(page);
  expect(curves.rgb).toHaveLength(2);
  expect(curves.red).toHaveLength(3);
  await expect.poll(async () => (await pixel(page)).slice(0, 3)).toEqual([
    compileCurves(curves)[0][128],
    128,
    128,
  ]);

  // Fill the RGB curve to the cap, alternating high and low outputs so taps
  // stay well apart even with touch-sized hit targets.
  await graph(page).scrollIntoViewIfNeeded();
  for (let index = 1; index <= 14; index += 1) {
    await press(page, 8 + index * 16, index % 2 ? 70 : 190);
    await expect.poll(() => pointCount(page)).toBe(2 + index);
  }
  await expect(editor(page)).toContainText('14/14 points');
  await press(page, 8, 128);
  await expect(editor(page).locator('output.curve-editor__status')).toHaveText(
    'RGB curve already has the maximum of 14 interior points',
  );
  expect(await pointCount(page)).toBe(16);
  expect((await storedCurves(page)).rgb).toHaveLength(16);
});
