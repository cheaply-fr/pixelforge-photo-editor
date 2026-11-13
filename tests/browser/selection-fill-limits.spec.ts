import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

/*
 * Empty selections never become "no selection" (docs/selection-composition-contract.md),
 * quick Fill shortcuts (docs/keyboard-shortcuts.md), the 1000 px options-bar
 * feather and the large Gaussian Blur radius (docs/blur-effects-contract.md).
 */

type Point = { x: number; y: number };

const footer = (page: Page) => page.locator('footer');

async function project(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  const value = await downloadedProject((await download.path())!);
  return value.history[value.index];
}

const settled = (page: Page, timeout = 60_000) =>
  expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false', { timeout });

/** RGBA of the rendered document at fractional canvas coordinates. */
async function rendered(page: Page, points: [number, number][]) {
  await settled(page);
  return page.getByTestId('editor-canvas').evaluate((element: HTMLCanvasElement, at) => {
    const context = element.getContext('2d')!;
    return at.map(([x, y]) =>
      Array.from(context.getImageData(Math.floor(element.width * x), Math.floor(element.height * y), 1, 1).data),
    );
  }, points);
}

/** Every pixel of the rendered canvas, for "nothing changed" checks. */
const snapshot = async (page: Page) => {
  await settled(page);
  return page.getByTestId('editor-canvas').evaluate((element: HTMLCanvasElement) =>
    Array.from(element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data).join(','),
  );
};

/** A synthetic lasso drag (pointer events work for both desktop and touch profiles). */
async function lasso(page: Page, mobile: boolean, path: Point[], pointerId = 70) {
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  const pointerType = mobile ? 'touch' : 'mouse';
  const init = (point: Point, buttons: number) => ({
    pointerId,
    pointerType,
    pressure: 0.5,
    clientX: point.x,
    clientY: point.y,
    buttons,
    isPrimary: true,
  });
  await canvas.dispatchEvent('pointerdown', init(path[0], 1));
  for (const point of path.slice(1)) await canvas.dispatchEvent('pointermove', init(point, 1));
  await canvas.dispatchEvent('pointerup', init(path.at(-1)!, 0));
}

async function canvasBox(page: Page) {
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  expect(box.x).toBeGreaterThan(30);
  return box;
}

/** An off-canvas loop to the left of the image. */
const offCanvasLoop = (box: { x: number; y: number; height: number }) => [
  { x: box.x - 28, y: box.y + box.height * 0.3 },
  { x: box.x - 6, y: box.y + box.height * 0.4 },
  { x: box.x - 20, y: box.y + box.height * 0.6 },
  { x: box.x - 28, y: box.y + box.height * 0.32 },
];

async function editMenu(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name }).click();
}

/** Quick fill: the keyboard shortcut on desktop, the Edit menu item on touch. */
async function quickFill(page: Page, mobile: boolean, which: 'foreground' | 'background') {
  if (mobile)
    await editMenu(page, which === 'foreground' ? /^Fill with Foreground Color/ : /^Fill with Background Color/);
  else {
    await page.getByTestId('editor-canvas').hover();
    await page.keyboard.press(which === 'foreground' ? 'Alt+Backspace' : 'Control+Backspace');
  }
}

const isColor = (rgba: number[], [r, g, b]: [number, number, number]) =>
  Math.abs(rgba[0] - r) < 8 && Math.abs(rgba[1] - g) < 8 && Math.abs(rgba[2] - b) < 8;

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
});

test('an off-canvas Lasso gives an empty selection: Fill, quick fill and Clear change nothing', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  await page.getByLabel('Drawing color', { exact: true }).fill('#00ff00');
  await selectTool(page, 'Lasso');
  const box = await canvasBox(page);
  const before = await snapshot(page);
  await lasso(page, mobile, offCanvasLoop(box));
  await expect(footer(page)).toContainText('Lasso selection is outside the image; no pixels are selected');

  const frame = await project(page);
  expect(frame.selection).toBeDefined();
  expect(frame.selection.parts.map((part: { operation: string }) => part.operation)).toEqual(['replace', 'subtract']);

  // Edit > Fill… refuses before opening the dialog.
  await editMenu(page, /^Fill…/);
  await expect(footer(page)).toContainText('No pixels are selected');
  await expect(page.getByRole('dialog', { name: 'Fill' })).toHaveCount(0);

  // The quick fills and Clear refuse too: the layer is never filled whole.
  await quickFill(page, mobile, 'foreground');
  await expect(footer(page)).toContainText('No pixels are selected');
  await quickFill(page, mobile, 'background');
  await expect(footer(page)).toContainText('No pixels are selected');
  await editMenu(page, /^Clear$/);
  await expect(footer(page)).toContainText('No pixels are selected');
  expect(await snapshot(page)).toBe(before);

  // Invert of an empty selection selects everything, so a fill now covers the canvas.
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Inverse/ }).click();
  await quickFill(page, mobile, 'foreground');
  await expect(footer(page)).toContainText('Selection filled');
  const [corner, centre] = await rendered(page, [[0.02, 0.02], [0.5, 0.5]]);
  expect(isColor(corner, [0, 255, 0])).toBe(true);
  expect(isColor(centre, [0, 255, 0])).toBe(true);
});

test('Intersect mode with a disjoint Lasso leaves an empty selection that Fill respects', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  await page.getByLabel('Drawing color', { exact: true }).fill('#00ff00');
  await selectTool(page, 'Rectangular Marquee');
  const box = await canvasBox(page);
  const at = (x: number, y: number) => ({ x: box.x + box.width * x, y: box.y + box.height * y });
  await lasso(page, mobile, [at(0.6, 0.6), at(0.7, 0.7), at(0.8, 0.8)], 71);
  await expect(footer(page)).toContainText('Rectangular selection created');
  await page.getByLabel('Selection mode', { exact: true }).selectOption('intersect');

  // A disjoint on-canvas lasso: the intersection is empty but stays a selection.
  await selectTool(page, 'Lasso');
  await lasso(page, mobile, [at(0.1, 0.1), at(0.3, 0.1), at(0.3, 0.3), at(0.1, 0.3), at(0.1, 0.12)], 72);
  await expect(footer(page)).toContainText(/selection created/i);
  const before = await snapshot(page);
  await quickFill(page, mobile, 'foreground');
  await expect(footer(page)).toContainText('No pixels are selected');
  expect(await snapshot(page)).toBe(before);

  // An off-canvas lasso in Intersect mode also empties the selection.
  await selectTool(page, 'Rectangular Marquee');
  await page.getByLabel('Selection mode', { exact: true }).selectOption('replace');
  await lasso(page, mobile, [at(0.6, 0.6), at(0.7, 0.7), at(0.8, 0.8)], 73);
  await expect(footer(page)).toContainText('Rectangular selection created');
  await page.getByLabel('Selection mode', { exact: true }).selectOption('intersect');
  await selectTool(page, 'Lasso');
  await lasso(page, mobile, offCanvasLoop(box), 74);
  await expect(footer(page)).toContainText('no pixels are selected');
  await editMenu(page, /^Fill…/);
  await expect(footer(page)).toContainText('No pixels are selected');
  expect(await snapshot(page)).toBe(before);

  // Add mode with an off-canvas loop keeps the current selection.
  await selectTool(page, 'Rectangular Marquee');
  await page.getByLabel('Selection mode', { exact: true }).selectOption('replace');
  await lasso(page, mobile, [at(0.6, 0.6), at(0.7, 0.7), at(0.8, 0.8)], 75);
  await page.getByLabel('Selection mode', { exact: true }).selectOption('add');
  await selectTool(page, 'Lasso');
  await lasso(page, mobile, offCanvasLoop(box), 76);
  await expect(footer(page)).toContainText('the selection is unchanged');
  await quickFill(page, mobile, 'foreground');
  await expect(footer(page)).toContainText('Selection filled');
  const [inside, outside] = await rendered(page, [[0.7, 0.7], [0.2, 0.2]]);
  expect(isColor(inside, [0, 255, 0])).toBe(true);
  expect(isColor(outside, [0, 255, 0])).toBe(false);
});

test('quick fills paint the selection with the foreground and background colours in one undoable step', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  await page.getByLabel('Drawing color', { exact: true }).fill('#ff0000');
  await page.getByLabel('Background color', { exact: true }).fill('#0000ff');
  await selectTool(page, 'Rectangular Marquee');
  const box = await canvasBox(page);
  const at = (x: number, y: number) => ({ x: box.x + box.width * x, y: box.y + box.height * y });
  await lasso(page, mobile, [at(0.1, 0.1), at(0.2, 0.2), at(0.4, 0.4)], 80);
  await expect(footer(page)).toContainText('Rectangular selection created');

  await quickFill(page, mobile, 'foreground');
  await expect(footer(page)).toContainText('Selection filled');
  let [inside, outside] = await rendered(page, [[0.25, 0.25], [0.7, 0.7]]);
  expect(isColor(inside, [255, 0, 0])).toBe(true);
  expect(isColor(outside, [255, 0, 0])).toBe(false);

  await quickFill(page, mobile, 'background');
  await expect(footer(page)).toContainText('Selection filled');
  [inside, outside] = await rendered(page, [[0.25, 0.25], [0.7, 0.7]]);
  expect(isColor(inside, [0, 0, 255])).toBe(true);
  expect(isColor(outside, [0, 0, 255])).toBe(false);

  // Undo restores the foreground fill: each quick fill is one history step.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).first().click();
  [inside] = await rendered(page, [[0.25, 0.25]]);
  expect(isColor(inside, [255, 0, 0])).toBe(true);

  // Both commands are in the Edit menu with their shortcuts and in the Keyboard Shortcuts list.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Fill with Foreground Color/ })).toContainText('Alt+Backspace');
  await expect(page.getByRole('menuitem', { name: /^Fill with Background Color/ })).toContainText('Ctrl+Backspace');
  await page.getByRole('menuitem', { name: 'Keyboard Shortcuts…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
  await dialog.getByLabel('Filter keyboard shortcuts').fill('fill with');
  const list = dialog.getByLabel('Keyboard shortcuts list');
  await expect(list.getByText('Fill with Foreground Color', { exact: true })).toBeVisible();
  await expect(list.getByText('Fill with Background Color', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
});

test('the options-bar feather reaches 1000 px and feathers the next Lasso selection', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  await selectTool(page, 'Lasso');
  const feather = page.getByTestId('marquee-options').getByLabel('Feather (new selections)', { exact: true });
  await expect(feather).toHaveAttribute('max', '1000');
  await feather.fill('640');
  await expect(feather).toHaveValue('640');
  const box = await canvasBox(page);
  const at = (x: number, y: number) => ({ x: box.x + box.width * x, y: box.y + box.height * y });
  await lasso(page, mobile, [at(0.2, 0.2), at(0.8, 0.2), at(0.8, 0.8), at(0.2, 0.8), at(0.2, 0.22)], 90);
  await expect(footer(page)).toContainText(/selection created/i);
  const frame = await project(page);
  expect(frame.selection.feather).toBe(640);
});

test('Gaussian Blur accepts radii beyond 64 px, scaled to the document, and keeps them through a project download', async ({ page }) => {
  test.setTimeout(120_000);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Gaussian Blur…', exact: true }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('gaussian-blur');
  const slider = page.getByLabel('Blur radius', { exact: true });
  const frame0 = await project(page);
  const expectedMax = Math.max(250, Math.min(1000, Math.round(Math.max(frame0.w, frame0.h) / 4)));
  await expect(slider).toHaveAttribute('max', String(expectedMax));
  await slider.fill('200');
  await expect(slider).toHaveValue('200');
  const exact = page.getByLabel('Blur radius in pixels', { exact: true });
  await expect(exact).toHaveValue('200');
  await exact.fill('900');
  await expect(slider).toHaveValue('900');
  await settled(page);
  await expect(page.locator('footer > span').first()).not.toContainText(/Rendering stopped|timed out/i);
  const frame = await project(page);
  const layer = frame.layers.find((item: { id: string }) => item.id === frame.active);
  expect(layer.adjustments.filterEffects.type).toBe('gaussian-blur');
  expect(layer.adjustments.filterEffects.radius).toBe(900);
  // Out-of-range typing is ignored rather than clamped silently.
  await exact.fill('1500');
  await exact.blur();
  await expect(slider).toHaveValue('900');
});
