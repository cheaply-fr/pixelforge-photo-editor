import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';

// Regressions found while painting a large artwork on the live editor:
// strokes and gradients lost while a trimmed paint layer grows, strokes joined
// across presses, clipping groups, Save Selection…, Edit > Fill…, saved
// selection labels and the "new version" notice.

const WHITE = [255, 255, 255, 255];
const canvas = (page: Page) => page.getByTestId('editor-canvas');
const footer = (page: Page) => page.locator('footer');
const settled = (page: Page) =>
  expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });

async function openEditor(page: Page) {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
}

async function newDocument(page: Page, width: number, height: number) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('New document width (px)').fill(String(width));
  await dialog.getByLabel('New document height (px)').fill(String(height));
  await dialog.getByLabel('Background contents').selectOption('white');
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(canvas(page)).toHaveJSProperty('width', width);
  await settled(page);
}

async function addPaintLayer(page: Page) {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
}

async function setColor(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).evaluate((input: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

const pixels = (page: Page, points: Array<[number, number]>) =>
  canvas(page).evaluate(
    (element: HTMLCanvasElement, list) =>
      list.map(([x, y]) => Array.from(element.getContext('2d')!.getImageData(x, y, 1, 1).data)),
    points,
  );

type Step =
  | { type: 'pointerdown' | 'pointermove' | 'pointerup'; x: number; y: number; id: number; kind?: string; pressure?: number; buttons?: number }
  | { type: 'wait'; ms: number };

/**
 * Dispatch pointer events in document coordinates without yielding between
 * them (except explicit waits), so they arrive before any decode finishes.
 */
async function dispatch(page: Page, steps: Step[]) {
  await canvas(page).scrollIntoViewIfNeeded();
  await canvas(page).evaluate(async (element: HTMLCanvasElement, list) => {
    element.setPointerCapture = () => undefined;
    const rect = element.getBoundingClientRect();
    for (const step of list) {
      if (step.type === 'wait') {
        await new Promise((resolve) => setTimeout(resolve, step.ms));
        continue;
      }
      const up = step.type === 'pointerup';
      element.dispatchEvent(new PointerEvent(step.type, {
        pointerId: step.id,
        pointerType: step.kind ?? 'mouse',
        isPrimary: true,
        bubbles: true,
        button: 0,
        buttons: step.buttons ?? (up ? 0 : 1),
        pressure: up ? 0 : step.pressure ?? 0.5,
        clientX: rect.left + ((step.x + 0.5) / element.width) * rect.width,
        clientY: rect.top + ((step.y + 0.5) / element.height) * rect.height,
      }));
    }
  }, steps);
}

async function brush(page: Page, size: number) {
  await selectTool(page, 'Brush');
  await page.getByLabel('Size', { exact: true }).fill(String(size));
  const hardness = page.getByLabel('Hardness', { exact: true });
  if (await hardness.count()) await hardness.fill('100');
}

async function menu(page: Page, name: string, item: string | RegExp) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', typeof item === 'string' ? { name: item, exact: true } : { name: item }).click();
}

async function marquee(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await selectTool(page, 'Select');
  await dispatch(page, [
    { type: 'pointerdown', x: x0, y: y0, id: 5 },
    { type: 'pointermove', x: (x0 + x1) / 2, y: (y0 + y1) / 2, id: 5 },
    { type: 'pointermove', x: x1, y: y1, id: 5 },
    { type: 'pointerup', x: x1, y: y1, id: 5 },
  ]);
  await expect(footer(page)).toContainText(/selection/i);
}

test.beforeEach(async ({ page }) => openEditor(page));

test('a gradient released before the paint layer is ready is queued and applied', async ({ page }) => {
  await newDocument(page, 400, 200);
  await addPaintLayer(page);
  await selectTool(page, 'Gradient');
  await setColor(page, 'Drawing color', '#0000ff');
  await page.getByLabel('Gradient end', { exact: true }).selectOption('transparent');
  // Press, drag and release in one task: the empty (trimmed) layer is still
  // growing and decoding when the release arrives.
  await dispatch(page, [
    { type: 'pointerdown', x: 0, y: 100, id: 3 },
    { type: 'pointermove', x: 200, y: 100, id: 3 },
    { type: 'pointermove', x: 399, y: 100, id: 3 },
    { type: 'pointerup', x: 399, y: 100, id: 3 },
  ]);
  await expect(footer(page)).toContainText('Gradient applied', { timeout: 20_000 });
  await settled(page);
  const [start, middle, end] = await pixels(page, [[2, 100], [200, 100], [397, 100]]);
  expect(start[2]).toBeGreaterThan(240);
  expect(start[0]).toBeLessThan(15);
  expect(middle[0]).toBeGreaterThan(100);
  expect(middle[0]).toBeLessThan(160);
  expect(end[0]).toBeGreaterThan(245);
  // One undo step restores the empty layer.
  await menu(page, 'Edit', /^Undo/);
  await settled(page);
  expect(await pixels(page, [[2, 100]])).toEqual([WHITE]);
});

test('a gradient tap without a drag says how to use the tool', async ({ page }) => {
  await newDocument(page, 200, 100);
  await addPaintLayer(page);
  await selectTool(page, 'Gradient');
  await dispatch(page, [
    { type: 'pointerdown', x: 50, y: 50, id: 3 },
    { type: 'pointerup', x: 50, y: 50, id: 3 },
  ]);
  await expect(footer(page)).toContainText('Gradient: drag from the start point to the end point');
});

test('a fast stroke released before the layer is ready keeps every queued move', async ({ page }) => {
  await newDocument(page, 800, 300);
  await addPaintLayer(page);
  await brush(page, 10);
  await setColor(page, 'Drawing color', '#ff0000');
  const steps: Step[] = [{ type: 'pointerdown', x: 100, y: 150, id: 4 }];
  for (let index = 1; index <= 30; index += 1) steps.push({ type: 'pointermove', x: 100 + index * 20, y: 150, id: 4 });
  steps.push({ type: 'wait', ms: 30 }, { type: 'pointerup', x: 700, y: 150, id: 4 });
  await dispatch(page, steps);
  await expect(footer(page)).toContainText('Paint layer updated', { timeout: 20_000 });
  await settled(page);
  const line = await pixels(page, [[100, 150], [250, 150], [400, 150], [550, 150], [690, 150]]);
  for (const pixel of line) expect(pixel).toEqual([255, 0, 0, 255]);
  // Nothing is painted off the stroke.
  expect(await pixels(page, [[400, 120], [400, 180]])).toEqual([WHITE, WHITE]);
});

test('a new press never continues the previous stroke, across mouse and pen', async ({ page }) => {
  test.setTimeout(120_000);
  // Large enough that decoding a stroke start takes a while.
  await newDocument(page, 2000, 1400);
  await brush(page, 12);
  await setColor(page, 'Drawing color', '#ff0000');
  await page.getByLabel(/Pressure affects size/).first().check().catch(() => undefined);
  // Mouse dabs, then (while the last dab is still committing) a hovering pen
  // and a pen stroke elsewhere with pressure.
  await dispatch(page, [
    { type: 'pointerdown', x: 200, y: 200, id: 1 },
    { type: 'pointerup', x: 200, y: 200, id: 1 },
  ]);
  await settled(page);
  await dispatch(page, [
    { type: 'pointerdown', x: 400, y: 200, id: 1 },
    { type: 'pointerup', x: 400, y: 200, id: 1 },
    // The same mouse moves on and a pen hovers before the commit finishes.
    { type: 'pointermove', x: 900, y: 700, id: 1, buttons: 0 },
    { type: 'pointermove', x: 1000, y: 1000, id: 2, kind: 'pen', buttons: 0, pressure: 0 },
  ]);
  await settled(page);
  const pen: Step[] = [{ type: 'pointerdown', x: 1000, y: 1000, id: 2, kind: 'pen', pressure: 0.8 }];
  for (let index = 1; index <= 10; index += 1)
    pen.push({ type: 'wait', ms: 8 }, { type: 'pointermove', x: 1000 + index * 50, y: 1000, id: 2, kind: 'pen', pressure: 0.8 });
  pen.push({ type: 'pointerup', x: 1500, y: 1000, id: 2, kind: 'pen' });
  await dispatch(page, pen);
  await expect(footer(page)).toContainText('Paint layer updated');
  await settled(page);
  const [dab1, dab2, pen0, pen1] = await pixels(page, [[200, 200], [400, 200], [1000, 1000], [1450, 1000]]);
  expect(dab1[0]).toBe(255);
  expect(dab1[1]).toBeLessThan(40);
  expect(dab2[0]).toBe(255);
  expect(dab2[1]).toBeLessThan(40);
  expect(pen0[1]).toBeLessThan(80);
  expect(pen1[1]).toBeLessThan(80);
  // No straight line joins the dabs, the hover path or the pen stroke.
  for (const [x, y] of [[300, 200], [650, 450], [900, 700], [700, 600], [950, 950], [1000, 900]] as Array<[number, number]>)
    expect(await pixels(page, [[x, y]]), `(${x}, ${y})`).toEqual([WHITE]);
});

test('every consecutive clipped layer uses the group base, and arranging keeps clipping', async ({ page }) => {
  await newDocument(page, 300, 200);
  const name = (value: string) => page.getByLabel('Layer name', { exact: true }).fill(value);
  // Base: a filled rectangle on its own layer.
  await addPaintLayer(page);
  await name('Base');
  await marquee(page, 100, 50, 200, 150);
  await setColor(page, 'Drawing color', '#00ff00');
  await page.keyboard.press('Shift+F5');
  await page.getByRole('dialog', { name: 'Fill' }).getByRole('button', { name: 'Fill', exact: true }).click();
  await expect(footer(page)).toContainText('Selection filled');
  await menu(page, 'Select', /^Deselect Ctrl\+D$/);
  await settled(page);
  // Two full-canvas layers above, both clipped. Red is clipped explicitly;
  // Blue is added above the clipped Red, so it joins the group on creation.
  for (const [label, colorValue] of [['Red', '#ff0000'], ['Blue', '#0000ff']] as const) {
    await addPaintLayer(page);
    if (label === 'Blue') await expect(footer(page)).toContainText('Layer added to the clipping group');
    await name(label);
    await setColor(page, 'Drawing color', colorValue);
    await menu(page, 'Edit', /^Fill…/);
    await page.getByRole('dialog', { name: 'Fill' }).getByRole('button', { name: 'Fill', exact: true }).click();
    await expect(footer(page)).toContainText('Layer filled');
    if (label === 'Red') {
      await page.getByRole('button', { name: 'Create clipping mask', exact: true }).click();
      await expect(footer(page)).toContainText('Clipping mask created from Base');
    }
    await settled(page);
  }
  // The second clipped layer shows only inside the base, not over the
  // full-canvas Red layer it sits on.
  await expect(page.getByText('Clipped to Base', { exact: true }).filter({ visible: true })).toBeVisible();
  expect(await pixels(page, [[150, 100], [20, 20], [250, 180]])).toEqual([[0, 0, 255, 255], WHITE, WHITE]);

  // Send Backward inside the group keeps both layers clipped.
  await menu(page, 'Layer', /^Send Backward/);
  await expect(footer(page)).toContainText('Send Backward applied; undo restores the previous order');
  await settled(page);
  await expect(page.getByText('Clipped to Base', { exact: true }).filter({ visible: true })).toBeVisible();
  expect(await pixels(page, [[150, 100], [20, 20]])).toEqual([[255, 0, 0, 255], WHITE]);

  // Bring Forward restores the order; still clipped.
  await menu(page, 'Layer', /^Bring Forward/);
  await settled(page);
  expect(await pixels(page, [[150, 100], [20, 20]])).toEqual([[0, 0, 255, 255], WHITE]);

  // Sending a clipped layer below the base says clipping was released.
  await menu(page, 'Layer', /^Send Backward/);
  await menu(page, 'Layer', /^Send Backward/);
  await expect(footer(page)).toContainText('clipping mask released for Blue');
  await menu(page, 'Edit', /^Undo/);
  await settled(page);
  expect(await pixels(page, [[150, 100], [20, 20]])).toEqual([[255, 0, 0, 255], WHITE]);
});

test('Save Selection… names a selection stored in the document; downloading is separate', async ({ page }) => {
  await newDocument(page, 300, 200);
  await marquee(page, 20, 20, 120, 120);
  let downloaded = false;
  page.on('download', () => { downloaded = true; });
  await menu(page, 'Select', 'Save Selection…');
  const dialog = page.getByRole('dialog', { name: 'Save Selection' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Name for the saved selection').fill('almond');
  await dialog.getByRole('button', { name: 'Save selection', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(footer(page)).toContainText('Selection “almond” saved');
  const panel = page.getByRole('region', { name: 'Saved selections' });
  await expect(panel.getByRole('button', { name: 'Load selection almond', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Rename selection almond', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Delete selection almond', exact: true })).toBeVisible();
  expect(downloaded).toBe(false);

  // A duplicate name is refused in the dialog; Cancel changes nothing.
  await menu(page, 'Select', 'Save Selection…');
  await dialog.getByLabel('Name for the saved selection').fill('Almond');
  await expect(dialog.getByRole('alert')).toContainText('already uses that name');
  await expect(dialog.getByRole('button', { name: 'Save selection', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(panel.getByRole('button', { name: /^Load selection/ })).toHaveCount(1);

  // The saved selection survives a reload with the local draft.
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('region', { name: 'Saved selections' })
    .getByRole('button', { name: 'Load selection almond', exact: true })).toBeVisible();

  // Downloading a selection file is its own explicit command.
  const pending = page.waitForEvent('download');
  await menu(page, 'Select', 'Download Selection File…');
  expect((await pending).suggestedFilename()).toMatch(/\.pixelselection$/);
});

test('Edit > Fill… asks for contents, opacity and mode before filling', async ({ page }) => {
  await newDocument(page, 200, 100);
  await addPaintLayer(page);
  await setColor(page, 'Drawing color', '#ff0000');
  await menu(page, 'Edit', /^Fill…/);
  const dialog = page.getByRole('dialog', { name: 'Fill' });
  await expect(dialog).toBeVisible();
  // Nothing is filled until the dialog is confirmed; Cancel is a no-op.
  expect(await pixels(page, [[100, 50]])).toEqual([WHITE]);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await pixels(page, [[100, 50]])).toEqual([WHITE]);

  // 50% gray at 50% opacity over an empty layer composites to 50% gray on white.
  await menu(page, 'Edit', /^Fill…/);
  await dialog.getByLabel('Fill contents').selectOption('gray');
  await dialog.getByLabel('Fill opacity (%)').fill('150');
  await expect(dialog.getByRole('button', { name: 'Fill', exact: true })).toBeDisabled();
  await dialog.getByLabel('Fill opacity (%)').fill('50');
  await dialog.getByRole('button', { name: 'Fill', exact: true }).click();
  await expect(footer(page)).toContainText('Layer filled');
  await settled(page);
  const [gray] = await pixels(page, [[100, 50]]);
  for (const channel of gray.slice(0, 3)) {
    expect(channel).toBeGreaterThanOrEqual(188);
    expect(channel).toBeLessThanOrEqual(194);
  }

  // Background colour with Multiply over the half-transparent gray layer
  // pixels: W3C multiply with a 50% backdrop is 0.5·cyan + 0.5·(gray×cyan).
  await setColor(page, 'Background color', '#00ffff');
  await page.keyboard.press('Shift+F5');
  await dialog.getByLabel('Fill contents').selectOption('background');
  await dialog.getByLabel('Fill blend mode').selectOption('multiply');
  await dialog.getByRole('button', { name: 'Fill', exact: true }).click();
  await expect(footer(page)).toContainText('Layer filled');
  await settled(page);
  const [multiplied] = await pixels(page, [[100, 50]]);
  expect(multiplied[0]).toBeLessThan(10);
  expect(multiplied[1]).toBeGreaterThanOrEqual(186);
  expect(multiplied[1]).toBeLessThanOrEqual(196);
  expect(multiplied[2]).toBe(multiplied[1]);
});

test('a long-open tab offers a non-blocking reload when a new version is deployed', async ({ page }) => {
  const application = 'pixelforge-photo-editor';
  const notice = page.getByTestId('update-notice');
  // The build that is running is the one being served: no notice.
  await expect(page.getByTestId('release-status')).not.toHaveAttribute('aria-label', /Checking/);
  await expect(notice).toHaveCount(0);

  // A deploy happens; the tab checks when it becomes visible again.
  const next = 'f'.repeat(40);
  await page.route('**/release.json**', (route) => route.fulfill({ json: { application, version: '0.1.1', commit: next } }));
  await page.route('**/api/readyz.json**', (route) =>
    route.fulfill({ json: { ready: true, application, version: '0.1.1', commit: next } }));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('New version available (v0.1.1)');
  const box = (await notice.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);

  // Editing continues while the notice is shown; Later hides it.
  await addPaintLayer(page);
  await page.getByLabel('Layer name', { exact: true }).fill('Keep me');
  await notice.getByRole('button', { name: 'Dismiss new version notice' }).click();
  await expect(notice).toHaveCount(0);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByTestId('release-status')).toHaveAttribute('aria-label', 'v0.1.1. Server online');
  await expect(notice).toHaveCount(0);

  // A later deploy shows it again; Reload keeps the local draft.
  const later = 'e'.repeat(40);
  await page.unroute('**/release.json**');
  await page.route('**/release.json**', (route) => route.fulfill({ json: { application, version: '0.1.2', commit: later } }));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(notice).toContainText('v0.1.2');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  await Promise.all([
    page.waitForEvent('load'),
    notice.getByRole('button', { name: 'Reload', exact: true }).click(),
  ]);
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Layer name', { exact: true })).toHaveValue('Keep me');
});
