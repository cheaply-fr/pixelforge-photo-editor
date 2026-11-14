import { expect, test, type Page } from '@playwright/test';
import { clickCanvas, dragOnCanvas, highlight, menu, openEditor, openSample, selectTool, shoot } from './helpers';

// Shapes and paths screenshots (help/articles: shape-tools, custom-shapes,
// pen-tools, edit-paths-and-anchors, paths-and-work-paths, stroke-path, vector-masks).

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const settle = (page: Page) => expect(canvas(page)).toHaveAttribute('data-rendering', 'false');

/** Click a sequence of canvas points with the Pen, then click the first one again to close. */
async function penShape(page: Page, points: [number, number][]) {
  for (const point of points) {
    await clickCanvas(page, point);
    await page.waitForTimeout(80);
  }
  await clickCanvas(page, points[0]);
  await settle(page);
}

test('shape-polygon-star', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Polygon');
  await page.getByRole('combobox', { name: 'Polygon variant', exact: true }).selectOption({ label: 'Star' });
  await page.getByRole('combobox', { name: 'Shape stroke', exact: true }).selectOption({ label: 'Background colour' });
  await dragOnCanvas(page, [0.55, 0.12], [0.8, 0.5]);
  await settle(page);
  await highlight(page.getByRole('group', { name: 'Shape fill and stroke', exact: true }));
  await shoot(page, 'shape-polygon-star');
});

test('custom-shape-library', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Custom Shape');
  await page.getByRole('radio', { name: 'Speech Bubble', exact: true }).check();
  await page.getByRole('textbox', { name: 'Drawing color', exact: true }).fill('#ffffff');
  await dragOnCanvas(page, [0.55, 0.1], [0.85, 0.45]);
  await settle(page);
  await highlight(page.getByRole('radiogroup', { name: 'Custom shape', exact: true }));
  await shoot(page, 'custom-shape-library');
});

test('pen-path-anchors', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Pen');
  await page.getByRole('checkbox', { name: 'Rubber Band', exact: true }).check();
  for (const point of [[0.3, 0.2], [0.55, 0.15], [0.7, 0.45]] as [number, number][]) {
    await clickCanvas(page, point);
    await page.waitForTimeout(80);
  }
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.55, { steps: 6 });
  await page.waitForTimeout(300);
  await shoot(page, 'pen-path-anchors', canvas(page));
});

test('path-convert-point', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Pen');
  await page.getByRole('combobox', { name: 'Pen mode', exact: true }).selectOption({ label: 'Path (work path, no fill)' });
  await penShape(page, [[0.25, 0.25], [0.6, 0.2], [0.65, 0.6], [0.3, 0.6]]);
  await selectTool(page, 'Convert Point');
  await dragOnCanvas(page, [0.6, 0.2], [0.75, 0.12]);
  await settle(page);
  await shoot(page, 'path-convert-point', canvas(page));
});

test('work-path-layer', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Pen');
  await page.getByRole('combobox', { name: 'Pen mode', exact: true }).selectOption({ label: 'Path (work path, no fill)' });
  await penShape(page, [[0.2, 0.3], [0.45, 0.15], [0.6, 0.5], [0.3, 0.6]]);
  await page.waitForTimeout(300);
  await highlight(page.getByRole('combobox', { name: 'Pen mode', exact: true }), page.getByRole('button', { name: /^Select layer Work Path/ }).first());
  await shoot(page, 'work-path-layer');
});

test('stroke-path-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Pen');
  await page.getByRole('combobox', { name: 'Pen mode', exact: true }).selectOption({ label: 'Path (work path, no fill)' });
  await penShape(page, [[0.2, 0.3], [0.45, 0.15], [0.6, 0.5], [0.3, 0.6]]);
  await page.getByRole('button', { name: 'Stroke Path with Brush…', exact: true }).click();
  await shoot(page, 'stroke-path-dialog', page.getByRole('dialog', { name: 'Stroke Path with Brush' }));
});

test('vector-mask', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await menu(page, 'Layer', 'Layer from Background');
  await settle(page);
  await menu(page, 'Layer', 'Create Vector Mask');
  await settle(page);
  await selectTool(page, 'Direct Selection');
  await dragOnCanvas(page, [0.001, 0.001], [0.35, 0.45]);
  await settle(page);
  await page.waitForTimeout(300);
  await highlight(page.getByRole('button', { name: 'Invert vector mask', exact: true }));
  await shoot(page, 'vector-mask');
});
