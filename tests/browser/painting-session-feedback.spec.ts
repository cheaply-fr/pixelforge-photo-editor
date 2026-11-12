import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { openPanel } from './sidebar-panels';
import { selectTool } from './tool-selection';

/*
 * Feedback from painting a 2646x4096, 77-layer project:
 * 1. Render filters respect the active selection (src/filterRegion.ts).
 * 2. Lens Flare can fill transparent pixels, so it can sit on its own layer.
 * 3. Adding an empty layer re-presents the kept composite instead of
 *    re-rendering every layer, also after the render worker idled out
 *    (src/presentedComposite.ts).
 * 4. Layer > Move to Position… and the row menu move a layer many rows at once.
 * 5. Family buttons whose sub-tools open only from the flyout show a corner mark.
 */

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const settled = (page: Page, timeout = 30_000) =>
  expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false', { timeout });

async function menu(page: Page, name: string, item: string | RegExp) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', typeof item === 'string' ? { name: item, exact: true } : { name: item }).click();
}

async function dragCanvas(page: Page, from: [number, number], to: [number, number]) {
  const canvas = page.getByTestId('editor-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 6 });
  await page.mouse.up();
}

/** Alpha of the composite at fractional document coordinates. */
const alphaAt = (page: Page, points: Array<[number, number]>) =>
  page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement, list) => {
    const context = canvas.getContext('2d')!;
    return list.map(([x, y]) =>
      context.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data[3]);
  }, points);

async function project(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return (await downloadedProject((await (await pending).path())!)) as {
    history: Array<{ layers: Array<{ id: string; name: string; adjustments: { filterEffects?: Record<string, unknown> } }> }>;
    index: number;
  };
}

const inside: [number, number] = [0.4, 0.4];
const outside: [number, number] = [0.85, 0.85];

test('Render > Clouds fills only the marquee selection of an empty layer', async ({ page }) => {
  test.setTimeout(120_000);
  await menu(page, 'File', 'New transparent document');
  await settled(page);
  await selectTool(page, 'Rectangular Marquee');
  await dragCanvas(page, [0.25, 0.25], [0.55, 0.55]);
  await expect(page.locator('footer')).toContainText('Rectangular selection created');
  await menu(page, 'Filter', 'Clouds');
  await expect(page.locator('footer')).toContainText('inside the selection');
  await settled(page);
  // The default 85% amount gives the filled pixels 85% coverage.
  const [filled, ...clear] = await alphaAt(page, [inside, outside, [0.1, 0.1]]);
  expect(filled).toBeGreaterThan(200);
  expect(clear).toEqual([0, 0]);

  await openPanel(page, 'Filters');
  const note = page.getByTestId('filter-region');
  await expect(note).toContainText('Limited to the rectangular selection');
  const saved = await project(page);
  const effect = saved.history[saved.index].layers.at(-1)!.adjustments.filterEffects!;
  expect(effect).toMatchObject({ type: 'clouds', region: { inverted: false } });
  expect((effect.region as { parts: unknown[] }).parts).toHaveLength(1);

  // Parameter edits keep the region; "Whole layer" lifts it and undo restores it.
  await page.getByLabel('Effect amount', { exact: true }).fill('100');
  await settled(page);
  expect(await alphaAt(page, [inside, outside])).toEqual([255, 0]);
  await note.getByRole('button', { name: 'Whole layer', exact: true }).click();
  await settled(page);
  expect(await alphaAt(page, [inside, outside])).toEqual([255, 255]);
  await menu(page, 'Edit', /^Undo/);
  await settled(page);
  expect(await alphaAt(page, [inside, outside])).toEqual([255, 0]);
});

test('other render filters respect the selection too, and a deselected re-pick covers the layer', async ({ page }) => {
  test.setTimeout(120_000);
  await menu(page, 'File', 'New transparent document');
  await settled(page);
  await selectTool(page, 'Rectangular Marquee');
  await dragCanvas(page, [0.25, 0.25], [0.55, 0.55]);
  await menu(page, 'Filter', 'Difference Clouds');
  await expect(page.locator('footer')).toContainText('inside the selection');
  await settled(page);
  const [inDifference, outDifference] = await alphaAt(page, [inside, outside]);
  expect(inDifference).toBeGreaterThan(200);
  expect(outDifference).toBe(0);
  await menu(page, 'Select', /^Deselect Ctrl\+D$/);
  await menu(page, 'Filter', 'Clouds');
  await settled(page);
  for (const alpha of await alphaAt(page, [inside, outside])) expect(alpha).toBeGreaterThan(200);
});

test('Lens Flare renders onto an empty layer with Fill transparent pixels', async ({ page }) => {
  test.setTimeout(120_000);
  await menu(page, 'File', 'New transparent document');
  await settled(page);
  await menu(page, 'Filter', 'Lens Flare…');
  await openPanel(page, 'Filters');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('lens-flare');
  const fill = page.getByLabel('Fill transparent pixels', { exact: true });
  await expect(fill).toBeChecked();
  await settled(page);
  const [core, corner] = await alphaAt(page, [[0.5, 0.5], [0.02, 0.02]]);
  expect(core).toBeGreaterThan(200);
  expect(corner).toBeLessThan(core);
  const saved = await project(page);
  expect(saved.history[saved.index].layers.at(-1)!.adjustments.filterEffects).toMatchObject({ type: 'lens-flare', flareFill: true });
  // Off: the flare lights only existing pixels, so the empty layer stays empty.
  await fill.uncheck();
  await settled(page);
  expect(await alphaAt(page, [[0.5, 0.5]])).toEqual([0]);
});

test('adding an empty paint layer to a large document re-presents the composite, even after the worker idled', async ({ page }) => {
  test.setTimeout(180_000);
  await menu(page, 'Image', 'Canvas Size…');
  await page.getByLabel('Width (px)').fill('1800');
  await page.getByLabel('Height (px)').fill('1400');
  await page.getByRole('button', { name: 'Apply canvas size', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveJSProperty('width', 1800);
  await settled(page);
  // A stack tall enough for the composite caches (8+ layers), with paint on
  // one layer so the composite is not trivially empty.
  for (let i = 0; i < 8; i += 1) {
    await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
    await settled(page);
  }
  await selectTool(page, 'Brush');
  await dragCanvas(page, [0.3, 0.5], [0.7, 0.5]);
  await settled(page);
  const pixels = () => page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) =>
    Array.from(canvas.getContext('2d')!.getImageData(0, Math.floor(canvas.height / 2), canvas.width, 1).data).join(','));
  const before = await pixels();
  const clear = () => page.evaluate(() => {
    performance.clearMarks('pixelforge.presented-composite');
    performance.clearMarks('pixelforge.composite-cache');
  });
  const presented = () => page.evaluate(() => performance.getEntriesByName('pixelforge.presented-composite', 'mark').length);
  const rows = page.getByRole('button', { name: /^Select layer / });
  const count = await rows.count();

  // Let the persistent render worker idle out, dropping its composite caches.
  await page.evaluate(() => {
    (globalThis as { __PIXELFORGE_WORKER_IDLE_MS__?: number }).__PIXELFORGE_WORKER_IDLE_MS__ = 200;
  });
  await rows.first().click();
  await settled(page);
  await page.waitForTimeout(800);
  await clear();
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await expect(rows).toHaveCount(count + 1);
  await settled(page);
  expect(await presented()).toBe(1);
  expect(await pixels()).toBe(before);

  // Undo (pixel-neutral too) is also instant; a real stroke still renders.
  await clear();
  await menu(page, 'Edit', /^Undo/);
  await expect(rows).toHaveCount(count);
  await settled(page);
  expect(await presented()).toBe(1);
  await selectTool(page, 'Brush');
  await dragCanvas(page, [0.3, 0.6], [0.7, 0.6]);
  await settled(page);
  const after = await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) =>
    canvas.getContext('2d')!.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.6), 1, 1).data[3]);
  expect(after).toBeGreaterThan(0);
});

test('Move to Position moves a layer many rows at once from the Layer menu and the row menu', async ({ page }) => {
  test.setTimeout(120_000);
  const add = page.getByRole('button', { name: 'Add paint layer', exact: true });
  for (let i = 0; i < 8; i += 1) {
    await add.click();
    await settled(page);
  }
  const rows = page.getByRole('button', { name: /^Select layer / });
  await expect(rows).toHaveCount(9);
  const names = () => rows.evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')!.replace(/^Select layer /, '')));
  const initial = await names();
  // Select the layer just above Background (row 8 of 9) and send it to the top.
  const moving = initial[7];
  await rows.nth(7).click();
  await menu(page, 'Layer', 'Move to Position…');
  const dialog = page.getByRole('dialog', { name: 'Move Layer to Position' });
  await expect(dialog).toBeVisible();
  const field = dialog.getByLabel('Layer position');
  await expect(field).toHaveValue('8');
  await field.fill('20');
  await expect(dialog.getByRole('alert')).toContainText('1 to 9');
  await expect(dialog.getByRole('button', { name: 'Move layer' })).toBeDisabled();
  await field.fill('1');
  await dialog.getByRole('button', { name: 'Move layer' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await names())[0]).toBe(moving);
  await expect(page.locator('footer')).toContainText('Moved from position 8 to position 1');
  // One undo step restores the order.
  await menu(page, 'Edit', /^Undo/);
  await expect.poll(names).toEqual(initial);

  // The row menu opens the same dialog for that row.
  const target = initial[1];
  await rows.nth(1).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to Position…', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(field).toHaveValue('2');
  await field.fill('8');
  await field.press('Enter');
  await expect.poll(async () => (await names())[7]).toBe(target);
});

test('family buttons show a corner mark for sub-tools that open only from the flyout', async ({ page }) => {
  const palette = page.getByTestId('tool-palette');
  const brush = palette.getByRole('button', { name: 'Brush tool', exact: true });
  await brush.scrollIntoViewIfNeeded();
  const mark = brush.getByTestId('tool-subtool-indicator');
  await expect(mark).toBeVisible();
  const hidden = Number(await brush.getAttribute('data-hidden-subtools'));
  expect(hidden).toBeGreaterThan(0);
  await expect(brush).toHaveAttribute('title', new RegExp(`${hidden} more tools: right-click or press and hold`));
  // The accessible name and popup semantics are unchanged.
  await expect(brush).toHaveAttribute('aria-haspopup', 'menu');
  const size = await mark.boundingBox();
  expect(size!.width).toBeGreaterThanOrEqual(7);
  // Plain tools carry no mark.
  const move = palette.getByRole('button', { name: 'Move tool', exact: true });
  await expect(move.getByTestId('tool-subtool-indicator')).toHaveCount(0);
  await expect(move).not.toHaveAttribute('data-hidden-subtools', /.*/);
  // The mark is a pointer to the flyout, which still opens from the button.
  await brush.click({ button: 'right' });
  const flyout = page.locator('.tool-flyout[role="menu"]');
  await expect(flyout).toBeVisible();
  await expect(flyout.getByRole('menuitem')).toHaveCount(hidden + 1);
  await page.keyboard.press('Escape');
  await expect(flyout).toBeHidden();
});
