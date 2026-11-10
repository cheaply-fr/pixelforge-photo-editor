import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const level = (page: Page) => page.getByTestId('zoom-level');

/** Menu items' accessible names may end with their shortcut, e.g. 'Actual size1'. */
async function menu(page: Page, name: string, item: string) {
  await page.getByRole('button', { name, exact: true }).click();
  const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page.getByRole('menuitem', { name: new RegExp('^' + escaped) }).first().click();
}

async function viewZoom(page: Page) {
  return Number(await page.getByTestId('canvas-wrap').getAttribute('data-view-zoom'));
}

/** Displayed CSS pixels per image pixel. */
async function displayScale(page: Page) {
  return canvas(page).evaluate((element: HTMLCanvasElement) =>
    element.getBoundingClientRect().width / element.width,
  );
}

async function resizeCanvas(page: Page, width: number, height: number) {
  await menu(page, 'Image', 'Canvas Size…');
  await page.getByLabel('Width (px)').fill(String(width));
  await page.getByLabel('Height (px)').fill(String(height));
  await page.getByRole('button', { name: 'Apply canvas size', exact: true }).click();
  await expect(canvas(page)).toHaveJSProperty('width', width);
  await expect(canvas(page)).toHaveJSProperty('height', height);
}

/** Image pixel under a client point, from the canvas's on-screen box. */
async function imagePointAt(page: Page, x: number, y: number) {
  return canvas(page).evaluate(
    (element: HTMLCanvasElement, point) => {
      const rect = element.getBoundingClientRect();
      return {
        x: ((point.x - rect.left) / rect.width) * element.width,
        y: ((point.y - rect.top) / rect.height) * element.height,
      };
    },
    { x, y },
  );
}

async function stageCentre(page: Page) {
  const box = (await page.locator('.stage').boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('new documents open fitted and Actual size shows one image pixel per CSS pixel', async ({
  page,
}) => {
  const stage = (await page.locator('.stage').boundingBox())!;
  const shown = (await canvas(page).boundingBox())!;
  expect(shown.width).toBeLessThanOrEqual(stage.width);
  expect(shown.height).toBeLessThanOrEqual(stage.height);
  await expect(level(page)).toHaveText(/%$/);

  await menu(page, 'View', 'Actual size');
  await expect(level(page)).toHaveText('100%');
  await expect.poll(() => displayScale(page)).toBeCloseTo(1, 3);
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveAttribute('aria-valuetext', '100%');

  await menu(page, 'View', 'Fit to screen');
  await expect.poll(() => displayScale(page)).toBeLessThan(1);
  expect((await canvas(page).boundingBox())!.width).toBeLessThanOrEqual(stage.width);
});

test('a 2646×4096 canvas can be fitted, shown at 100% and scrolled to its far corner', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await resizeCanvas(page, 2646, 4096);
  await menu(page, 'View', 'Fit to screen');
  const stage = page.locator('.stage');
  const stageBox = (await stage.boundingBox())!;
  await expect
    .poll(async () => (await canvas(page).boundingBox())!.height)
    .toBeLessThanOrEqual(stageBox.height);
  const fitted = await viewZoom(page);
  // The old view capped this image at 1200 CSS px wide (about 45%).
  expect(fitted).toBeLessThan(100);

  await page.keyboard.press('1');
  await expect(level(page)).toHaveText('100%');
  await expect.poll(async () => (await canvas(page).boundingBox())!.width).toBeCloseTo(2646, 0);
  const extent = await stage.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(extent.scrollWidth).toBeGreaterThan(extent.clientWidth);
  expect(extent.scrollHeight).toBeGreaterThan(extent.clientHeight);

  // Both the top-left and bottom-right image corners are reachable.
  await stage.evaluate((element) => element.scrollTo(0, 0));
  let box = (await canvas(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(stageBox.x - 1);
  expect(box.y).toBeGreaterThanOrEqual(stageBox.y - 1);
  await stage.evaluate((element) => element.scrollTo(element.scrollWidth, element.scrollHeight));
  box = (await canvas(page).boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 1);
  expect(box.x + box.width).toBeGreaterThan(stageBox.x);
});

test('zoom steps clamp between 1% and 3200% and pixels render crisp when magnified', async ({
  page,
}) => {
  await page.keyboard.press('1');
  for (let i = 0; i < 14; i += 1) await page.keyboard.press('+');
  await expect(level(page)).toHaveText('3200%');
  await page.keyboard.press('+');
  await expect(level(page)).toHaveText('3200%');
  await expect(page.getByTestId('canvas-wrap')).toHaveAttribute('data-pixelated', 'true');
  await expect(canvas(page)).toHaveCSS('image-rendering', 'pixelated');
  for (let i = 0; i < 26; i += 1) await page.keyboard.press('-');
  await expect(level(page)).toHaveText('1%');
  await expect(page.getByTestId('canvas-wrap')).toHaveAttribute('data-pixelated', 'false');
  // The slider walks the same steps.
  const slider = page.getByLabel('Zoom', { exact: true });
  await slider.fill(await slider.getAttribute('max') as string);
  await expect(level(page)).toHaveText('3200%');
});

test('painting at 800% lands on the image pixel under the pointer', async ({ page }) => {
  await page.keyboard.press('1');
  // 100 → 150 → 200 → 300 → 400 → 600 → 800
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('+');
  await expect(level(page)).toHaveText('800%');
  await selectTool(page, 'Brush');
  await page.getByLabel('Drawing color').evaluate((input: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '#ff0000');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const centre = await stageCentre(page);
  const target = await imagePointAt(page, centre.x, centre.y);
  const farBefore = await canvas(page).evaluate(
    (element: HTMLCanvasElement, point) =>
      Array.from(element.getContext('2d')!.getImageData(Math.floor(point.x) + 40, Math.floor(point.y) + 40, 1, 1).data),
    target,
  );
  await page.mouse.click(centre.x, centre.y);
  await expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
  const sample = await canvas(page).evaluate(
    (element: HTMLCanvasElement, point) => {
      const context = element.getContext('2d')!;
      const at = (x: number, y: number) => Array.from(context.getImageData(x, y, 1, 1).data);
      const x = Math.floor(point.x), y = Math.floor(point.y);
      return { hit: at(x, y), far: at(x + 40, y + 40) };
    },
    target,
  );
  expect(sample.hit[0]).toBeGreaterThan(200);
  expect(sample.hit[1]).toBeLessThan(80);
  // A pixel 40 image px away (320 CSS px at 800%) is untouched.
  expect(sample.far).toEqual(farBefore);
});

test('the Zoom tool and Ctrl+wheel keep the image point under the pointer', async ({ page }) => {
  // Anchoring applies once the image overflows the stage; a smaller image is
  // centred. At 100% the 1200×800 document overflows on desktop and mobile.
  await page.keyboard.press('1');
  await expect(level(page)).toHaveText('100%');
  const stage = page.locator('.stage');
  await stage.evaluate((element) =>
    element.scrollTo((element.scrollWidth - element.clientWidth) / 2, (element.scrollHeight - element.clientHeight) / 2),
  );
  const box = (await stage.boundingBox())!;
  const pointer = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.3 };
  const before = await imagePointAt(page, pointer.x, pointer.y);

  await selectTool(page, 'Zoom');
  const fitted = await viewZoom(page);
  await page.mouse.click(pointer.x, pointer.y);
  await expect.poll(() => viewZoom(page)).toBeGreaterThan(fitted);
  await expect.poll(async () => (await imagePointAt(page, pointer.x, pointer.y)).x).toBeCloseTo(before.x, -1);
  let after = await imagePointAt(page, pointer.x, pointer.y);
  expect(Math.abs(after.x - before.x)).toBeLessThan(3);
  expect(Math.abs(after.y - before.y)).toBeLessThan(3);

  const zoomed = await viewZoom(page);
  await page.mouse.move(pointer.x, pointer.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect.poll(() => viewZoom(page)).toBeGreaterThan(zoomed);
  await expect.poll(async () => (await imagePointAt(page, pointer.x, pointer.y)).x).toBeCloseTo(before.x, -1);
  after = await imagePointAt(page, pointer.x, pointer.y);
  expect(Math.abs(after.x - before.x)).toBeLessThan(3);
  expect(Math.abs(after.y - before.y)).toBeLessThan(3);
});

test('view zoom survives reload and never changes document pixels', async ({ page }) => {
  const pixels = () =>
    canvas(page).evaluate((element: HTMLCanvasElement) =>
      element.toDataURL('image/png'),
    );
  const original = await pixels();
  await page.keyboard.press('1');
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await expect(level(page)).toHaveText('200%');
  expect(await pixels()).toBe(original);
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(level(page)).toHaveText('200%');
  await expect.poll(() => displayScale(page)).toBeCloseTo(2, 3);
  expect(await pixels()).toBe(original);
});
