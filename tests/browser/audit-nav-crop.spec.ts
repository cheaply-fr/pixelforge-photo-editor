import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';

// Audit fixes I-12 Crop options, I-13 / B-06 Perspective Crop, I-14 Slice
// Select drag, I-15 / B-07 Frame artboards. Contract:
// docs/navigation-tool-options-contract.md and docs/crop-slice-contract.md.

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const imageSize = (page: Page) => canvas(page).evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height }));
const toClient = async (page: Page, x: number, y: number) => {
  await canvas(page).scrollIntoViewIfNeeded();
  const box = (await canvas(page).boundingBox())!;
  const { w, h } = await imageSize(page);
  return { x: box.x + (x / w) * box.width, y: box.y + (y / h) * box.height };
};
const drag = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }) => {
  const a = await toClient(page, from.x, from.y);
  const b = await toClient(page, to.x, to.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
};
const undo = async (page: Page) => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
};
const cropLabel = (page: Page) => page.getByTestId('crop-preview-controls').locator('span').first();

test('Crop ratio, overlay, W × H resample and resolution options', async ({ page }) => {
  await selectTool(page, 'Crop');
  const options = page.getByTestId('crop-options');
  await expect(page.locator('[data-sidebar-section="tool-options"]')).toHaveAttribute('aria-label', 'Crop options');
  const { w, h } = await imageSize(page);

  await options.getByRole('combobox', { name: 'Crop aspect ratio' }).selectOption('1:1');
  await drag(page, { x: w * 0.1, y: h * 0.1 }, { x: w * 0.7, y: h * 0.5 });
  await expect(cropLabel(page)).toHaveText(/Crop preview · (\d+) × \1 px/);
  // Rule of thirds by default: 4 guides; grid: 14; none: 0.
  await expect(page.locator('.crop-preview-guide')).toHaveCount(4);
  await options.getByRole('combobox', { name: 'Crop overlay' }).selectOption('grid');
  await expect(page.locator('.crop-preview-guide')).toHaveCount(14);
  await options.getByRole('combobox', { name: 'Crop overlay' }).selectOption('none');
  await expect(page.locator('.crop-preview-guide')).toHaveCount(0);
  await page.getByTestId('crop-cancel').click();

  // W × H px resamples the crop to exactly that size and writes the resolution.
  await options.getByRole('combobox', { name: 'Crop aspect ratio' }).selectOption('size');
  await options.getByRole('spinbutton', { name: 'Crop width' }).fill('300');
  await options.getByRole('spinbutton', { name: 'Crop height' }).fill('200');
  await options.getByRole('spinbutton', { name: 'Crop resolution' }).fill('300');
  await options.getByRole('spinbutton', { name: 'Crop resolution' }).blur();
  await drag(page, { x: w * 0.1, y: h * 0.1 }, { x: w * 0.9, y: h * 0.9 });
  await expect(page.getByTestId('crop-preview-controls')).toBeVisible();
  const ratio = await cropLabel(page).textContent();
  const [, cw, ch] = ratio!.match(/(\d+) × (\d+)/)!.map(Number);
  expect(Math.abs(cw / ch - 1.5)).toBeLessThan(0.02);
  await page.getByTestId('crop-apply').click();
  await expect(page.getByText(/^Crop applied: 300 × 200 px \(resampled from/)).toBeVisible();
  await expect.poll(() => imageSize(page)).toEqual({ w: 300, h: 200 });
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const saved = (await downloadedProject((await (await pending).path())!)) as {
    history: Array<{ imageSize?: { resolution: number } }>;
    index: number;
    settings: { navigationTools?: Record<string, unknown> };
  };
  expect(saved.history[saved.index].imageSize?.resolution).toBe(300);
  expect(saved.settings.navigationTools).toMatchObject({ cropRatio: 'size', cropWidth: 300, cropHeight: 200 });
  await undo(page);
  await expect.poll(() => imageSize(page)).toEqual({ w, h });
});

test('Delete Cropped Pixels is a real option and Straighten levels the image in one undo step', async ({ page }) => {
  await selectTool(page, 'Crop');
  const options = page.getByTestId('crop-options');
  const { w, h } = await imageSize(page);
  await expect(options).toContainText('Pixels outside the crop stay on their layers');
  await options.getByRole('checkbox', { name: 'Delete cropped pixels' }).check();
  await expect(options).toContainText('trimmed to the crop');
  await drag(page, { x: w * 0.2, y: h * 0.2 }, { x: w * 0.6, y: h * 0.6 });
  await page.getByTestId('crop-apply').click();
  await expect(page.getByText(/cropped pixels deleted$/)).toBeVisible();
  await undo(page);
  await expect.poll(() => imageSize(page)).toEqual({ w, h });

  await options.getByRole('button', { name: 'Straighten' }).click();
  await expect(options.getByRole('button', { name: 'Straighten' })).toHaveAttribute('aria-pressed', 'true');
  await drag(page, { x: w * 0.2, y: h * 0.5 }, { x: w * 0.8, y: h * 0.42 });
  await expect(page.getByText(/^Straightened \d+\.\d° · crop preview/)).toBeVisible();
  await expect(page.getByTestId('crop-preview-controls')).toBeVisible();
  await expect(options.getByRole('button', { name: 'Straighten' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('crop-cancel').click();
  // The rotation itself is one history step.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Undo/ })).toBeEnabled();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Undo/ })).toBeDisabled();
  await page.keyboard.press('Escape');
});

test('Perspective Crop: hint, rectangle drag, draggable corners and a docked panel', async ({ page }) => {
  await selectTool(page, 'Perspective Crop');
  await expect(page.getByText(/^Perspective Crop: drag a rectangle or click four corners/)).toBeVisible();
  const { w, h } = await imageSize(page);
  await drag(page, { x: w * 0.15, y: h * 0.2 }, { x: w * 0.85, y: h * 0.8 });
  const panel = page.getByTestId('perspective-crop-controls');
  await expect(panel).toBeVisible();
  // The drag is a plain rectangle (no pre-skewed insets).
  const value = (name: string) => panel.getByRole('spinbutton', { name, exact: true }).inputValue().then(Number);
  expect(await value('Top left Y')).toBe(await value('Top right Y'));
  expect(await value('Top left X')).toBe(await value('Bottom left X'));
  expect(await value('Top right X')).toBe(await value('Bottom right X'));
  expect(await value('Bottom left Y')).toBe(await value('Bottom right Y'));
  // The panel is docked in the sidebar and never covers a corner handle.
  expect(await panel.evaluate((element) => Boolean(element.closest('aside.inspector')))).toBe(true);
  for (const corner of ['Top left', 'Top right', 'Bottom right', 'Bottom left']) {
    const point = await toClient(page, await value(`${corner} X`), await value(`${corner} Y`));
    const hit = await page.evaluate(([x, y]) => {
      const element = document.elementFromPoint(x, y);
      return element?.closest('[data-testid="editor-canvas"], .canvas-wrap') ? 'canvas' : element?.className ?? 'none';
    }, [point.x, point.y]);
    expect(hit, corner).toBe('canvas');
  }
  // Drag the top-right handle inwards: only that corner moves.
  const topRight = { x: await value('Top right X'), y: await value('Top right Y') };
  const topLeftBefore = await value('Top left X');
  await drag(page, topRight, { x: topRight.x - w * 0.1, y: topRight.y + h * 0.05 });
  await expect(page.getByText('Perspective crop corner moved · press Enter or Apply')).toBeVisible();
  expect(await value('Top right X')).toBeLessThan(topRight.x - w * 0.05);
  expect(await value('Top left X')).toBe(topLeftBefore);
  await panel.getByTestId('perspective-crop-cancel').click();
  await expect(panel).toHaveCount(0);

  // Four clicks, in any order, define the quad.
  for (const [fx, fy] of [[0.8, 0.75], [0.2, 0.25], [0.25, 0.8], [0.75, 0.2]]) {
    const at = await toClient(page, w * fx, h * fy);
    await page.mouse.click(at.x, at.y);
  }
  await expect(panel).toBeVisible();
  expect(await value('Top left X')).toBeLessThan(await value('Top right X'));
  expect(await value('Top left Y')).toBeLessThan(await value('Bottom left Y'));
  await page.keyboard.press('Enter');
  await expect(panel).toHaveCount(0);
  await expect(page.getByText(/^Perspective crop applied/)).toBeVisible();
});

test('Slice Select drags move and resize a saved slice, each undoable', async ({ page }) => {
  const { w, h } = await imageSize(page);
  await selectTool(page, 'Slice');
  await drag(page, { x: w * 0.2, y: h * 0.2 }, { x: w * 0.5, y: h * 0.5 });
  await page.getByTestId('slice-save').click();
  await expect(page.getByTestId('slice-save')).toHaveText('Update slice');
  await selectTool(page, 'Slice Select');
  // Select, then drag the interior to move it.
  const inside = await toClient(page, w * 0.3, h * 0.3);
  await page.mouse.click(inside.x, inside.y);
  await expect(page.getByText(/^Slice selected:/)).toBeVisible();
  const originalX = Number(await page.locator('.slice-preview-border').getAttribute('x'));
  await drag(page, { x: w * 0.3, y: h * 0.3 }, { x: w * 0.4, y: h * 0.35 });
  await expect(page.getByText(/^Slice moved: slice-1/)).toBeVisible();
  const moved = await page.getByTestId('slice-preview-overlay').locator('.slice-preview-border').evaluate((rect) => ({
    x: Number(rect.getAttribute('x')),
    y: Number(rect.getAttribute('y')),
    width: Number(rect.getAttribute('width')),
  }));
  expect(Math.abs(moved.x - Math.round(w * 0.3))).toBeLessThanOrEqual(Math.max(3, w * 0.01));
  // Drag the right edge to resize.
  const right = moved.x + moved.width;
  await drag(page, { x: right, y: h * 0.4 }, { x: right + w * 0.1, y: h * 0.4 });
  await expect(page.getByText(/^Slice resized: slice-1/)).toBeVisible();
  const resized = Number(await page.locator('.slice-preview-border').getAttribute('width'));
  expect(resized).toBeGreaterThan(moved.width + w * 0.05);
  // Undo first closes the open slice preview, then steps back: resize, move.
  await page.getByTestId('slice-cancel').click();
  await undo(page);
  await undo(page);
  const inPlace = await toClient(page, w * 0.25, h * 0.25);
  await page.mouse.click(inPlace.x, inPlace.y);
  await expect(page.getByText(/^Slice selected: slice-1/)).toBeVisible();
  expect(Number(await page.locator('.slice-preview-border').getAttribute('x'))).toBe(originalX);
});

test('Frame is labelled as an artboard tool and the artboard bar is styled and pinned', async ({ page }) => {
  await selectTool(page, 'Frame');
  await expect(page.getByText('Frame (artboard): drag to add a named artboard viewport')).toBeVisible();
  const { w, h } = await imageSize(page);
  await drag(page, { x: w * 0.1, y: h * 0.1 }, { x: w * 0.5, y: h * 0.5 });
  const preview = page.getByTestId('frame-preview-controls');
  const label = preview.locator('label').filter({ has: page.getByLabel('Artboard name') });
  const gap = await label.evaluate((element) => getComputedStyle(element).columnGap);
  expect(parseFloat(gap)).toBeGreaterThanOrEqual(4);
  const canvasBefore = (await canvas(page).boundingBox())!;
  await page.getByTestId('frame-add').click();
  const bar = page.getByTestId('artboard-controls');
  await expect(bar).toBeVisible();
  const style = await bar.evaluate((element) => {
    const css = getComputedStyle(element);
    const button = getComputedStyle(element.querySelector('button')!);
    return {
      position: css.position,
      fontSize: parseFloat(css.fontSize),
      buttonBorder: button.borderTopWidth,
      buttonBackground: button.backgroundColor,
      height: element.getBoundingClientRect().height,
    };
  });
  expect(style.position).toBe('absolute');
  expect(style.fontSize).toBeLessThanOrEqual(11);
  expect(parseFloat(style.buttonBorder)).toBeGreaterThan(0);
  expect(style.buttonBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(style.height).toBeLessThan(48);
  // The bar overlays the stage instead of pushing the canvas down.
  const canvasAfter = (await canvas(page).boundingBox())!;
  expect(Math.abs(canvasAfter.y - canvasBefore.y)).toBeLessThan(2);
});
