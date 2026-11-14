import { expect, test, type Page } from '@playwright/test';
import { clickCanvas, dragOnCanvas, highlight, menu, openEditor, openPanel, openSample, selectTool, shoot } from './helpers';

// Help Center screenshots for the Selections category (help/articles/*selection*).

const toolOptions = (page: Page) => page.getByTestId('tool-options-area');
const canvasWrap = (page: Page) => page.locator('.canvas-wrap');
const dialog = (page: Page) => page.getByRole('dialog');

async function marquee(page: Page, tool: string, from: [number, number], to: [number, number]) {
  await selectTool(page, tool);
  await dragOnCanvas(page, from, to);
  await expect(page.getByTestId('selection-outline')).toBeVisible();
}

async function lassoPath(page: Page, points: [number, number][]) {
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  const at = ([x, y]: [number, number]) => [box.x + box.width * x, box.y + box.height * y] as const;
  await page.mouse.move(...at(points[0]));
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(...at(p), { steps: 8 });
  await page.mouse.up();
}

test('selection-marching-ants', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await marquee(page, 'Elliptical Marquee', [0.58, 0.34], [0.78, 0.66]);
  await highlight(page.getByRole('region', { name: 'Selection options' }));
  await shoot(page, 'selection-marching-ants');
});

test('marquee-fixed-ratio-options', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Rectangular Marquee');
  await page.getByRole('combobox', { name: 'Marquee style' }).selectOption('Fixed Ratio');
  await page.getByRole('spinbutton', { name: 'Marquee ratio width' }).fill('16');
  await page.getByRole('spinbutton', { name: 'Marquee ratio height' }).fill('9');
  await dragOnCanvas(page, [0.15, 0.2], [0.6, 0.6]);
  await expect(page.getByTestId('selection-outline')).toBeVisible();
  await highlight(page.getByTestId('marquee-options'));
  await shoot(page, 'marquee-fixed-ratio-options', page.getByRole('region', { name: 'Selection options' }), { pad: 40 });
});

test('polygonal-lasso-selection', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Polygonal Lasso');
  const pts: [number, number][] = [[0.05, 0.62], [0.2, 0.42], [0.36, 0.55], [0.5, 0.4], [0.62, 0.6], [0.6, 0.8], [0.08, 0.8]];
  for (const p of pts) await clickCanvas(page, p);
  await clickCanvas(page, pts[0]);
  await expect(page.getByTestId('selection-outline')).toBeVisible();
  await shoot(page, 'polygonal-lasso-selection', canvasWrap(page));
});

test('magic-wand-ridge', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Magic Wand');
  await clickCanvas(page, [0.85, 0.64]);
  await expect(page.getByTestId('selection-outline')).toBeVisible();
  await highlight(toolOptions(page));
  await shoot(page, 'magic-wand-ridge');
});

test('quick-selection-stroke', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Quick Selection');
  await dragOnCanvas(page, [0.55, 0.62], [0.88, 0.63], 16);
  await expect(page.getByTestId('selection-outline')).toBeVisible();
  await shoot(page, 'quick-selection-stroke', canvasWrap(page));
});

test('selection-brush-painted', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'portrait');
  await selectTool(page, 'Selection Brush');
  await page.getByRole('spinbutton', { name: 'Size' }).fill('120');
  await page.getByRole('spinbutton', { name: 'Size' }).press('Enter');
  await dragOnCanvas(page, [0.45, 0.3], [0.55, 0.6], 20);
  await expect(page.getByTestId('selection-outline')).toBeVisible();
  await highlight(toolOptions(page));
  await shoot(page, 'selection-brush-painted');
});

test('select-sky-result', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await menu(page, 'Select', 'Sky');
  await expect(page.getByTestId('selection-outline')).toBeVisible();
  await shoot(page, 'select-sky-result', canvasWrap(page));
});

test('color-range-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'city');
  await menu(page, 'Select', 'Color Range…');
  await dialog(page).getByRole('textbox', { name: 'Color Range sample color' }).fill('#ffd27a');
  await shoot(page, 'color-range-dialog', dialog(page));
});

test('color-range-result', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'city');
  await menu(page, 'Select', 'Color Range…');
  await dialog(page).getByRole('textbox', { name: 'Color Range sample color' }).fill('#ffd27a');
  await dialog(page).getByRole('textbox', { name: 'Color Range fuzziness' }).fill('40');
  await dialog(page).getByRole('button', { name: 'Apply Color Range' }).click();
  await expect(page.getByTestId('selection-outline')).toBeVisible();
  await shoot(page, 'color-range-result', canvasWrap(page));
});

test('border-selection-result', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await marquee(page, 'Elliptical Marquee', [0.55, 0.3], [0.8, 0.7]);
  await menu(page, 'Select', 'Border…');
  await dialog(page).getByRole('textbox', { name: 'Selection refinement radius (px)' }).fill('20');
  await dialog(page).getByRole('button', { name: 'Apply selection refinement' }).click();
  await expect(page.locator('footer')).toContainText(/Border/i);
  await shoot(page, 'border-selection-result', canvasWrap(page));
});

test('transform-selection-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await marquee(page, 'Rectangular Marquee', [0.3, 0.3], [0.6, 0.6]);
  await menu(page, 'Select', 'Transform Selection');
  await shoot(page, 'transform-selection-dialog', dialog(page));
});

test('select-and-mask-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'portrait');
  await selectTool(page, 'Lasso');
  await lassoPath(page, [[0.4, 0.2], [0.62, 0.22], [0.66, 0.6], [0.38, 0.62], [0.4, 0.22]]);
  await expect(page.getByTestId('selection-outline')).toBeVisible();
  await menu(page, 'Select', 'Select and Mask…');
  await shoot(page, 'select-and-mask-dialog', dialog(page));
});

test('quick-mask-overlay', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'portrait');
  await marquee(page, 'Elliptical Marquee', [0.38, 0.18], [0.62, 0.68]);
  await page.getByRole('button', { name: 'Quick Mask mode', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Quick Mask options' })).toBeVisible();
  await highlight(page.getByRole('region', { name: 'Quick Mask options' }), page.getByRole('button', { name: 'Quick Mask mode', exact: true }));
  await shoot(page, 'quick-mask-overlay');
});

test('saved-selections-panel', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await marquee(page, 'Elliptical Marquee', [0.58, 0.34], [0.78, 0.66]);
  await menu(page, 'Select', 'Save Selection…');
  await dialog(page).getByRole('textbox', { name: 'Name for the saved selection' }).fill('Sun');
  await dialog(page).getByRole('button', { name: 'Save selection' }).click();
  await openPanel(page, 'Saved selections');
  await shoot(page, 'saved-selections-panel', page.locator('#sidebar-open-panel'));
});

test('fill-dialog-pattern', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'portrait');
  await marquee(page, 'Rectangular Marquee', [0.3, 0.55], [0.7, 0.95]);
  await page.keyboard.press('Shift+F5');
  await dialog(page).getByRole('combobox', { name: 'Fill contents' }).selectOption('Pattern');
  await dialog(page).getByRole('combobox', { name: 'Fill pattern' }).selectOption('Mesh');
  await dialog(page).getByRole('spinbutton', { name: 'Fill pattern tile size (px)' }).fill('24');
  await shoot(page, 'fill-dialog-pattern', dialog(page));
});

test('fill-mesh-result', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'portrait');
  await page.getByRole('textbox', { name: 'Drawing color' }).fill('#111111').catch(() => undefined);
  await marquee(page, 'Rectangular Marquee', [0.3, 0.6], [0.7, 0.98]);
  await page.keyboard.press('Shift+F5');
  await dialog(page).getByRole('combobox', { name: 'Fill contents' }).selectOption('Pattern');
  await dialog(page).getByRole('combobox', { name: 'Fill pattern' }).selectOption('Mesh');
  await dialog(page).getByRole('spinbutton', { name: 'Fill pattern tile size (px)' }).fill('24');
  await dialog(page).getByRole('button', { name: 'Fill', exact: true }).click();
  await expect(page.locator('footer')).toContainText(/fill/i);
  await page.keyboard.press('Control+d');
  await shoot(page, 'fill-mesh-result', canvasWrap(page));
});

test('stroke-selection-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await marquee(page, 'Elliptical Marquee', [0.58, 0.34], [0.78, 0.66]);
  await menu(page, 'Edit', 'Stroke Selection…');
  await dialog(page).getByRole('textbox', { name: 'Stroke width (px)' }).fill('12');
  await dialog(page).getByRole('radio', { name: 'Outside' }).check();
  await shoot(page, 'stroke-selection-dialog', dialog(page));
});

test('stroke-selection-result', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await marquee(page, 'Elliptical Marquee', [0.58, 0.34], [0.78, 0.66]);
  await menu(page, 'Edit', 'Stroke Selection…');
  await dialog(page).getByRole('textbox', { name: 'Stroke width (px)' }).fill('12');
  await dialog(page).getByRole('radio', { name: 'Outside' }).check();
  await dialog(page).getByRole('button', { name: 'Stroke', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await page.keyboard.press('Control+d');
  await shoot(page, 'stroke-selection-result', canvasWrap(page));
});

test('mask-brush-options', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'portrait');
  await marquee(page, 'Elliptical Marquee', [0.3, 0.1], [0.7, 0.8]);
  await menu(page, 'Layer', 'Layer Mask');
  await expect(page.locator('footer')).toContainText(/mask/i);
  await selectTool(page, 'Mask Brush');
  await page.getByRole('spinbutton', { name: 'Size' }).fill('90');
  await page.getByRole('spinbutton', { name: 'Size' }).press('Enter');
  await dragOnCanvas(page, [0.2, 0.85], [0.8, 0.85], 20);
  await highlight(toolOptions(page));
  await shoot(page, 'mask-brush-options');
});

test('selection-mobile @mobile', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape', { w: 1200, h: 900 });
  await marquee(page, 'Elliptical Marquee', [0.55, 0.3], [0.8, 0.7]);
  await shoot(page, 'selection-mobile');
});
