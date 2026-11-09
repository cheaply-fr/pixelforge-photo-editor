import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

/*
 * Toolbar audit 2026-11: B-01 (marching ants), I-09 (options-bar Feather and
 * marquee Style), I-10 (Delete clears selected pixels) and I-11 (selection
 * status names, flyout labels and checked state).
 * Contract: docs/selection-outline-contract.md.
 */

type Frame = {
  w: number;
  h: number;
  selection?: { shape: string; x: number; y: number; w: number; h: number; feather: number; mask?: string };
};

const saved = async (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');

async function frame(page: Page): Promise<Frame> {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const value = await downloadedProject((await (await pending).path())!);
  return value.history[value.index] as Frame;
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

const outline = (page: Page) => page.getByTestId('selection-outline');

const centre = async (page: Page) => {
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  return page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) =>
    Array.from(canvas.getContext('2d')!.getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data),
  );
};

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await saved(page);
});

test('B-01 marquee selections draw a marching-ants outline that tracks the canvas', async ({ page }) => {
  await expect(outline(page)).toHaveCount(0);
  await selectTool(page, 'Rectangular Marquee');
  await dragCanvas(page, [0.2, 0.2], [0.6, 0.7]);
  await expect(page.locator('footer')).toContainText('Rectangular selection created');
  await expect(outline(page)).toBeVisible();
  // A rectangle is exactly four merged boundary runs.
  await expect(outline(page)).toHaveAttribute('data-segments', '4');
  const style = await outline(page).evaluate((svg) => ({
    pointer: getComputedStyle(svg).pointerEvents,
    inWrap: Boolean(svg.closest('[data-testid="canvas-wrap"]')),
    viewBox: svg.getAttribute('viewBox'),
    path: svg.querySelector('.selection-outline-ants')!.getAttribute('d'),
  }));
  expect(style.pointer).toBe('none');
  expect(style.inWrap).toBe(true);
  const { w, h } = await frame(page);
  expect(style.viewBox).toBe(`0 0 ${w} ${h}`);
  expect(style.path).toMatch(/^M\d+ \d+H\d+/);

  // The overlay is laid over the canvas element at every zoom.
  for (const key of ['1', '0']) {
    await page.keyboard.press(key);
    await expect(async () => {
      const canvas = (await page.getByTestId('editor-canvas').boundingBox())!;
      const svg = (await outline(page).boundingBox())!;
      expect(Math.abs(svg.x - canvas.x)).toBeLessThan(2);
      expect(Math.abs(svg.width - canvas.width)).toBeLessThan(2);
      expect(Math.abs(svg.height - canvas.height)).toBeLessThan(2);
    }).toPass();
  }

  // Elliptical marquee: many runs; Deselect removes the outline.
  await selectTool(page, 'Elliptical Marquee');
  await dragCanvas(page, [0.25, 0.25], [0.75, 0.75]);
  await expect(page.locator('footer')).toContainText('Elliptical selection created');
  await expect.poll(async () => Number(await outline(page).getAttribute('data-segments'))).toBeGreaterThan(8);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Deselect Ctrl\+D$/ }).click();
  await expect(outline(page)).toHaveCount(0);
});

test('B-01 ants animate unless reduced motion is requested and hide in Quick Mask', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await selectTool(page, 'Rectangular Marquee');
  await dragCanvas(page, [0.3, 0.3], [0.6, 0.6]);
  const ants = outline(page).locator('.selection-outline-ants');
  await expect(ants).toHaveCSS('animation-name', 'selection-ants');
  await expect(ants).toHaveCSS('stroke-dasharray', /4(px)?,? 4(px)?/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(ants).toHaveCSS('animation-name', 'none');
  // Static dashes remain visible with reduced motion.
  await expect(ants).toHaveCSS('stroke-dasharray', /4(px)?,? 4(px)?/);

  await page.getByTestId('editor-canvas').focus().catch(() => undefined);
  await page.keyboard.press('q');
  await expect(page.getByTestId('quick-mask-overlay')).toBeVisible();
  await expect(outline(page)).toHaveCount(0);
  await page.keyboard.press('q');
  await expect(page.getByTestId('quick-mask-overlay')).toHaveCount(0);
  await expect(page.locator('footer')).toContainText('Quick Mask converted to selection');
  await expect(outline(page)).toBeVisible();
});

test('B-01 a selection restored from the draft shows its outline after reload', async ({ page }) => {
  await selectTool(page, 'Rectangular Marquee');
  await dragCanvas(page, [0.1, 0.1], [0.4, 0.5]);
  await expect(outline(page)).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(outline(page)).toBeVisible();
  await expect(outline(page)).toHaveAttribute('data-segments', '4');
});

test('I-10 Delete clears selected pixels in one undoable step, not while typing', async ({ page }) => {
  const before = await centre(page);
  expect(before[3]).toBe(255);
  await selectTool(page, 'Rectangular Marquee');
  await dragCanvas(page, [0.3, 0.3], [0.7, 0.7]);
  await expect(outline(page)).toBeVisible();

  // Typing in a field never clears pixels.
  await page.getByLabel('Drawing color', { exact: true }).focus();
  await page.keyboard.press('Delete');
  expect(await centre(page)).toEqual(before);

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Delete');
  await expect(page.locator('footer')).toContainText('Selected pixels cleared');
  await expect.poll(async () => (await centre(page)).join()).not.toBe(before.join());
  // Outside the selection the layer is untouched.
  const corner = await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) =>
    Array.from(canvas.getContext('2d')!.getImageData(2, 2, 1, 1).data),
  );
  expect(corner[3]).toBe(255);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect.poll(async () => (await centre(page)).join()).toBe(before.join());
  // The selection survives the undo of the clear.
  await expect(outline(page)).toBeVisible();
});

test('I-09 options-bar Feather applies to the next selections and persists; Style constrains the marquee', async ({ page }) => {
  await selectTool(page, 'Rectangular Marquee');
  const options = page.getByTestId('marquee-options');
  await expect(options).toBeVisible();
  const feather = options.getByLabel('Feather (new selections)', { exact: true });
  await feather.fill('12');
  await dragCanvas(page, [0.2, 0.2], [0.5, 0.5]);
  await expect(outline(page)).toBeVisible();
  expect((await frame(page)).selection?.feather).toBe(12);
  // The next selection is feathered too (it does not reset to 0).
  await dragCanvas(page, [0.4, 0.4], [0.8, 0.8]);
  await expect.poll(async () => (await frame(page)).selection?.x).toBeGreaterThan(0);
  expect((await frame(page)).selection?.feather).toBe(12);
  await saved(page);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByTestId('marquee-options').getByLabel('Feather (new selections)', { exact: true })).toHaveValue('12');
  await page.getByTestId('marquee-options').getByLabel('Feather (new selections)', { exact: true }).fill('0');

  // Fixed Size: a click places exactly W × H document pixels.
  await page.getByLabel('Marquee style', { exact: true }).selectOption('fixed-size');
  await page.getByLabel('Marquee size width', { exact: true }).fill('120');
  await page.getByLabel('Marquee size height', { exact: true }).fill('60');
  await dragCanvas(page, [0.1, 0.1], [0.1, 0.1]);
  await expect.poll(async () => (await frame(page)).selection?.w).toBe(120);
  const fixed = (await frame(page)).selection!;
  expect(fixed.h).toBe(60);
  expect(fixed.feather).toBe(0);

  // Fixed Ratio 2:1 follows the drag's larger extent.
  await page.getByLabel('Marquee style', { exact: true }).selectOption('fixed-ratio');
  await page.getByLabel('Marquee ratio width', { exact: true }).fill('2');
  await page.getByLabel('Marquee ratio height', { exact: true }).fill('1');
  await dragCanvas(page, [0.1, 0.1], [0.5, 0.2]);
  await expect.poll(async () => {
    const selection = (await frame(page)).selection!;
    return Math.abs(selection.w / selection.h - 2) < 0.05;
  }).toBe(true);
});

test('I-11 lasso status names, marquee flyout labels and the checked variant', async ({ page }) => {
  await selectTool(page, 'Lasso');
  const canvas = page.getByTestId('editor-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const at = (x: number, y: number) => [box.x + box.width * x, box.y + box.height * y] as const;
  await page.mouse.move(...at(0.3, 0.3));
  await page.mouse.down();
  for (const point of [at(0.6, 0.3), at(0.6, 0.6), at(0.3, 0.6), at(0.3, 0.32)])
    await page.mouse.move(...point, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('footer')).toContainText('Lasso selection created');
  await expect(page.locator('footer')).not.toContainText('Polygonal');
  await expect(outline(page)).toBeVisible();

  const palette = page.getByTestId('tool-palette');
  const marquee = palette.getByRole('button', { name: 'Rectangular Marquee tool', exact: true });
  await marquee.click({ button: 'right' });
  const flyout = page.locator('.tool-flyout[role="menu"]');
  await expect(flyout).toBeVisible();
  const items = flyout.getByRole('menuitem');
  await expect(items).toHaveText(['Rectangular Marquee', 'Elliptical Marquee', 'Single Row Marquee', 'Single Column Marquee'].map((label) => new RegExp(`^${label}`)));
  await flyout.getByRole('menuitem', { name: 'Single Row Marquee', exact: true }).click();
  await expect(palette.getByRole('button', { name: 'Single Row Marquee tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await palette.getByRole('button', { name: 'Single Row Marquee tool', exact: true }).click({ button: 'right' });
  await expect(flyout.getByRole('menuitem', { name: 'Single Row Marquee', exact: true })).toHaveAttribute('aria-current', 'true');
  await expect(flyout.locator('[aria-current="true"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  // The shape family's representative is named after its tool.
  await selectTool(page, 'Rectangle');
  await expect(palette.getByRole('button', { name: 'Rectangle tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
