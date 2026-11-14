import { expect, test, type Page } from '@playwright/test';
import { clearHighlights, clickCanvas, dragOnCanvas, highlight, openEditor, openPanel, openSample, selectTool, shoot } from './helpers';

/** Click a top menu item whose visible name starts with `item` (names include shortcuts). */
async function menuItem(page: Page, top: string, item: string): Promise<void> {
  await page.getByRole('button', { name: top, exact: true }).click();
  await page.getByRole('menuitem', { name: item }).first().click();
}

async function setSlider(page: Page, label: string, value: number): Promise<void> {
  await page.getByRole('slider', { name: label, exact: true }).fill(String(value));
}

async function scrollToText(page: Page, text: string): Promise<void> {
  await page.locator('#sidebar-open-panel').getByText(text, { exact: true }).first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(200);
}

test('adjust-chooser-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await menuItem(page, 'Image', 'Adjustments');
  await shoot(page, 'adjust-chooser-dialog', page.getByRole('dialog'));
});

test('adjust-panel-open', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await openPanel(page, 'Adjust selected layer');
  await setSlider(page, 'Brightness', 115);
  await setSlider(page, 'Saturation', 130);
  await page.getByRole('region', { name: 'Adjust selected layer' }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await highlight(page.getByRole('slider', { name: 'Brightness', exact: true }), page.getByRole('slider', { name: 'Saturation', exact: true }));
  await shoot(page, 'adjust-panel-open');
});

test('adjust-panel-mobile @mobile', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape', { w: 1200, h: 900 });
  await openPanel(page, 'Adjust selected layer');
  await page.getByRole('region', { name: 'Adjust selected layer' }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await shoot(page, 'adjust-panel-mobile');
});

test('levels-sliders', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await openPanel(page, 'Adjust selected layer');
  await setSlider(page, 'Levels black point', 35);
  await setSlider(page, 'Levels white point', 225);
  await setSlider(page, 'Levels gamma', 1.3);
  await scrollToText(page, 'Levels (nondestructive)');
  await shoot(page, 'levels-sliders');
});

test('curves-rgb-editor', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await openPanel(page, 'Adjust selected layer');
  const editor = page.getByRole('group', { name: 'RGB curve editor' });
  await editor.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const graph = editor.locator('.curve-editor__graph');
  const box = (await graph.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.82);
  await page.waitForTimeout(200);
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.15);
  await expect(editor.getByText('2/14 points')).toBeVisible();
  await shoot(page, 'curves-rgb-editor', editor);
});

test('curves-s-curve-result', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await openPanel(page, 'Adjust selected layer');
  const editor = page.getByRole('group', { name: 'RGB curve editor' });
  await editor.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const graph = editor.locator('.curve-editor__graph');
  const box = (await graph.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.85);
  await page.waitForTimeout(200);
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.12);
  await expect(editor.getByText('2/14 points')).toBeVisible();
  await shoot(page, 'curves-s-curve-result');
});

test('hue-saturation-sliders', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await openPanel(page, 'Adjust selected layer');
  await setSlider(page, 'Saturation', 150);
  await setSlider(page, 'Hue', -35);
  await page.getByRole('region', { name: 'Adjust selected layer' }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await highlight(page.getByRole('slider', { name: 'Saturation', exact: true }), page.getByRole('slider', { name: 'Hue', exact: true }));
  await shoot(page, 'hue-saturation-sliders');
});

test('color-balance-sliders', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await openPanel(page, 'Adjust selected layer');
  await setSlider(page, 'Shadows yellow/blue', 40);
  await setSlider(page, 'Highlights yellow/blue', -45);
  await setSlider(page, 'Highlights cyan/red', 25);
  await scrollToText(page, 'Color Balance');
  await shoot(page, 'color-balance-sliders');
});

test('photo-finishing-black-and-white', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await openPanel(page, 'Adjust selected layer');
  await setSlider(page, 'Exposure', 0.6);
  await page.getByRole('checkbox', { name: 'Black and White' }).check();
  await scrollToText(page, 'Photo finishing');
  await shoot(page, 'photo-finishing-black-and-white');
});

test('auto-adjustments-menu', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  const menuEl = page.getByRole('menu', { name: 'Image menu' });
  await highlight(
    menuEl.getByRole('menuitem', { name: /^Auto Tone/ }),
    menuEl.getByRole('menuitem', { name: 'Auto Contrast' }),
    menuEl.getByRole('menuitem', { name: 'Auto Color' }),
  );
  await shoot(page, 'auto-adjustments-menu', menuEl);
});

test('adjustment-layer-added', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await page.getByRole('button', { name: 'Add adjustment layer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select layer Adjustment 1' })).toBeVisible();
  await setSlider(page, 'Hue', 60);
  await page.getByRole('region', { name: 'Layers' }).first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await highlight(
    page.getByRole('button', { name: 'Select layer Adjustment 1' }),
    page.getByRole('button', { name: 'Add adjustment layer', exact: true }),
  );
  await shoot(page, 'adjustment-layer-added');
});

test('adjustment-brush-reveal', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await menuItem(page, 'Layer', 'New Adjustment Layer');
  await expect(page.getByRole('button', { name: 'Select layer Adjustment 1' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Black and White' }).check();
  await selectTool(page, 'Adjustment Brush');
  await page.getByRole('spinbutton', { name: 'Size', exact: true }).fill('260');
  await page.getByRole('spinbutton', { name: 'Size', exact: true }).press('Tab');
  await dragOnCanvas(page, [0.08, 0.2], [0.08, 0.85], 20);
  await dragOnCanvas(page, [0.2, 0.85], [0.2, 0.2], 20);
  await dragOnCanvas(page, [0.32, 0.2], [0.32, 0.85], 20);
  await page.locator('aside').last().evaluate((el) => el.scrollTo({ top: 0 }));
  await clearHighlights(page);
  await highlight(page.getByRole('combobox', { name: 'Adjustment Brush mode' }));
  await shoot(page, 'adjustment-brush-reveal');
});

test('histogram-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await menuItem(page, 'Image', 'Analysis');
  await expect(page.getByRole('dialog', { name: 'Histogram' })).toBeVisible();
  await shoot(page, 'histogram-dialog', page.getByRole('dialog'));
});

test('color-sampler-readout', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Color Sampler');
  await clickCanvas(page, [0.68, 0.5]);
  await clickCanvas(page, [0.2, 0.15]);
  await clickCanvas(page, [0.8, 0.9]);
  await expect(page.getByTestId('color-sampler-row')).toHaveCount(3);
  await highlight(page.getByTestId('color-sampler-options'));
  await shoot(page, 'color-sampler-readout');
});

test('convert-to-profile-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await menuItem(page, 'Edit', 'Convert to Profile…');
  await shoot(page, 'convert-to-profile-dialog', page.getByRole('dialog'));
});

test('image-mode-grayscale', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'city');
  await menuItem(page, 'Image', 'Mode');
  await page.waitForTimeout(800);
  await shoot(page, 'image-mode-grayscale');
});
