import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';

// Large posters need brushes far above the old 100 px ceiling. These tests
// paint on a 2646 × 4096 document and measure the rendered dab radius.

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
const sizeInput = (page: Page) => page.getByLabel('Size', { exact: true });
const sizeSlider = (page: Page) => page.getByLabel('Size slider', { exact: true });

async function newPoster(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('Document preset').selectOption('poster-2-3');
  await dialog.getByLabel('Background contents').selectOption('white');
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(canvas(page)).toHaveJSProperty('width', 2646);
  await expect(canvas(page)).toHaveJSProperty('height', 4096);
  await expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
}

/** Dispatch a real editor pointer stroke; `moves` are client-pixel offsets from the canvas centre. */
async function stroke(page: Page, moves: Array<[number, number]> = []) {
  const box = (await canvas(page).boundingBox())!;
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await canvas(page).evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  const base = { pointerId: 31, pointerType: 'mouse', pressure: 0.5, isPrimary: true };
  await canvas(page).dispatchEvent('pointerdown', { ...base, clientX: start.x, clientY: start.y, buttons: 1 });
  await page.waitForTimeout(100);
  let last = start;
  for (const [dx, dy] of moves) {
    last = { x: start.x + dx, y: start.y + dy };
    await canvas(page).dispatchEvent('pointermove', { ...base, clientX: last.x, clientY: last.y, buttons: 1 });
  }
  await canvas(page).dispatchEvent('pointerup', { ...base, clientX: last.x, clientY: last.y, buttons: 0 });
  await expect(page.locator('footer')).toContainText('Paint layer updated', { timeout: 30_000 });
  await expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
}

/** Read composited document pixels from the editor canvas (document resolution). */
const pixels = (page: Page, points: Array<[number, number]>) =>
  canvas(page).evaluate((element: HTMLCanvasElement, points) => {
    const context = element.getContext('2d')!;
    return points.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data));
  }, points);

const painted = (pixel: number[]) => pixel[1] < 160 && pixel[3] === 255;
const white = (pixel: number[]) => pixel[0] > 245 && pixel[1] > 245 && pixel[2] > 245;

test('an 800 px brush dab paints the measured radius on a 2646×4096 poster; ] and reload keep the size', async ({ page }) => {
  test.setTimeout(120_000);
  await newPoster(page);
  await selectTool(page, 'Brush');
  await sizeInput(page).fill('800');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await expect(sizeInput(page)).toHaveValue('800');
  await expect(sizeSlider(page)).toHaveAttribute('aria-valuetext', '800 px');
  await stroke(page);
  // The dab is centred on the document (1323, 2048) with a 400 px radius.
  const [centre, insideRight, insideLeft, insideTop, insideBottom, outsideRight, outsideLeft, outsideTop, outsideBottom, corner] = await pixels(page, [
    [1323, 2048],
    [1323 + 388, 2048], [1323 - 388, 2048], [1323, 2048 - 388], [1323, 2048 + 388],
    [1323 + 412, 2048], [1323 - 412, 2048], [1323, 2048 - 412], [1323, 2048 + 412],
    [1323 + 300, 2048 + 300],
  ]);
  for (const pixel of [centre, insideRight, insideLeft, insideTop, insideBottom]) expect(painted(pixel), JSON.stringify(pixel)).toBe(true);
  for (const pixel of [outsideRight, outsideLeft, outsideTop, outsideBottom, corner]) expect(white(pixel), JSON.stringify(pixel)).toBe(true);

  // ] steps proportionally (800 → 900) when focus is on the workspace.
  // Shortcuts are ignored while a form control has focus; return focus to the workspace.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press(']');
  await expect(sizeInput(page)).toHaveValue('900');
  await expect(sizeSlider(page)).toHaveAttribute('aria-valuetext', '900 px');
  await page.keyboard.press('[');
  await page.keyboard.press('[');
  await expect(sizeInput(page)).toHaveValue('700');
  await page.keyboard.press(']');
  await expect(sizeInput(page)).toHaveValue('800');
  await page.keyboard.press(']');
  await expect(sizeInput(page)).toHaveValue('900');
  await saved(page);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Brush');
  await expect(sizeInput(page)).toHaveValue('900');
  await expect(sizeSlider(page)).toHaveAttribute('aria-valuetext', '900 px');
});

test('a 5000 px dragged stroke stays responsive and spacing avoids per-move dabs', async ({ page }) => {
  test.setTimeout(120_000);
  await newPoster(page);
  await selectTool(page, 'Brush');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await sizeSlider(page).focus();
  await page.keyboard.press('End');
  await expect(sizeInput(page)).toHaveValue('5000');
  const started = Date.now();
  // Twenty small pointer moves: with 25% spacing (1250 px) only the start dab lands.
  await stroke(page, Array.from({ length: 20 }, (_, index) => [index + 1, 0] as [number, number]));
  const elapsed = Date.now() - started;
  // A 2500 px radius from the centre reaches every corner of the poster.
  const corners = await pixels(page, [[0, 0], [2645, 0], [0, 4095], [2645, 4095], [1323, 2048]]);
  for (const pixel of corners) expect(painted(pixel), JSON.stringify(pixel)).toBe(true);
  expect(elapsed, `5000 px stroke took ${elapsed} ms`).toBeLessThan(45_000);
});

test('Size control is accessible: exact input, perceptual slider keys, and range clamping', async ({ page }) => {
  await selectTool(page, 'Brush');
  const input = sizeInput(page), slider = sizeSlider(page);
  await expect(input).toHaveAttribute('type', 'number');
  await expect(input).toHaveAttribute('min', '1');
  await expect(input).toHaveAttribute('max', '5000');
  await expect(slider).toHaveAttribute('type', 'range');
  await input.fill('44');
  await expect(slider).toHaveAttribute('aria-valuetext', '44 px');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(input).toHaveValue('45');
  await page.keyboard.press('ArrowLeft');
  await expect(input).toHaveValue('40');
  await page.keyboard.press('ArrowDown');
  await expect(input).toHaveValue('35');
  await page.keyboard.press('PageUp');
  await expect(input).toHaveValue('60');
  await page.keyboard.press('Home');
  await expect(input).toHaveValue('1');
  await expect(slider).toHaveAttribute('aria-valuetext', '1 px');
  await page.keyboard.press('End');
  await expect(input).toHaveValue('5000');
  // Out-of-range typed values clamp on commit instead of being silently dropped.
  await input.fill('9000');
  await input.press('Enter');
  await expect(input).toHaveValue('5000');
  await input.fill('0');
  await input.blur();
  await expect(input).toHaveValue('1');
  // The control fits its panel on desktop and mobile without horizontal overflow.
  const fits = await input.evaluate((element) => {
    const control = element.closest('.brush-size-control')!;
    const rect = control.getBoundingClientRect(), field = element.getBoundingClientRect();
    return field.right <= rect.right + 1 && field.left >= rect.left - 1 && control.scrollWidth <= control.clientWidth + 1;
  });
  expect(fits).toBe(true);
  await expect(slider).toBeVisible();
});
