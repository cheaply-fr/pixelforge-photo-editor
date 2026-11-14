import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';
import {
  addPaintLayer,
  footer,
  lassoPath,
  marquee,
  menu,
  newDocument,
  openEditor,
  outlinePath,
  pixels,
  projectFrame,
  setColor,
  setInputColor,
  settled,
  snapshot,
  undo,
  WHITE,
} from './editor-document';

/* Edit > Stroke Selection… (docs/stroke-selection-contract.md), desktop and mobile. */

const RED = [255, 0, 0, 255];
const near = (actual: number[], expected: number[], tolerance = 6) =>
  actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);

async function openStroke(page: Page) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const item = page.getByRole('menuitem', { name: 'Stroke Selection…', exact: true });
  await expect(item).toBeEnabled();
  await item.click();
  const dialog = page.getByRole('dialog', { name: 'Stroke Selection' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function stroke(page: Page, options: { width?: string; position?: 'Inside' | 'Center' | 'Outside'; opacity?: string; mode?: string; color?: string }) {
  const dialog = await openStroke(page);
  if (options.width !== undefined) await dialog.getByLabel('Stroke width (px)').fill(options.width);
  if (options.position) await dialog.getByRole('radio', { name: options.position, exact: true }).check();
  if (options.opacity !== undefined) await dialog.getByLabel('Stroke opacity (%)').fill(options.opacity);
  if (options.mode) await dialog.getByLabel('Stroke blend mode').selectOption(options.mode);
  if (options.color) await setInputColor(page, dialog.getByLabel('Stroke color'), options.color);
  await dialog.getByRole('button', { name: 'Stroke', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(footer(page)).toContainText('Selection stroked');
  await settled(page);
}

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await newDocument(page, 200, 120);
  await addPaintLayer(page);
  await setColor(page, 'Drawing color', '#ff0000');
});

test('inside, center and outside strokes land on the right side of the marquee edge, and each undoes', async ({ page }) => {
  await marquee(page, 40, 30, 160, 90);
  const before = await snapshot(page);
  // The left edge lies between x = 39 and x = 40.
  const row = (xs: number[]) => pixels(page, xs.map((x) => [x, 60] as [number, number]));

  await stroke(page, { width: '4', position: 'Inside' });
  expect(await row([38, 39, 40, 43, 44])).toEqual([WHITE, WHITE, RED, RED, WHITE]);
  expect(await pixels(page, [[100, 60]])).toEqual([WHITE]);
  await undo(page);
  expect(await snapshot(page)).toBe(before);

  await stroke(page, { width: '4', position: 'Center' });
  expect(await row([37, 38, 39, 40, 41, 42])).toEqual([WHITE, RED, RED, RED, RED, WHITE]);
  await undo(page);

  await stroke(page, { width: '4', position: 'Outside' });
  expect(await row([35, 36, 39, 40])).toEqual([WHITE, RED, RED, WHITE]);
  // Outside strokes leave every selected pixel alone.
  expect(await pixels(page, [[40, 31], [159, 89], [100, 60]])).toEqual([WHITE, WHITE, WHITE]);
  await undo(page);
  expect(await snapshot(page)).toBe(before);
});

test('colour, opacity and blend mode apply, and the dialog remembers them', async ({ page }) => {
  await marquee(page, 40, 30, 160, 90);
  await stroke(page, { width: '6', position: 'Inside', opacity: '50', color: '#0000ff' });
  const [half] = await pixels(page, [[42, 60]]);
  expect(near(half, [128, 128, 255, 255], 4)).toBe(true);
  await expect(footer(page)).toContainText('6 px inside, #0000ff');

  // Multiply of red over the half-blue stroke darkens it; over white it is red.
  const dialog = await openStroke(page);
  await expect(dialog.getByLabel('Stroke width (px)')).toHaveValue('6');
  await expect(dialog.getByLabel('Stroke opacity (%)')).toHaveValue('50');
  await expect(dialog.getByRole('radio', { name: 'Inside', exact: true })).toBeChecked();
  await dialog.getByLabel('Stroke opacity (%)').fill('100');
  await dialog.getByLabel('Stroke blend mode').selectOption('multiply');
  await setInputColor(page, dialog.getByLabel('Stroke color'), '#ff0000');
  await dialog.getByRole('button', { name: 'Stroke', exact: true }).click();
  await expect(footer(page)).toContainText('Selection stroked');
  const [multiplied] = await pixels(page, [[42, 60]]);
  expect(multiplied[0]).toBeGreaterThan(110);
  expect(multiplied[0]).toBeLessThan(145);
  expect(multiplied[1]).toBeLessThan(8);
  expect(multiplied[2]).toBeLessThan(8);
});

test('invalid input keeps Stroke disabled and Cancel or Escape change nothing', async ({ page }) => {
  await marquee(page, 40, 30, 160, 90);
  const before = await snapshot(page);
  let dialog = await openStroke(page);
  const submit = dialog.getByRole('button', { name: 'Stroke', exact: true });
  for (const width of ['0', '251', '2.25', 'wide']) {
    await dialog.getByLabel('Stroke width (px)').fill(width);
    await expect(submit).toBeDisabled();
    await expect(dialog.getByRole('alert')).toContainText('Enter a width from 1 to 250 px');
  }
  await dialog.getByLabel('Stroke width (px)').fill('3');
  await dialog.getByLabel('Stroke opacity (%)').fill('0');
  await expect(submit).toBeDisabled();
  await expect(dialog.getByRole('alert')).toContainText('opacity');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  dialog = await openStroke(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await snapshot(page)).toBe(before);
});

test('feathered lasso and compound Add selections are stroked along their composed edge', async ({ page }) => {
  await selectTool(page, 'Lasso');
  await page.getByTestId('marquee-options').getByLabel('Feather (new selections)', { exact: true }).fill('3');
  await lassoPath(page, [{ x: 20, y: 20 }, { x: 90, y: 20 }, { x: 90, y: 100 }, { x: 20, y: 100 }]);
  await expect(footer(page)).toContainText(/selection created/i);
  await settled(page);
  const first = await outlinePath(page);
  await page.getByLabel('Selection mode', { exact: true }).selectOption('add');
  await lassoPath(page, [{ x: 70, y: 40 }, { x: 180, y: 40 }, { x: 180, y: 80 }, { x: 70, y: 80 }], 10);
  await expect.poll(() => outlinePath(page), { timeout: 30_000 }).not.toBe(first);
  await settled(page);
  const frame = await projectFrame(page);
  expect(frame.selection.mask).toBeTruthy();
  // The 3 px feather is already resolved into the composed mask, which is never feathered again.
  expect(frame.selection.feather).toBe(0);

  await stroke(page, { width: '2', position: 'Inside' });
  // Outer edges of the union are stroked: left of the first lasso, right of the second.
  const [left, right, top] = await pixels(page, [[21, 60], [179, 60], [50, 21]]);
  for (const sample of [left, right, top]) expect(sample[0] - sample[1]).toBeGreaterThan(150);
  // The hidden inner edges inside the union are not.
  expect(await pixels(page, [[90, 60], [70, 60], [120, 60]])).toEqual([WHITE, WHITE, WHITE]);
});

test('a subtracted hole gets its own outline and the stroke survives reload', async ({ page }) => {
  await marquee(page, 30, 20, 170, 100);
  await page.getByLabel('Selection mode', { exact: true }).selectOption('subtract');
  await marquee(page, 80, 45, 120, 75);
  await page.getByLabel('Selection mode', { exact: true }).selectOption('replace');
  await stroke(page, { width: '2', position: 'Inside' });
  // Around the hole: the selected pixels next to it are stroked, the hole is not.
  const [besideHole, inHole, outer] = await pixels(page, [[79, 60], [100, 60], [31, 60]]);
  expect(besideHole).toEqual(RED);
  expect(inHole).toEqual(WHITE);
  expect(outer).toEqual(RED);
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  expect(await pixels(page, [[79, 60], [100, 60], [31, 60]])).toEqual([RED, WHITE, RED]);
});

test('Stroke Selection is disabled without a selection and refuses an empty one', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Stroke Selection…', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  // An Intersect with a disjoint marquee leaves an explicit empty selection.
  await marquee(page, 20, 20, 60, 60);
  await page.getByLabel('Selection mode', { exact: true }).selectOption('intersect');
  await marquee(page, 120, 70, 160, 100);
  await page.getByLabel('Selection mode', { exact: true }).selectOption('replace');
  const before = await snapshot(page);
  await menu(page, 'Edit', 'Stroke Selection…');
  await expect(footer(page)).toContainText('No pixels are selected');
  await expect(page.getByRole('dialog', { name: 'Stroke Selection' })).toHaveCount(0);
  expect(await snapshot(page)).toBe(before);
});

test('an Outside stroke of Select All explains that its band lies beyond the canvas', async ({ page }) => {
  await menu(page, 'Select', /^All Ctrl/);
  await settled(page);
  const before = await snapshot(page);
  const dialog = await openStroke(page);
  await dialog.getByRole('radio', { name: 'Outside', exact: true }).check();
  await dialog.getByRole('button', { name: 'Stroke', exact: true }).click();
  await expect(footer(page)).toContainText('Nothing to stroke: an Outside stroke of a selection that fills the canvas lies entirely beyond the canvas edge');
  await expect(footer(page)).not.toContainText('No pixels are selected');
  await settled(page);
  expect(await snapshot(page)).toBe(before);
});
