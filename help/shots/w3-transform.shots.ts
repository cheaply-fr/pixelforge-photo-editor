import { expect, test, type Page } from '@playwright/test';
import { clickCanvas, dragOnCanvas, highlight, menu, openEditor, openSample, selectTool, shoot } from './helpers';

// Help Center screenshots for the Transform, crop and view category.

const toolOptions = (page: Page) => page.getByTestId('tool-options-area');
const canvasWrap = (page: Page) => page.locator('.canvas-wrap');
const dialog = (page: Page) => page.getByRole('dialog');

test('move-tool-options', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Move');
  await shoot(page, 'move-tool-options', page.getByRole('region', { name: 'Move tool options' }));
});

test('free-transform-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await page.keyboard.press('Control+t');
  await dialog(page).getByRole('textbox', { name: 'Rotation (degrees) -180 to 180' }).fill('8');
  await shoot(page, 'free-transform-dialog', dialog(page));
});

test('crop-preview', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Crop');
  await dragOnCanvas(page, [0.2, 0.15], [0.85, 0.85]);
  await expect(page.getByTestId('crop-preview-controls')).toBeVisible();
  await highlight(page.getByTestId('crop-preview-controls'), toolOptions(page));
  await shoot(page, 'crop-preview');
});

test('perspective-crop-handles', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'city');
  await selectTool(page, 'Perspective Crop');
  for (const p of [[0.12, 0.45], [0.42, 0.5], [0.44, 0.95], [0.1, 0.92]] as [number, number][]) await clickCanvas(page, p);
  await expect(page.getByTestId('perspective-crop-controls')).toBeVisible();
  await highlight(page.getByTestId('perspective-crop-controls'));
  await shoot(page, 'perspective-crop-handles');
});

test('image-size-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await page.keyboard.press('Alt+Control+i');
  await shoot(page, 'image-size-dialog', dialog(page));
});

test('canvas-size-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await menu(page, 'Image', 'Canvas Size…');
  await shoot(page, 'canvas-size-dialog', dialog(page));
});

test('canvas-size-result', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await menu(page, 'Image', 'Canvas Size…');
  await dialog(page).getByRole('spinbutton', { name: 'Width (px)' }).fill('2000');
  await dialog(page).getByRole('spinbutton', { name: 'Height (px)' }).fill('1300');
  await dialog(page).getByRole('button', { name: 'Apply canvas size' }).click();
  await expect(page.locator('footer')).toContainText('Canvas changed');
  await page.keyboard.press('0');
  await shoot(page, 'canvas-size-result', canvasWrap(page));
});

test('image-menu-rotate', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await menu(page, 'Image');
  await page.getByRole('menuitem', { name: 'Reveal All', exact: true }).scrollIntoViewIfNeeded();
  const items = ['Rotate left', 'Rotate right', 'Rotate 180°', 'Flip horizontal', 'Flip vertical'];
  for (const name of items) await highlight(page.getByRole('menuitem', { name, exact: true }));
  await shoot(page, 'image-menu-rotate', page.getByRole('menu', { name: 'Image menu' }));
});

test('edit-menu-warps', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Rectangular Marquee');
  await dragOnCanvas(page, [0.3, 0.3], [0.6, 0.6]);
  await menu(page, 'Edit');
  const menuBox = page.getByRole('menu', { name: 'Edit menu' });
  await page.getByRole('menuitem', { name: 'Puppet Warp…', exact: true }).scrollIntoViewIfNeeded();
  for (const name of ['Free Transform Ctrl+T', 'Perspective Warp…', 'Puppet Warp…', 'Content-Aware Scale…'])
    await highlight(page.getByRole('menuitem', { name, exact: true }));
  await shoot(page, 'edit-menu-warps', menuBox);
});

test('puppet-warp-result', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'portrait');
  // One pin: the face bends to the right while the rest of the layer stays put.
  page.once('dialog', (d) => d.accept('800,420,160,0'));
  await menu(page, 'Edit', 'Puppet Warp…');
  await expect(page.locator('footer')).toContainText('Puppet Warp applied');
  await shoot(page, 'puppet-warp-result', canvasWrap(page));
});

test('content-aware-scale-result', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Elliptical Marquee');
  await dragOnCanvas(page, [0.6, 0.38], [0.76, 0.62]);
  const answers = ['150', '150'];
  page.on('dialog', (d) => d.accept(answers.shift() ?? ''));
  await menu(page, 'Edit', 'Content-Aware Scale…');
  await expect(page.locator('footer')).toContainText('Content-Aware Scale applied');
  await page.keyboard.press('Control+d');
  await shoot(page, 'content-aware-scale-result', canvasWrap(page));
});

test('slice-preview', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'city');
  await selectTool(page, 'Slice');
  await dragOnCanvas(page, [0.3, 0.4], [0.6, 0.9]);
  await expect(page.getByTestId('slice-preview-controls')).toBeVisible();
  await page.getByRole('textbox', { name: 'Slice name' }).fill('hero-banner');
  await highlight(page.getByTestId('slice-preview-controls'));
  await shoot(page, 'slice-preview');
});

test('frame-preview', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Frame');
  await dragOnCanvas(page, [0.1, 0.1], [0.55, 0.8]);
  await expect(page.getByTestId('frame-preview-controls')).toBeVisible();
  await highlight(page.getByTestId('frame-preview-controls'));
  await shoot(page, 'frame-preview');
});

test('zoom-tool-options', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Zoom');
  await clickCanvas(page, [0.68, 0.5]);
  await clickCanvas(page, [0.68, 0.5]);
  await highlight(page.getByRole('region', { name: 'Zoom options' }), page.getByTestId('zoom-control'));
  await shoot(page, 'zoom-tool-options');
});

test('rotate-view-canvas', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Rotate View');
  await page.getByRole('button', { name: 'Rotate view right 15 degrees' }).click();
  await page.getByRole('button', { name: 'Rotate view right 15 degrees' }).click();
  await highlight(page.getByRole('region', { name: 'Rotate View', exact: true }));
  await shoot(page, 'rotate-view-canvas');
});

test('screen-mode-full', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await menu(page, 'View', 'Full Screen');
  await expect(page.getByRole('button', { name: 'Exit screen mode' })).toBeVisible();
  await highlight(page.getByRole('button', { name: 'Exit screen mode' }));
  await shoot(page, 'screen-mode-full');
});

test('ruler-measure', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Ruler');
  await dragOnCanvas(page, [0.12, 0.6], [0.7, 0.52]);
  await highlight(page.getByRole('region', { name: 'Ruler options' }));
  await shoot(page, 'ruler-measure');
});

test('count-and-notes', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Count');
  for (const p of [[0.08, 0.68], [0.17, 0.62], [0.24, 0.66], [0.31, 0.64], [0.38, 0.62]] as [number, number][]) await clickCanvas(page, p);
  await selectTool(page, 'Note');
  await clickCanvas(page, [0.68, 0.3]);
  await page.keyboard.type('Brighten the sun a little');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await selectTool(page, 'Count');
  await highlight(page.getByRole('region', { name: 'Count options' }));
  await shoot(page, 'count-and-notes');
});

test('color-sampler-list', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Color Sampler');
  for (const p of [[0.5, 0.05], [0.68, 0.5], [0.3, 0.45], [0.8, 0.9]] as [number, number][]) await clickCanvas(page, p);
  await shoot(page, 'color-sampler-list', page.getByRole('region', { name: 'Color Sampler options' }), { pad: 24 });
});

test('crop-mobile @mobile', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape', { w: 1200, h: 900 });
  await selectTool(page, 'Crop');
  await dragOnCanvas(page, [0.15, 0.15], [0.85, 0.85]);
  await expect(page.getByTestId('crop-preview-controls')).toBeVisible();
  await shoot(page, 'crop-mobile');
});
