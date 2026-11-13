import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { openPanel } from './sidebar-panels';

// Difference Clouds renders smooth clouds into transparent layers with a
// Clouds-sized scale, and Levels output black above output white inverts.

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const settled = (page: Page) =>
  expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });
const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device', { timeout: 30_000 });

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

async function menu(page: Page, name: string, item: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

async function project(page: Page) {
  await saved(page);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return (await downloadedProject((await (await pending).path())!)) as {
    history: Array<{ layers: Array<{ kind: string; adjustments: Record<string, unknown> & { filterEffects?: Record<string, unknown> } }> }>;
    index: number;
  };
}

/** Statistics of one row of the composite: coverage, grey range and smoothness. */
const rowStats = (page: Page, y = 400) =>
  canvas(page).evaluate((element: HTMLCanvasElement, row) => {
    const data = element.getContext('2d')!.getImageData(0, row, element.width, 1).data;
    let opaque = 0, grey = true, low = 255, high = 0, steps = 0, maxStep = 0;
    for (let x = 0; x < element.width; x += 1) {
      const i = x * 4;
      if (data[i + 3] === 255) opaque += 1;
      if (data[i] !== data[i + 1] || data[i + 1] !== data[i + 2]) grey = false;
      low = Math.min(low, data[i]);
      high = Math.max(high, data[i]);
      if (x) {
        const step = Math.abs(data[i] - data[i - 4]);
        steps += step;
        maxStep = Math.max(maxStep, step);
      }
    }
    return { opaqueShare: opaque / element.width, grey, low, high, meanStep: steps / (element.width - 1), maxStep };
  }, y);

test('Difference Clouds renders smooth clouds into a transparent layer with a Clouds-sized scale', async ({ page }) => {
  test.setTimeout(120_000);
  await menu(page, 'File', 'New transparent document');
  await settled(page);
  expect((await rowStats(page)).opaqueShare).toBe(0);

  await menu(page, 'Filter', 'Difference Clouds');
  await openPanel(page, 'Filters');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('difference-clouds');
  // Same default and range as Clouds: a quarter of the 800 px side, up to 2048.
  const size = page.getByLabel('Cloud size', { exact: true });
  await expect(size).toHaveValue('200');
  await expect(size).toHaveAttribute('max', '2048');
  await expect(page.getByLabel('Cloud scale', { exact: true })).toHaveCount(0);
  await page.getByLabel('Effect amount', { exact: true }).fill('100');
  await settled(page);

  const clouds = await rowStats(page);
  // Transparent counts as black, so the result is the opaque grey clouds.
  expect(clouds.opaqueShare).toBe(1);
  expect(clouds.grey).toBe(true);
  expect(clouds.high - clouds.low).toBeGreaterThan(60);
  // Smooth fractal noise: small steps between neighbours, no blocky jumps.
  expect(clouds.meanStep).toBeLessThan(6);
  expect(clouds.maxStep).toBeLessThan(40);

  await size.fill('1500');
  await settled(page);
  const broad = await rowStats(page);
  expect(broad.opaqueShare).toBe(1);
  expect(broad.meanStep).toBeLessThan(clouds.meanStep);

  const stored = await project(page);
  expect(stored.history[stored.index].layers.at(-1)!.adjustments.filterEffects).toMatchObject({
    type: 'difference-clouds',
    amount: 100,
    cloudScale: 1500,
  });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false', { timeout: 60_000 });
  await settled(page);
  await openPanel(page, 'Filters');
  await expect(page.getByLabel('Cloud size', { exact: true })).toHaveValue('1500');
  expect(await rowStats(page)).toEqual(broad);
});

async function filledGrey(page: Page, hex: string) {
  await page.getByLabel('Drawing color', { exact: true }).evaluate((input: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, hex);
  await menu(page, 'File', 'New transparent document');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Fill…/ }).click();
  await page.getByRole('dialog', { name: 'Fill' }).getByRole('button', { name: 'Fill', exact: true }).click();
  await settled(page);
}

const sample = (page: Page) =>
  canvas(page).evaluate((element: HTMLCanvasElement) => Array.from(element.getContext('2d')!.getImageData(600, 400, 1, 1).data));

test('Levels output black above output white inverts the layer and survives reload', async ({ page }) => {
  await filledGrey(page, '#402010');
  await expect.poll(() => sample(page)).toEqual([64, 32, 16, 255]);
  await openPanel(page, 'Adjust selected layer');
  const black = page.getByLabel('Levels output black', { exact: true });
  const white = page.getByLabel('Levels output white', { exact: true });
  await expect(black).toHaveAttribute('max', '255');
  await expect(white).toHaveAttribute('min', '0');
  await black.fill('255');
  await white.fill('0');
  // Not clamped to 254 / 255 any more.
  await expect(black).toHaveValue('255');
  await expect(white).toHaveValue('0');
  await expect.poll(() => sample(page)).toEqual([191, 223, 239, 255]);
  // A partial reversed range.
  await black.fill('200');
  await white.fill('40');
  await expect.poll(() => sample(page)).toEqual([160, 180, 190, 255]);

  const stored = await project(page);
  expect(stored.history[stored.index].layers.at(-1)!.adjustments).toMatchObject({
    levelsOutputBlack: 200,
    levelsOutputWhite: 40,
  });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false', { timeout: 60_000 });
  await expect(black).toHaveValue('200');
  await expect(white).toHaveValue('40');
  await expect.poll(() => sample(page)).toEqual([160, 180, 190, 255]);
});

test('an adjustment layer with reversed Levels output inverts the composite below', async ({ page }) => {
  await filledGrey(page, '#402010');
  await page.getByRole('button', { name: 'Add adjustment layer', exact: true }).click();
  await openPanel(page, 'Adjust selected layer');
  await page.getByLabel('Levels output black', { exact: true }).fill('255');
  await page.getByLabel('Levels output white', { exact: true }).fill('0');
  await expect.poll(() => sample(page)).toEqual([191, 223, 239, 255]);
  const stored = await project(page);
  const layer = stored.history[stored.index].layers.at(-1)!;
  expect(layer.kind).toBe('adjustment');
  expect(layer.adjustments).toMatchObject({ levelsOutputBlack: 255, levelsOutputWhite: 0 });
  // Undoing the white edit leaves equal endpoints (255/255): a flat white level.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect.poll(() => sample(page)).toEqual([255, 255, 255, 255]);
});
