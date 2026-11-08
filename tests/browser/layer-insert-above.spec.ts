import { test, expect, type Page } from '@playwright/test';

// New layers are inserted directly above the selected layer (joining its
// folder and clipping group), and adding or deleting an empty layer reuses
// the finished composite instead of recompositing the whole stack.

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const footer = (page: Page) => page.locator('footer');
const settled = (page: Page) =>
  expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });
const rows = (page: Page) => page.getByRole('button', { name: /^Select layer / });
/** Layer names as the Layers panel lists them (top of the stack first). */
const order = (page: Page) =>
  rows(page).evaluateAll((items) =>
    items.map((item) => (item.getAttribute('aria-label') || '').replace(/^Select layer /, '')),
  );
const selectLayer = async (page: Page, name: string) => {
  await page.getByRole('button', { name: `Select layer ${name}`, exact: true }).click();
  await settled(page);
};
const addPaintLayer = async (page: Page) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
};
async function menu(page: Page, name: string, item: string | RegExp) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', { name: item, ...(typeof item === 'string' ? { exact: true } : {}) }).click();
}
const undo = async (page: Page) => {
  await menu(page, 'Edit', /^Undo/);
  await settled(page);
};
const redo = async (page: Page) => {
  await menu(page, 'Edit', /^Redo/);
  await settled(page);
};
const clearCompositeMarks = (page: Page) =>
  page.evaluate(() => performance.clearMarks('pixelforge.composite-cache'));
const compositeMarks = (page: Page) =>
  page.evaluate(() =>
    (performance.getEntriesByName('pixelforge.composite-cache', 'mark') as PerformanceMark[]).map(
      (mark) => (mark.detail as { final: boolean }).final,
    ),
  );
const digest = (page: Page) =>
  canvas(page).evaluate((element: HTMLCanvasElement) => {
    const data = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    let hash = 0x811c9dc5;
    for (let i = 0; i < data.length; i += 1) hash = Math.imul(hash ^ data[i], 0x01000193);
    return (hash >>> 0).toString(16);
  });

test('Add paint layer inserts directly above the selected layer; undo and redo keep the order', async ({ page }) => {
  for (let index = 0; index < 3; index += 1) await addPaintLayer(page);
  expect(await order(page)).toEqual(['Paint 3', 'Paint 2', 'Paint 1', 'Background']);

  await selectLayer(page, 'Paint 1');
  await addPaintLayer(page);
  expect(await order(page)).toEqual(['Paint 3', 'Paint 2', 'Paint 4', 'Paint 1', 'Background']);
  await expect(page.getByRole('button', { name: 'Select layer Paint 4', exact: true })).toHaveAttribute(
    'data-selected',
    'true',
  );
  await expect(page.locator('[data-selected="true"]')).toHaveCount(1);

  // Above the bottom layer, too.
  await selectLayer(page, 'Background');
  await addPaintLayer(page);
  expect(await order(page)).toEqual(['Paint 3', 'Paint 2', 'Paint 4', 'Paint 1', 'Paint 5', 'Background']);

  await undo(page);
  expect(await order(page)).toEqual(['Paint 3', 'Paint 2', 'Paint 4', 'Paint 1', 'Background']);
  await undo(page);
  expect(await order(page)).toEqual(['Paint 3', 'Paint 2', 'Paint 1', 'Background']);
  await redo(page);
  expect(await order(page)).toEqual(['Paint 3', 'Paint 2', 'Paint 4', 'Paint 1', 'Background']);
  await redo(page);
  expect(await order(page)).toEqual(['Paint 3', 'Paint 2', 'Paint 4', 'Paint 1', 'Paint 5', 'Background']);

  // Other new layers follow the same rule: an adjustment layer above Paint 2.
  await selectLayer(page, 'Paint 2');
  await menu(page, 'Layer', /^New Adjustment Layer/);
  await settled(page);
  const names = await order(page);
  expect(names.indexOf('Paint 2') - names.indexOf('Paint 3')).toBe(2);
  expect(names[names.indexOf('Paint 2') - 1]).toMatch(/^Adjustment /);
});

test('a new layer above a clipping base or clipped layer joins the clipping group', async ({ page }) => {
  // Base, then a clipped layer above it.
  await addPaintLayer(page);
  await page.getByLabel('Layer name', { exact: true }).fill('Base');
  await addPaintLayer(page);
  await page.getByLabel('Layer name', { exact: true }).fill('Clip');
  await page.getByRole('button', { name: 'Create clipping mask', exact: true }).click();
  await expect(footer(page)).toContainText('Clipping mask created from Base');
  await settled(page);

  // Selecting the base and adding a layer puts it inside the group.
  await selectLayer(page, 'Base');
  await addPaintLayer(page);
  await expect(footer(page)).toContainText('Layer added to the clipping group');
  expect(await order(page)).toEqual(['Clip', 'Paint 3', 'Base', 'Background']);
  await expect(page.getByText('Clipped to Base', { exact: true })).toBeVisible();
  // The layer that was clipped above stays clipped to the same base.
  await selectLayer(page, 'Clip');
  await expect(page.getByText('Clipped to Base', { exact: true })).toBeVisible();

  // Adding above the top clipped layer extends the group.
  await addPaintLayer(page);
  await expect(footer(page)).toContainText('Layer added to the clipping group');
  expect(await order(page)).toEqual(['Paint 4', 'Clip', 'Paint 3', 'Base', 'Background']);
  await expect(page.getByText('Clipped to Base', { exact: true })).toBeVisible();

  // Undo removes it without unclipping the rest.
  await undo(page);
  expect(await order(page)).toEqual(['Clip', 'Paint 3', 'Base', 'Background']);
  await selectLayer(page, 'Clip');
  await expect(page.getByText('Clipped to Base', { exact: true })).toBeVisible();

  // A free layer above an unclipped one is not clipped.
  await selectLayer(page, 'Background');
  await addPaintLayer(page);
  await expect(footer(page)).toContainText('Layer added');
  await expect(footer(page)).not.toContainText('clipping group');
  await expect(page.getByText(/^Clipped to /)).toHaveCount(0);
});

test('adding and deleting an empty layer reuses the finished composite on a large stack', async ({ page }) => {
  test.setTimeout(240_000);
  // 1500 px crosses the render-worker threshold, so the worker path is tested.
  await menu(page, 'Image', 'Canvas Size…');
  await page.getByLabel('Width (px)').fill('1500');
  await page.getByLabel('Height (px)').fill('1500');
  await page.getByRole('button', { name: 'Apply canvas size', exact: true }).click();
  await expect(canvas(page)).toHaveJSProperty('width', 1500);
  await settled(page);
  for (let index = 0; index < 8; index += 1) await addPaintLayer(page);
  // Two layers with real pixels in the middle of the stack.
  for (const name of ['Paint 3', 'Paint 6']) {
    await selectLayer(page, name);
    await menu(page, 'Filter', 'Clouds');
    await settled(page);
  }
  await selectLayer(page, 'Paint 4');
  const before = await digest(page);

  await clearCompositeMarks(page);
  await addPaintLayer(page);
  const added = await order(page);
  expect(added[added.indexOf('Paint 4') - 1]).toBe('Paint 9');
  expect(await compositeMarks(page)).toContain(true);
  expect((await compositeMarks(page)).filter((final) => !final)).toEqual([]);
  expect(await digest(page)).toBe(before);

  await clearCompositeMarks(page);
  await page.getByRole('button', { name: 'Delete layer', exact: true }).click();
  await settled(page);
  expect(await order(page)).not.toContain('Paint 9');
  expect(await compositeMarks(page)).toContain(true);
  expect((await compositeMarks(page)).filter((final) => !final)).toEqual([]);
  expect(await digest(page)).toBe(before);

  await clearCompositeMarks(page);
  await undo(page);
  expect(await order(page)).toContain('Paint 9');
  await redo(page);
  expect(await order(page)).not.toContain('Paint 9');
  expect((await compositeMarks(page)).filter((final) => !final)).toEqual([]);
  expect(await digest(page)).toBe(before);

  // A pixel change is not served from the cached composite.
  await selectLayer(page, 'Paint 3');
  await clearCompositeMarks(page);
  await page.getByLabel('Layer opacity', { exact: true }).fill('40');
  await settled(page);
  expect(await compositeMarks(page)).toContain(false);
  expect(await digest(page)).not.toBe(before);
});

test('Duplicate Layer puts the copy directly above its source, inside its clipping group', async ({ page }) => {
  for (let index = 0; index < 3; index += 1) await addPaintLayer(page);
  await selectLayer(page, 'Paint 1');
  await menu(page, 'Layer', /^Duplicate Layer/);
  await settled(page);
  expect(await order(page)).toEqual(['Paint 3', 'Paint 2', 'Paint 1 copy', 'Paint 1', 'Background']);
  await expect(page.getByRole('button', { name: 'Select layer Paint 1 copy', exact: true })).toHaveAttribute(
    'data-selected',
    'true',
  );
  await undo(page);
  expect(await order(page)).toEqual(['Paint 3', 'Paint 2', 'Paint 1', 'Background']);
  await redo(page);
  expect(await order(page)).toEqual(['Paint 3', 'Paint 2', 'Paint 1 copy', 'Paint 1', 'Background']);

  // Clip Paint 2 to Paint 1 copy, then duplicate the clipped layer.
  await selectLayer(page, 'Paint 2');
  await page.getByRole('button', { name: 'Create clipping mask', exact: true }).click();
  await expect(footer(page)).toContainText('Clipping mask created from Paint 1 copy');
  await settled(page);
  await menu(page, 'Layer', /^Duplicate Layer/);
  await settled(page);
  expect(await order(page)).toEqual(['Paint 3', 'Paint 2 copy', 'Paint 2', 'Paint 1 copy', 'Paint 1', 'Background']);
  await expect(page.getByText('Clipped to Paint 1 copy', { exact: true })).toBeVisible();
  await selectLayer(page, 'Paint 2');
  await expect(page.getByText('Clipped to Paint 1 copy', { exact: true })).toBeVisible();
  await selectLayer(page, 'Paint 3');
  await expect(page.getByText(/^Clipped to /)).toHaveCount(0);
});

test('reordering a layer under a clipping group reuses the clipped results and matches a cold render', async ({ page }) => {
  test.setTimeout(300_000);
  await menu(page, 'Image', 'Canvas Size…');
  await page.getByLabel('Width (px)').fill('1500');
  await page.getByLabel('Height (px)').fill('1500');
  await page.getByRole('button', { name: 'Apply canvas size', exact: true }).click();
  await expect(canvas(page)).toHaveJSProperty('width', 1500);
  await settled(page);
  for (let index = 0; index < 8; index += 1) await addPaintLayer(page);
  // Paint 4 is a clipping base; Paint 5 is clipped to it and Paint 6, added
  // above the clipped Paint 5, joins the group. Paint 2 is unrelated.
  for (const name of ['Paint 2', 'Paint 4', 'Paint 5']) {
    await selectLayer(page, name);
    await menu(page, 'Filter', 'Clouds');
    await settled(page);
  }
  await page.getByRole('button', { name: 'Create clipping mask', exact: true }).click();
  await expect(footer(page)).toContainText('Clipping mask created from Paint 4');
  await settled(page);
  await addPaintLayer(page);
  await expect(footer(page)).toContainText('Layer added to the clipping group');
  await menu(page, 'Filter', 'Clouds');
  await settled(page);
  await page.getByLabel('Layer opacity', { exact: true }).fill('60');
  await settled(page);

  const clippedHits = () =>
    page.evaluate(() =>
      (performance.getEntriesByName('pixelforge.composite-cache', 'mark') as PerformanceMark[]).reduce(
        (total, mark) => total + ((mark.detail as { clippedHits?: number }).clippedHits ?? 0),
        0,
      ),
    );
  await selectLayer(page, 'Paint 2');
  const before = await digest(page);
  await clearCompositeMarks(page);
  await menu(page, 'Layer', /^Bring to Front/);
  await settled(page);
  expect((await order(page))[0]).toBe('Paint 2');
  // Both clipped layers come from the cache instead of re-rendering the
  // source and base and multiplying their alpha again.
  expect(await clippedHits()).toBeGreaterThanOrEqual(2);
  const moved = await digest(page);
  expect(moved).not.toBe(before);

  await clearCompositeMarks(page);
  await undo(page);
  expect(await clippedHits()).toBeGreaterThanOrEqual(2);
  expect(await digest(page)).toBe(before);
  await redo(page);
  expect(await digest(page)).toBe(moved);

  // Cached and cold renders agree.
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device', {
    timeout: 30_000,
  });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await settled(page);
  expect(await digest(page)).toBe(moved);
});
