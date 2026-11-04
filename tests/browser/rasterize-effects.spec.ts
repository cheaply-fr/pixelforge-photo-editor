import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

type Project = {
  assets: Record<string, unknown>;
  history: Array<{
    layers: Array<{
      asset?: string;
      adjustments: { filterEffects?: { type?: string } };
    }>;
  }>;
  index: number;
};

/** A flat mid-grey image: any texture in it must come from the Clouds effect. */
async function importFlatGrey(page: Page) {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 32;
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'rgb(128,128,128)';
    context.fillRect(0, 0, 48, 32);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'flat-grey.png',
    mimeType: 'image/png',
    buffer: Buffer.from(encoded, 'base64'),
  });
  await settled(page);
}

const settled = (page: Page) =>
  expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');

async function menu(page: Page, name: string, item: string | RegExp) {
  await page.getByRole('button', { name, exact: true }).click();
  await page
    .getByRole('menuitem', typeof item === 'string' ? { name: item, exact: true } : { name: item })
    .click();
}

const pixels = (page: Page) =>
  page
    .getByTestId('editor-canvas')
    .evaluate((canvas: HTMLCanvasElement) =>
      Array.from(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data),
    );

/** Number of distinct RGB colours: 1 for a flat image, many for a texture. */
const distinctReds = (data: number[]) => {
  const colours = new Set<number>();
  for (let i = 0; i < data.length; i += 4) colours.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  return colours.size;
};

async function project(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return (await downloadedProject((await (await pending).path())!)) as Project;
}

test('Rasterize bakes a live filter effect into new pixels and undo restores it', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await importFlatGrey(page);
  const flat = await pixels(page);
  expect(distinctReds(flat)).toBe(1);
  const source = (await project(page)).history.at(-1)!.layers.at(-1)!.asset!;

  await menu(page, 'Filter', 'Clouds');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('clouds');
  await expect.poll(async () => distinctReds(await pixels(page))).toBeGreaterThan(4);
  await settled(page);
  const clouded = await pixels(page);

  await menu(page, 'Layer', 'Rasterize');
  await expect(page.getByText('Layer rasterized. Undo restores editable content.')).toBeVisible();
  await settled(page);
  // The live effect is gone from the layer, but its texture stays in the pixels.
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
  expect(await pixels(page)).toEqual(clouded);

  const baked = await project(page);
  const bakedLayer = baked.history[baked.index].layers.at(-1)!;
  expect(bakedLayer.adjustments.filterEffects?.type ?? 'none').toBe('none');
  expect(bakedLayer.asset).not.toBe(source);
  // The original import stays in the asset store for undo.
  expect(baked.assets[source]).toBeTruthy();

  // A second filter now builds on the baked texture instead of replacing it.
  // Before the fix this rendered the flat grey source again (one red value).
  await menu(page, 'Filter', 'Gradient Map…');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('gradient-map');
  await settled(page);
  expect(distinctReds(await pixels(page))).toBeGreaterThan(4);

  // Undo the Gradient Map, then the Rasterize: the editable effect returns.
  await menu(page, 'Edit', /^Undo/);
  await settled(page);
  expect(await pixels(page)).toEqual(clouded);
  await menu(page, 'Edit', /^Undo/);
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('clouds');
  await settled(page);
  expect(await pixels(page)).toEqual(clouded);
  const restored = await project(page);
  expect(restored.history[restored.index].layers.at(-1)!.asset).toBe(source);
});

test('a rasterized effect survives reload without being applied twice', async ({ page }) => {
  test.setTimeout(90_000);
  await importFlatGrey(page);
  await menu(page, 'Filter', 'Clouds');
  await expect.poll(async () => distinctReds(await pixels(page))).toBeGreaterThan(4);
  await settled(page);
  await menu(page, 'Layer', 'Rasterize');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
  await settled(page);
  const baked = await pixels(page);
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await settled(page);
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
  expect(await pixels(page)).toEqual(baked);
});

test('Rasterize leaves a locked layer and its live effect untouched', async ({ page }) => {
  await importFlatGrey(page);
  await menu(page, 'Filter', 'Clouds');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('clouds');
  await settled(page);
  const before = await pixels(page);
  await page.getByLabel('Lock layer', { exact: true }).check();
  await menu(page, 'Layer', 'Rasterize');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('clouds');
  await settled(page);
  expect(await pixels(page)).toEqual(before);
});
