import { test, expect } from '@playwright/test';
import { selectTool } from './tool-selection';
import {
  BLUE,
  RED,
  blueLayerWithRedBand,
  brushTool,
  drag,
  editMenu,
  footer,
  openEditor,
  pixel,
  project,
  saved,
  setColor,
  settled,
  transparentPaintLayer,
} from './audit-retouch-helpers';

// Toolbar audit I-20 (History Brush default source and step names), I-22
// (Color Replace Mode / Sampling / Limits) and I-23 (Angle and Diamond
// gradients), on the desktop and mobile projects.

test.beforeEach(async ({ page }) => openEditor(page));

test('History Brush defaults to the opening state, names steps and restores out of the box', async ({ page }) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /^New white document/ }).click();
  await settled(page);
  await brushTool(page, 'Brush', 80);
  await setColor(page, 'Drawing color', '#ff0000');
  await drag(page, [[20, 200], [1180, 200]], 12);
  expect(await pixel(page, 600, 200)).toEqual(RED);
  await brushTool(page, 'History Brush', 60);
  const source = page.getByLabel('History source', { exact: true });
  await expect(source).toHaveValue('0');
  await expect(source.locator('option').first()).toHaveText(/^1\. Opening state · /);
  await expect(source.locator('option').last()).toHaveText(/Pixel edit · /);
  await expect(source.locator('option', { hasText: 'Snapshot' })).toHaveCount(0);
  await page.getByLabel('History opacity', { exact: true }).fill('100');
  await page.getByLabel('History flow', { exact: true }).fill('100');
  // Without choosing a source, a stroke over the red line restores the white
  // opening state there (it used to repaint the current state, changing nothing).
  await drag(page, [[560, 200], [640, 200]]);
  await expect(footer(page)).toContainText(/History Brush restored source 1/);
  expect(await pixel(page, 600, 200)).toEqual([255, 255, 255, 255]);
  expect(await pixel(page, 400, 200)).toEqual(RED);
});

test('Color Replace Color mode keeps luminosity; Normal paints flat; options persist', async ({ page }) => {
  test.setTimeout(90_000);
  await blueLayerWithRedBand(page);
  await selectTool(page, 'Color Replace');
  await page.getByLabel('Size', { exact: true }).fill('60');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await page.getByLabel('Color tolerance', { exact: true }).fill('40');
  await setColor(page, 'Drawing color', '#00ff00');
  await expect(page.getByLabel('Color Replace mode', { exact: true })).toHaveValue('color');
  await expect(page.getByLabel('Color Replace sampling', { exact: true })).toHaveValue('continuous');
  await expect(page.getByLabel('Color Replace limits', { exact: true })).toHaveValue('contiguous');
  await drag(page, [[300, 200], [400, 200]]);
  await expect(footer(page)).toContainText('Color replacement applied');
  // Green hue at the red's luminosity: a dark green, not the flat swatch.
  const [r, g, b] = await pixel(page, 350, 200);
  expect(g).toBeGreaterThan(100);
  expect(g).toBeLessThan(170);
  expect(r).toBeLessThan(30);
  expect(b).toBeLessThan(30);

  await page.getByLabel('Color Replace mode', { exact: true }).selectOption('normal');
  await drag(page, [[700, 200], [800, 200]]);
  expect(await pixel(page, 750, 200)).toEqual([0, 255, 0, 255]);

  // Background Swatch: only the background colour (blue) is replaced.
  await setColor(page, 'Background color', '#0000ff');
  await page.getByLabel('Color Replace sampling', { exact: true }).selectOption('background');
  await page.getByLabel('Color Replace limits', { exact: true }).selectOption('discontiguous');
  await drag(page, [[1000, 230], [1100, 230]]);
  expect(await pixel(page, 1050, 250)).toEqual([0, 255, 0, 255]);
  expect(await pixel(page, 1050, 220)).toEqual(RED);
  expect(await pixel(page, 1050, 400)).toEqual(BLUE);
  await saved(page);
  const file = await project(page);
  expect(file.settings.retouchOptions).toMatchObject({
    colorReplaceMode: 'normal',
    colorReplaceSampling: 'background',
    colorReplaceLimits: 'discontiguous',
  });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Color Replace');
  await expect(page.getByLabel('Color Replace sampling', { exact: true })).toHaveValue('background');
  await expect(page.getByLabel('Color Replace limits', { exact: true })).toHaveValue('discontiguous');
});

test('Gradient Angle and Diamond types render their geometry and persist', async ({ page }) => {
  await transparentPaintLayer(page);
  await selectTool(page, 'Gradient');
  await setColor(page, 'Drawing color', '#ff0000');
  await page.getByLabel('Gradient type', { exact: true }).selectOption('diamond');
  // Diamond: opaque at the start, transparent at the drag distance along
  // either axis (|u| + |v| = length), half way at half the distance.
  await drag(page, [[300, 400], [400, 400]]);
  const centre = await pixel(page, 300, 400), along = await pixel(page, 350, 400), across = await pixel(page, 300, 450);
  expect(centre[3]).toBeGreaterThan(240);
  expect(Math.abs(along[3] - 128)).toBeLessThan(20);
  expect(Math.abs(across[3] - along[3])).toBeLessThan(8);
  expect((await pixel(page, 380, 470))[3]).toBe(0);

  await editMenu(page, /^Undo/);
  await page.getByLabel('Gradient type', { exact: true }).selectOption('angle');
  // Angle: just counter-clockwise of the drag direction is the start colour,
  // just clockwise of it is the end of the sweep (transparent).
  await drag(page, [[600, 400], [900, 400]]);
  const above = await pixel(page, 800, 392), below = await pixel(page, 800, 408), behind = await pixel(page, 400, 400);
  expect(above[0]).toBeGreaterThan(245);
  expect(above[3]).toBeGreaterThan(240);
  expect(below[3]).toBeLessThan(16);
  expect(Math.abs(behind[3] - 128)).toBeLessThan(20);
  await saved(page);
  expect((await project(page)).settings.gradientMode).toBe('angle');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Gradient');
  await expect(page.getByLabel('Gradient type', { exact: true })).toHaveValue('angle');
});
