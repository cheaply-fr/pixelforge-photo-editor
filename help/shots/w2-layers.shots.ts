import { expect, test, type Page } from '@playwright/test';
import {
  dragOnCanvas,
  highlight,
  openEditor,
  openPanel,
  openPropertiesSheet,
  openSample,
  selectTool,
  shoot,
} from './helpers';

// Help Center screenshots for the Layers category (docs/knowledge-base.md).
// Every document is built in the editor from a generated sample image.

/** Open a top menu and click an item whose name starts with `item` (names include shortcuts). */
async function menu(page: Page, top: string, item?: string): Promise<void> {
  await page.getByRole('button', { name: top, exact: true }).click();
  if (item) {
    const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await page.getByRole('menuitem', { name: new RegExp(`^${escaped}( |$)`) }).click({ timeout: 10_000 });
  }
}

test.setTimeout(60_000);

const layersPanel = (page: Page) => page.getByRole('region', { name: 'Layers' });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const row = (page: Page, name: string) => button(page, `Select layer ${name}`);

/** Add a paint layer holding an orange ellipse (Elliptical Marquee + Fill with Foreground Color). */
async function addEllipseLayer(page: Page, from: [number, number] = [0.3, 0.25], to: [number, number] = [0.62, 0.75]): Promise<void> {
  await button(page, 'Add paint layer').click();
  await selectTool(page, 'Elliptical Marquee');
  await dragOnCanvas(page, from, to);
  await menu(page, 'Edit', 'Fill with Foreground Color');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Deselect Ctrl+D', exact: true }).click();
}

/** Add a solid fill layer with the given colour through Layer > New Fill Layer…. */
async function addFillLayer(page: Page, color: string): Promise<void> {
  await menu(page, 'Layer', 'New Fill Layer…');
  const dialog = page.getByRole('dialog', { name: 'New Solid Fill Layer' });
  await dialog.getByLabel('Fill layer colour').fill(color);
  await dialog.getByRole('button', { name: 'Create Fill Layer' }).click();
  await expect(dialog).toBeHidden();
}

/** A small generated PNG (no personal images) for file pickers. */
async function samplePng(page: Page, hue = 200): Promise<Buffer> {
  const base64 = await page.evaluate((hue) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 420;
    const c = canvas.getContext('2d')!;
    const g = c.createLinearGradient(0, 0, 640, 420);
    g.addColorStop(0, `hsl(${hue},70%,55%)`);
    g.addColorStop(1, `hsl(${hue + 60},70%,35%)`);
    c.fillStyle = g;
    c.fillRect(0, 0, 640, 420);
    c.fillStyle = '#ffffffcc';
    c.font = 'bold 120px sans-serif';
    c.fillText('PF', 200, 260);
    return canvas.toDataURL('image/png').split(',')[1];
  }, hue);
  return Buffer.from(base64, 'base64');
}

async function chooseFile(page: Page, trigger: () => Promise<void>, name: string, hue: number): Promise<void> {
  const buffer = await samplePng(page, hue);
  const chooser = page.waitForEvent('filechooser');
  await trigger();
  await (await chooser).setFiles({ name, mimeType: 'image/png', buffer });
}

test('layers-panel-overview', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await addEllipseLayer(page);
  await button(page, 'Add adjustment layer').click();
  await addFillLayer(page, '#2f6fd6');
  await layersPanel(page).getByLabel('Blend mode').selectOption({ label: 'Overlay' });
  await selectTool(page, 'Move');
  await layersPanel(page).scrollIntoViewIfNeeded();
  await highlight(page.getByTestId('layer-footer'));
  await shoot(page, 'layers-panel-overview', layersPanel(page));
});

test('layers-panel-row-menu', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await addEllipseLayer(page);
  await selectTool(page, 'Move');
  await row(page, 'Paint 1').click({ button: 'right' });
  const rowMenu = page.getByRole('menu', { name: 'Layer options for Paint 1' });
  await expect(rowMenu).toBeVisible();
  const box = (await layersPanel(page).boundingBox())!;
  const menuBox = (await rowMenu.boundingBox())!;
  const top = Math.max(0, Math.min(box.y, menuBox.y) - 12);
  const left = Math.max(0, Math.min(box.x, menuBox.x) - 12);
  await page.waitForTimeout(250);
  await page.screenshot({
    path: 'help/img/layers-panel-row-menu.jpg',
    type: 'jpeg',
    quality: 86,
    clip: { x: left, y: top, width: Math.min(1440 - left, Math.max(box.x + box.width, menuBox.x + menuBox.width) - left + 12), height: Math.min(900 - top, menuBox.y + menuBox.height - top + 24) },
  });
});

test('layers-panel-mobile @mobile', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape', { w: 1200, h: 900 });
  await button(page, 'Add adjustment layer').click();
  await openPropertiesSheet(page);
  await layersPanel(page).scrollIntoViewIfNeeded();
  await shoot(page, 'layers-panel-mobile');
});

test('layer-types-stack', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await addEllipseLayer(page, [0.08, 0.1], [0.3, 0.45]);
  await selectTool(page, 'Rectangle');
  await dragOnCanvas(page, [0.7, 0.12], [0.92, 0.4]);
  await addFillLayer(page, '#7a3a8a');
  await layersPanel(page).getByLabel('Layer opacity').fill('30');
  await button(page, 'Add adjustment layer').click();
  await selectTool(page, 'Move');
  await layersPanel(page).locator('.layer-list').scrollIntoViewIfNeeded();
  await shoot(page, 'layer-types-stack', layersPanel(page).locator('.layer-list'));
});

test('layers-move-to-position', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await addEllipseLayer(page);
  await button(page, 'Add paint layer').click();
  await button(page, 'Add adjustment layer').click();
  await menu(page, 'Layer', 'Move to Position…');
  const dialog = page.getByRole('dialog', { name: 'Move Layer to Position' });
  await dialog.getByLabel('Layer position').fill('3');
  await shoot(page, 'layers-move-to-position', dialog);
});

test('layer-group-row', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await addEllipseLayer(page);
  await addFillLayer(page, '#2f6fd6');
  await row(page, 'Paint 1').click({ modifiers: ['Shift'] });
  await button(page, 'Group active layer').click();
  await selectTool(page, 'Move');
  const group = layersPanel(page).locator('.group-row').first();
  await layersPanel(page).locator('.layer-list').scrollIntoViewIfNeeded();
  await highlight(group);
  await shoot(page, 'layer-group-row', layersPanel(page).locator('.layer-list'));
});

test('layer-mask-result', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await addFillLayer(page, '#1b2a44');
  await selectTool(page, 'Elliptical Marquee');
  await dragOnCanvas(page, [0.25, 0.15], [0.75, 0.85]);
  await button(page, 'Mask from selection').click();
  await layersPanel(page).getByRole('button', { name: 'Invert mask', exact: true }).click();
  await selectTool(page, 'Move');
  await layersPanel(page).getByText('Nondestructive mask active').scrollIntoViewIfNeeded();
  await highlight(layersPanel(page).locator('.layer-mask-actions'));
  await shoot(page, 'layer-mask-result');
});

test('clipping-mask-result', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await addEllipseLayer(page, [0.2, 0.1], [0.8, 0.9]);
  await layersPanel(page).getByLabel('Layer name').fill('Circle');
  await menu(page, 'Layer', 'Send to Back');
  await row(page, 'Background').click();
  await layersPanel(page).getByRole('button', { name: 'Create clipping mask', exact: true }).click();
  await expect(row(page, 'Background')).toHaveAttribute('data-clipped', 'true');
  await selectTool(page, 'Move');
  await layersPanel(page).locator('.layer-list').scrollIntoViewIfNeeded();
  await highlight(row(page, 'Background'));
  await shoot(page, 'clipping-mask-result');
});

test('blend-mode-overlay', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await addFillLayer(page, '#2f6fd6');
  await layersPanel(page).getByLabel('Blend mode').selectOption({ label: 'Color' });
  await layersPanel(page).getByLabel('Layer opacity').fill('70');
  await selectTool(page, 'Move');
  await layersPanel(page).getByLabel('Blend mode').scrollIntoViewIfNeeded();
  await highlight(layersPanel(page).locator('.layer-properties'));
  await shoot(page, 'blend-mode-overlay');
});

test('layer-styles-panel', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await addEllipseLayer(page, [0.35, 0.2], [0.62, 0.7]);
  await selectTool(page, 'Move');
  await openPanel(page, 'Layer styles');
  const panel = page.locator('#sidebar-open-panel');
  await panel.getByLabel('Enable drop shadow').check();
  await panel.getByRole('spinbutton', { name: 'Shadow X', exact: true }).fill('30');
  await panel.getByRole('spinbutton', { name: 'Shadow Y', exact: true }).fill('30');
  await panel.getByRole('spinbutton', { name: 'Shadow Y', exact: true }).press('Enter');
  await panel.getByLabel('Drop shadow opacity').fill('80');
  await panel.getByLabel('Drop shadow blur').fill('30');
  await panel.getByLabel('Enable bevel emboss').check();
  await panel.getByLabel('Enable outline').check();
  await panel.getByLabel('Outline width').fill('6');
  await panel.getByLabel('Enable drop shadow').scrollIntoViewIfNeeded();
  await shoot(page, 'layer-styles-panel');
});

test('smart-object-nested', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await addEllipseLayer(page);
  await addFillLayer(page, '#2f6fd6');
  await layersPanel(page).getByLabel('Blend mode').selectOption({ label: 'Multiply' });
  await row(page, 'Paint 1').click({ modifiers: ['Shift'] });
  await button(page, 'Nest selected layers').click();
  await expect(layersPanel(page).getByText('Embedded source')).toBeVisible();
  await selectTool(page, 'Move');
  await layersPanel(page).scrollIntoViewIfNeeded();
  await highlight(layersPanel(page).getByText('Embedded source'));
  await shoot(page, 'smart-object-nested', layersPanel(page));
});

test('merge-and-flatten-menu', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await addEllipseLayer(page);
  await menu(page, 'Layer');
  const layerMenu = page.getByRole('menu', { name: 'Layer menu' });
  const merge = layerMenu.getByRole('menuitem', { name: 'Merge Layers' });
  await merge.scrollIntoViewIfNeeded();
  await highlight(merge, layerMenu.getByRole('menuitem', { name: 'Merge Visible' }), layerMenu.getByRole('menuitem', { name: 'Flatten Image' }));
  const box = (await merge.boundingBox())!;
  const menuBox = (await layerMenu.boundingBox())!;
  await page.waitForTimeout(250);
  await page.screenshot({
    path: 'help/img/merge-and-flatten-menu.jpg', type: 'jpeg', quality: 86,
    clip: { x: Math.max(0, menuBox.x - 12), y: Math.max(0, box.y - 140), width: menuBox.width + 24, height: 300 },
  });
});

test('artboard-controls', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Frame');
  await dragOnCanvas(page, [0.1, 0.1], [0.55, 0.8]);
  const preview = page.getByTestId('frame-preview-controls');
  await expect(preview).toBeVisible();
  await preview.getByLabel('Artboard name').fill('Square post');
  await page.getByTestId('frame-add').click();
  await selectTool(page, 'Move');
  await expect(page.getByTestId('artboard-controls')).toBeVisible();
  await highlight(page.getByTestId('artboard-controls'));
  await shoot(page, 'artboard-controls');
});

test('artboard-frame-preview', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Frame');
  await dragOnCanvas(page, [0.1, 0.1], [0.55, 0.8]);
  const preview = page.getByTestId('frame-preview-controls');
  await expect(preview).toBeVisible();
  await preview.getByLabel('Artboard name').fill('Square post');
  await highlight(preview);
  await shoot(page, 'artboard-frame-preview');
});

test('find-layers-search', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await addEllipseLayer(page);
  await button(page, 'Add adjustment layer').click();
  await button(page, 'Add paint layer').click();
  await selectTool(page, 'Move');
  await menu(page, 'Select', 'Find Layers');
  await page.getByRole('searchbox', { name: 'Find layers' }).fill('paint');
  await highlight(page.getByRole('searchbox', { name: 'Find layers' }));
  await shoot(page, 'find-layers-search', layersPanel(page).locator('.layer-search-field, .layer-list').first().locator('xpath=..'));
});

test('layers-multi-select', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await addEllipseLayer(page);
  await button(page, 'Add paint layer').click();
  await button(page, 'Add adjustment layer').click();
  await selectTool(page, 'Move');
  await row(page, 'Paint 1').click({ modifiers: ['Control'] });
  await layersPanel(page).scrollIntoViewIfNeeded();
  await highlight(layersPanel(page).locator('.layer-selection-toolbar'));
  await shoot(page, 'layers-multi-select', layersPanel(page));
});

test('reference-image-panel', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await openPanel(page, 'Reference image');
  const panel = page.locator('#sidebar-open-panel');
  await chooseFile(page, () => panel.getByRole('button', { name: 'Place reference image…' }).click(), 'reference-sketch.png', 160);
  await expect(panel.getByTestId('reference-not-exported')).toBeVisible();
  await panel.getByRole('slider', { name: 'Reference opacity' }).fill('45');
  await selectTool(page, 'Move');
  await panel.getByTestId('reference-panel').scrollIntoViewIfNeeded();
  await highlight(panel.getByTestId('reference-panel'));
  await shoot(page, 'reference-image-panel');
});

test('lock-layer-toggle', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await addEllipseLayer(page);
  await selectTool(page, 'Move');
  await layersPanel(page).getByRole('checkbox', { name: 'Lock layer' }).check();
  await expect(row(page, 'Paint 1')).toContainText('locked');
  await layersPanel(page).scrollIntoViewIfNeeded();
  await highlight(row(page, 'Paint 1'), layersPanel(page).locator('.layer-toggles'));
  await shoot(page, 'lock-layer-toggle', layersPanel(page));
});
