import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { selectTool } from './tool-selection';
import { openPropertiesSheet } from './sidebar-panels';

// Layer opacity field sync, Layers panel thumbnails, Move tool "Auto-select
// layer" / canvas "select layer at point", and the cached composite of the
// layers above a painted layer. Runs on the desktop and mobile projects.

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const settled = (page: Page) =>
  expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });
const rows = (page: Page) => page.getByRole('button', { name: /^Select layer / });
const label = (page: Page) => page.getByTestId('layer-opacity-label');
const slider = (page: Page) => page.getByLabel('Layer opacity', { exact: true });

/** The visible part of the canvas, in client pixels. */
async function visibleCanvas(page: Page) {
  const box = (await canvas(page).boundingBox())!;
  const viewport = page.viewportSize()!;
  const top = Math.max(box.y, 0) + 8, bottom = Math.min(box.y + box.height, viewport.height) - 8;
  const left = Math.max(box.x, 0) + 8, right = Math.min(box.x + box.width, viewport.width) - 8;
  return { left, right, top, bottom, box };
}

/** A horizontal mouse stroke across the visible canvas at a height fraction. */
async function stroke(page: Page, fraction: number, from = 0.15, to = 0.85) {
  // On phones the page scrolls; bring the canvas back before drawing.
  await canvas(page).evaluate((element) => {
    const box = element.getBoundingClientRect();
    if (box.bottom < 80 || box.top > window.innerHeight - 80) element.scrollIntoView({ block: 'center' });
  });
  const area = await visibleCanvas(page);
  const y = area.top + (area.bottom - area.top) * fraction;
  const x = (t: number) => area.left + (area.right - area.left) * t;
  await page.mouse.move(x(from), y);
  await page.mouse.down();
  for (let step = 1; step <= 8; step += 1) await page.mouse.move(x(from + ((to - from) * step) / 8), y, { steps: 2 });
  await page.mouse.up();
  await settled(page);
}

/** Client point of a document point given as fractions of the visible canvas. */
async function clientAt(page: Page, fx: number, fy: number) {
  const area = await visibleCanvas(page);
  return { x: area.left + (area.right - area.left) * fx, y: area.top + (area.bottom - area.top) * fy };
}

const activeRowName = (page: Page) =>
  page.locator('button.layer-row.selected').getAttribute('aria-label');

test('the Layer opacity slider and its label always show the same value', async ({ page }) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await openPropertiesSheet(page);
  await expect(label(page)).toHaveText('Opacity 100%');
  await slider(page).fill('40');
  await expect(label(page)).toHaveText('Opacity 40%');
  await expect(slider(page)).toHaveAttribute('aria-valuetext', '40%');

  // A value set from script (as browser automation and assistive tools do)
  // bypasses React's change tracking; the label must still follow.
  await slider(page).evaluate((input: HTMLInputElement) => {
    input.value = '0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(label(page)).toHaveText('Opacity 0%');
  await expect(slider(page)).toHaveValue('0');
  await settled(page);

  // The keyboard moves the slider; the label follows.
  await slider(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect(label(page)).toHaveText('Opacity 1%');
  await expect(slider(page)).toHaveValue('1');
  await settled(page);

  // Undo changes the stored opacity: both controls follow, one step at a time
  // (the scripted change was applied once, not twice).
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(label(page)).toHaveText('Opacity 0%');
  await expect(slider(page)).toHaveValue('0');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(label(page)).toHaveText('Opacity 40%');
  await expect(slider(page)).toHaveValue('40');

  // Selecting another layer shows that layer's opacity in both places.
  await rows(page).last().click();
  await expect(label(page)).toHaveText('Opacity 100%');
  await expect(slider(page)).toHaveValue('100');
});

test('raster rows show lazily updated thumbnails without changing their names or layout', async ({ page, isMobile }) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await openPropertiesSheet(page);
  const top = rows(page).first();
  await expect(top).toHaveAccessibleName(/^Select layer /);
  const name = await top.getAttribute('aria-label');
  const thumb = top.getByTestId('layer-thumbnail');
  await expect(thumb).toBeVisible();
  await selectTool(page, 'Brush');
  await stroke(page, 0.4);
  await openPropertiesSheet(page);
  const image = thumb.locator('img');
  // Rows draw thumbnails only while on screen (a long tool panel can push
  // the Layers list below the fold).
  await thumb.scrollIntoViewIfNeeded();
  await expect(thumb).toHaveAttribute('data-thumbnail-state', 'ready', { timeout: 15_000 });
  await expect(image).toHaveAttribute('alt', '');
  const first = await image.getAttribute('src');
  expect(first).toMatch(/^data:image\/png;base64,/);
  // The thumbnail shows the stroke: some pixels are opaque.
  const opaque = await image.evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const probe = document.createElement('canvas');
    probe.width = img.naturalWidth;
    probe.height = img.naturalHeight;
    const context = probe.getContext('2d')!;
    context.drawImage(img, 0, 0);
    const data = context.getImageData(0, 0, probe.width, probe.height).data;
    let count = 0;
    for (let index = 3; index < data.length; index += 4) if (data[index] > 0) count += 1;
    return { count, w: probe.width, h: probe.height };
  });
  expect(opaque.count).toBeGreaterThan(0);
  expect(Math.max(opaque.w, opaque.h)).toBeLessThanOrEqual(56);

  // Another stroke updates it.
  await stroke(page, 0.2, 0.3, 0.7);
  await openPropertiesSheet(page);
  await thumb.scrollIntoViewIfNeeded();
  await expect.poll(() => image.getAttribute('src'), { timeout: 15_000 }).not.toBe(first);
  await expect(top).toHaveAttribute('aria-label', name!);

  // Compact: the thumbnail fits the row and the list does not overflow sideways.
  const box = (await thumb.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(30);
  expect(box.height).toBeLessThanOrEqual(30);
  const rowBox = (await top.boundingBox())!;
  expect(rowBox.height).toBeLessThanOrEqual(isMobile ? 64 : 60);
  const overflow = await page.locator('.layer-list').first().evaluate((list) => list.scrollWidth - list.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Move tool Auto-select layer picks the top layer with pixels under the pointer', async ({ page, isMobile }) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await selectTool(page, 'Brush');
  await stroke(page, 0.5, 0.1, 0.5);
  const painted = await activeRowName(page);
  // Select the bottom layer (Background), then switch to Move.
  await openPropertiesSheet(page);
  await rows(page).last().click();
  await settled(page);
  const background = await activeRowName(page);
  expect(background).not.toBe(painted);
  await selectTool(page, 'Move');
  await openPropertiesSheet(page);
  const option = page.getByLabel('Auto-select layer', { exact: true });
  await expect(option).not.toBeChecked();

  // Off by default: a press keeps the selected layer.
  const onStroke = await clientAt(page, 0.3, 0.5);
  await page.mouse.click(onStroke.x, onStroke.y);
  await settled(page);
  expect(await activeRowName(page)).toBe(background);

  await option.check();
  await page.mouse.click(onStroke.x, onStroke.y);
  await expect.poll(() => activeRowName(page)).toBe(painted);
  await expect(page.locator('footer')).toContainText(`Selected ${painted!.replace(/^Select /, '')}`);
  await settled(page);

  // Away from the stroke only the Background has pixels.
  const offStroke = await clientAt(page, 0.8, 0.15);
  await page.mouse.click(offStroke.x, offStroke.y);
  await expect.poll(() => activeRowName(page)).toBe(background);
  await settled(page);

  // A press-and-drag on the stroke selects its layer and moves it.
  const before = await canvas(page).evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.mouse.move(onStroke.x, onStroke.y);
  await page.mouse.down();
  await page.mouse.move(onStroke.x + 30, onStroke.y + 30, { steps: 6 });
  await page.mouse.up();
  await settled(page);
  await expect.poll(() => activeRowName(page)).toBe(painted);
  expect(await canvas(page).evaluate((c: HTMLCanvasElement) => c.toDataURL())).not.toBe(before);
  if (!isMobile) await expect(option).toBeChecked();
});

test('right-click or long-press with the Move tool selects the layer at that point', async ({ page }) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await selectTool(page, 'Brush');
  await stroke(page, 0.5, 0.1, 0.5);
  const painted = await activeRowName(page);
  await openPropertiesSheet(page);
  await rows(page).last().click();
  await settled(page);
  const background = await activeRowName(page);
  await selectTool(page, 'Move');
  const onStroke = await clientAt(page, 0.3, 0.5);
  const before = await canvas(page).evaluate((c: HTMLCanvasElement) => c.toDataURL());
  // A contextmenu event at the point (mouse right-click or touch long-press).
  const contextMenu = (point: { x: number; y: number }) =>
    canvas(page).evaluate((element, at) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, button: 2 });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }, point);
  const prevented = await contextMenu(onStroke);
  expect(prevented).toBe(true);
  await expect.poll(() => activeRowName(page)).toBe(painted);
  // Selecting never moves pixels.
  await settled(page);
  expect(await canvas(page).evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(before);
  // Away from the stroke only the Background has pixels.
  const offStroke = await clientAt(page, 0.8, 0.15);
  expect(await contextMenu(offStroke)).toBe(true);
  await expect.poll(() => activeRowName(page)).toBe(background);
});

test('painting a low layer reuses the composite of the layers above and matches a full render', async ({ page }) => {
  test.setTimeout(180_000);
  await openPropertiesSheet(page);
  // Background + 8 paint layers (the cache applies from 8 layers).
  for (let index = 0; index < 8; index += 1) {
    await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
    await settled(page);
  }
  await expect(rows(page)).toHaveCount(9);
  await selectTool(page, 'Brush');
  // Panel rows list the top first: row 0 is layer 8, row 7 is layer 1.
  const paintRow = async (row: number, fraction: number) => {
    await openPropertiesSheet(page);
    await rows(page).nth(row).click();
    await settled(page);
    await stroke(page, fraction, 0.1, 0.9);
  };
  // Overlapping strokes above layer 1, some semi-transparent, one Multiply.
  for (const [row, fraction] of [[0, 0.45], [1, 0.5], [2, 0.55], [3, 0.5], [4, 0.45]] as const)
    await paintRow(row, fraction);
  await selectTool(page, 'Move');
  await openPropertiesSheet(page);
  await rows(page).nth(1).click();
  await slider(page).fill('55');
  await settled(page);
  await rows(page).nth(3).click();
  await page.getByLabel('Blend mode', { exact: true }).selectOption('multiply');
  await settled(page);
  await rows(page).nth(2).click();
  await slider(page).fill('70');
  await settled(page);

  // Paint layer 1 (row 7) twice, through the layers above.
  await rows(page).nth(7).click();
  await settled(page);
  await selectTool(page, 'Brush');
  await page.evaluate(() => performance.clearMarks('pixelforge.composite-cache'));
  await stroke(page, 0.5, 0.2, 0.8);
  await stroke(page, 0.48, 0.2, 0.8);
  const reuse = await page.evaluate(() =>
    (performance.getEntriesByName('pixelforge.composite-cache', 'mark') as PerformanceMark[]).map(
      (mark) => mark.detail as { suffixLayers: number; reusedLayers: number },
    ));
  // Above the Multiply layer (row 3 = layer 5), layers 6..8 come from the cache.
  expect(reuse.length).toBeGreaterThan(0);
  expect(reuse.some((item) => item.suffixLayers === 3)).toBe(true);
  expect(reuse.every((item) => item.suffixLayers === 0 || item.suffixLayers === 3)).toBe(true);

  // The cached screen composite equals an independent full render (export).
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Export format').selectOption('png');
  await expect(page.getByLabel('Encoded file size')).toHaveAttribute('data-bytes', /\d+/, { timeout: 15_000 });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download image', exact: true }).click();
  const bytes = await readFile((await (await pending).path())!);
  const diff = await canvas(page).evaluate(async (element: HTMLCanvasElement, base64: string) => {
    const binary = atob(base64);
    const data = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) data[index] = binary.charCodeAt(index);
    const bitmap = await createImageBitmap(new Blob([data], { type: 'image/png' }));
    const probe = document.createElement('canvas');
    probe.width = bitmap.width;
    probe.height = bitmap.height;
    const context = probe.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const exported = context.getImageData(0, 0, probe.width, probe.height).data;
    const shown = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    let max = 0;
    for (let index = 0; index < shown.length; index += 1) max = Math.max(max, Math.abs(shown[index] - exported[index]));
    return { max, size: [bitmap.width, bitmap.height, element.width, element.height] };
  }, bytes.toString('base64'));
  expect(diff.size[0]).toBe(diff.size[2]);
  expect(diff.size[1]).toBe(diff.size[3]);
  expect(diff.max).toBeLessThanOrEqual(2);
});
