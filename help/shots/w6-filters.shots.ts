import { expect, test, type Locator, type Page } from '@playwright/test';
import { dragOnCanvas, highlight, openEditor, openPanel, openSample, selectTool, shoot } from './helpers';
import { answerPrompt } from '../../tests/browser/prompt-dialog';

// Help Center screenshots for the Filters and effects category (W6).

/** Wait until the canvas has finished re-rendering live filters. */
async function settled(page: Page): Promise<void> {
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });
}

/** Choose an enabled Filter menu command (some labels, like "Blur", are also section headings). */
async function filter(page: Page, item: string): Promise<void> {
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).and(page.locator(':enabled')).first().click();
  await settled(page);
}

/** Set a range slider the way a drag would (React listens to input events). */
async function setRange(target: Locator, value: number): Promise<void> {
  await target.evaluate((element, next) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(next));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

const effects = (page: Page) => page.getByRole('region', { name: 'Filter effects' });

async function filtersPanel(page: Page): Promise<void> {
  await openPanel(page, 'Filters');
  await settled(page);
}

async function slider(page: Page, label: string, value: number): Promise<void> {
  await setRange(page.getByLabel(label, { exact: true }), value);
  await settled(page);
}

test('filter-menu', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Gaussian Blur…', exact: true })).toBeVisible();
  await shoot(page, 'filter-menu');
});

test('filter-effects-panel', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await filter(page, 'Gaussian Blur…');
  await filtersPanel(page);
  await slider(page, 'Blur radius', 14);
  await highlight(effects(page));
  await shoot(page, 'filter-effects-panel');
});

test('filter-selection-region', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Rectangular Marquee');
  await dragOnCanvas(page, [0.08, 0.15], [0.5, 0.85]);
  await filter(page, 'Mosaic…');
  await filtersPanel(page);
  await slider(page, 'Cell size', 32);
  await highlight(page.getByTestId('filter-region'));
  await shoot(page, 'filter-selection-region');
});

test('blur-tilt-shift', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await filter(page, 'Tilt-Shift…');
  await filtersPanel(page);
  await slider(page, 'Effect amount', 100);
  await slider(page, 'Blur radius', 24);
  await slider(page, 'Focus height', 62);
  await slider(page, 'Focus width', 18);
  await shoot(page, 'blur-tilt-shift');
});

test('blur-motion', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'city');
  await filter(page, 'Motion Blur…');
  await filtersPanel(page);
  await slider(page, 'Effect amount', 100);
  await slider(page, 'Blur radius', 40);
  await slider(page, 'Motion angle', 0);
  await shoot(page, 'blur-motion');
});

test('sharpen-unsharp-mask', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'city');
  await filter(page, 'Unsharp Mask…');
  await filtersPanel(page);
  await slider(page, 'Effect amount', 80);
  await slider(page, 'Blur radius', 3);
  await shoot(page, 'sharpen-unsharp-mask', effects(page));
});

test('noise-add-noise', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'portrait');
  await filter(page, 'Add Noise…');
  await filtersPanel(page);
  await slider(page, 'Effect amount', 60);
  await shoot(page, 'noise-add-noise');
});

test('distort-twirl', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await filter(page, 'Twirl…');
  await filtersPanel(page);
  await slider(page, 'Effect amount', 100);
  await slider(page, 'Twirl angle', 160);
  await shoot(page, 'distort-twirl');
});

test('render-clouds', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await filter(page, 'Clouds');
  await filtersPanel(page);
  await shoot(page, 'render-clouds');
});

test('render-tree', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await filter(page, 'Tree…');
  await filtersPanel(page);
  await slider(page, 'Effect amount', 100);
  await slider(page, 'Tree origin X', 22);
  await slider(page, 'Tree origin Y', 80);
  await shoot(page, 'render-tree');
});

test('light-rays-guide', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await filter(page, 'Light Rays…');
  await filtersPanel(page);
  // Put the ray origin on the sun (68 % across, 50 % down a 1600 × 1000 layer).
  await page.getByLabel('Filter center X in pixels', { exact: true }).fill('1088');
  await page.getByLabel('Filter center Y in pixels', { exact: true }).fill('500');
  await settled(page);
  await slider(page, 'Inner radius', 18);
  await slider(page, 'Ray length', 120);
  await shoot(page, 'light-rays-guide');
});

test('light-rays-controls', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await filter(page, 'Light Rays…');
  await filtersPanel(page);
  await shoot(page, 'light-rays-controls', page.getByTestId('light-rays-controls'));
});

test('light-rays-starburst', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'city');
  await filter(page, 'Light Rays…');
  await filtersPanel(page);
  await page.getByLabel('Ray shape', { exact: true }).selectOption('starburst');
  await settled(page);
  await page.getByLabel('Filter center X in pixels', { exact: true }).fill('560');
  await page.getByLabel('Filter center Y in pixels', { exact: true }).fill('260');
  await settled(page);
  await page.getByLabel('Show ray extent guide', { exact: true }).uncheck();
  await settled(page);
  await shoot(page, 'light-rays-starburst');
});

test('lens-flare', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'city');
  await filter(page, 'Lens Flare…');
  await filtersPanel(page);
  await page.getByLabel('Filter center X in pixels', { exact: true }).fill('420');
  await page.getByLabel('Filter center Y in pixels', { exact: true }).fill('240');
  await settled(page);
  await slider(page, 'Effect amount', 90);
  await slider(page, 'Streak angle', 30);
  await shoot(page, 'lens-flare');
});

test('stylize-emboss', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'city');
  await filter(page, 'Emboss…');
  await filtersPanel(page);
  await slider(page, 'Effect amount', 100);
  await slider(page, 'Emboss depth', 3);
  await slider(page, 'Light angle', 135);
  await shoot(page, 'stylize-emboss');
});

test('pixelate-color-halftone', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'portrait');
  await filter(page, 'Color Halftone…');
  await filtersPanel(page);
  await slider(page, 'Effect amount', 100);
  await slider(page, 'Cell size', 18);
  await shoot(page, 'pixelate-color-halftone');
});

test('filter-gallery-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await filter(page, 'Filter Gallery…');
  await expect(page.getByRole('dialog')).toBeVisible();
  await shoot(page, 'filter-gallery-dialog', page.getByRole('dialog'));
});

test('smart-filters-stack', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'portrait');
  await filter(page, 'Mosaic…');
  await filter(page, 'Emboss…');
  await filtersPanel(page);
  await expect(page.getByRole('list', { name: 'Stacked filters' })).toBeVisible();
  await page.getByLabel('Filter stack').scrollIntoViewIfNeeded();
  await highlight(page.getByLabel('Filter stack'));
  await shoot(page, 'smart-filters-stack');
});

test('smart-filters-edit-stacked', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'portrait');
  await filter(page, 'Mosaic…');
  await filter(page, 'Emboss…');
  await filtersPanel(page);
  await page.getByRole('button', { name: 'Edit stacked filter 1. Mosaic', exact: true }).click();
  await expect(page.getByTestId('filter-stack-editing')).toBeVisible();
  await slider(page, 'Cell size', 28);
  await shoot(page, 'smart-filters-edit-stacked', effects(page));
});

test('liquify-twist', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'portrait');
  await filter(page, 'Liquify…');
  await filtersPanel(page);
  await page.getByLabel('Filter center X in pixels', { exact: true }).fill('800');
  await page.getByLabel('Filter center Y in pixels', { exact: true }).fill('420');
  await settled(page);
  await slider(page, 'Effect amount', 100);
  await slider(page, 'Liquify radius', 30);
  await slider(page, 'Liquify angle', 150);
  await shoot(page, 'liquify-twist');
});

test('camera-raw-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await filter(page, 'Camera Raw Filter…');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await setRange(dialog.getByLabel('Shadows', { exact: true }), 35);
  await setRange(dialog.getByLabel('Temperature', { exact: true }), 20);
  await setRange(dialog.getByLabel('Clarity', { exact: true }), 25);
  await shoot(page, 'camera-raw-dialog', dialog);
});

test('lens-correction-panel', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'city');
  await filter(page, 'Lens Correction…');
  await filtersPanel(page);
  await shoot(page, 'lens-correction-panel', effects(page));
});

test('vanishing-point-result', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'city');
  // Map the layer's corners to a narrower top edge: a simple one-plane perspective.
  await filter(page, 'Vanishing Point…');
  await answerPrompt(page, 'Vanishing Point', { 'Target quad': '400,120;1200,120;1590,990;10,990' });
  await expect(page.getByText('Vanishing Point applied locally; undo restores the source asset')).toBeVisible();
  await settled(page);
  await shoot(page, 'vanishing-point-result');
});

test('neural-filters-panel', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'portrait');
  await filter(page, 'Neural Filters…');
  await filtersPanel(page);
  await shoot(page, 'neural-filters-panel', effects(page));
});

test('fade-menu', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Brush');
  await dragOnCanvas(page, [0.2, 0.3], [0.7, 0.4]);
  await settled(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const fade = page.getByRole('menuitem', { name: /^Fade…/ });
  await expect(fade).toBeEnabled();
  await highlight(fade);
  await shoot(page, 'fade-menu');
});

test('fade-live-filter', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await filter(page, 'Gaussian Blur…');
  // Edit > Fade… after a live filter asks for the opacity and stores it on the filter.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Fade…/ }).click();
  await answerPrompt(page, 'Fade Gaussian blur', { 'Fade opacity': '40' });
  await settled(page);
  await filtersPanel(page);
  const faded = page.locator('label.slider', { hasText: 'Faded to (Edit → Fade)' });
  await expect(faded).toBeVisible();
  // Scroll first: the ring is fixed-position, so it must be drawn after the panel settles.
  await effects(page).scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await highlight(faded);
  await shoot(page, 'fade-live-filter', effects(page));
});

test('filters-mobile @mobile', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape', { w: 1200, h: 900 });
  await filter(page, 'Twirl…');
  await filtersPanel(page);
  await shoot(page, 'filters-mobile');
});
