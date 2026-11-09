import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';
import {
  BLUE,
  RED,
  altClick,
  blueLayerWithRedBand,
  brushTool,
  canvas,
  click,
  deselect,
  drag,
  footer,
  openEditor,
  pixel,
  project,
  saved,
  selectRect,
  settled,
} from './audit-retouch-helpers';

// Toolbar audit I-16 (Clone Stamp Aligned / Sample) and I-17 (Pattern Stamp
// pattern from selection / Aligned), on the desktop and mobile projects.

test.beforeEach(async ({ page }) => openEditor(page));

test('Clone Aligned keeps the offset between strokes; unaligned strokes restart at the source', async ({ page }) => {
  await blueLayerWithRedBand(page);
  await brushTool(page, 'Clone', 40);
  await expect(page.getByLabel('Clone aligned', { exact: true })).toBeChecked();
  await altClick(page, 100, 200);
  await expect(footer(page)).toContainText('Clone source set');
  // First stroke copies the red band (offset 0, −200).
  await drag(page, [[100, 400], [300, 400]]);
  await expect(footer(page)).toContainText('Clone stroke applied');
  expect(await pixel(page, 200, 400)).toEqual(RED);
  // Aligned: a stroke elsewhere keeps that offset and reads blue row 400.
  await drag(page, [[700, 600], [800, 600]]);
  expect(await pixel(page, 750, 600)).toEqual(BLUE);

  await page.getByLabel('Clone aligned', { exact: true }).uncheck();
  // Unaligned: the stroke starts again at the source point on the band.
  await drag(page, [[700, 600], [800, 600]]);
  expect(await pixel(page, 750, 600)).toEqual(RED);
  await saved(page);
  const file = await project(page);
  expect(file.settings.retouchOptions).toMatchObject({ cloneAligned: false });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Clone');
  await expect(page.getByLabel('Clone aligned', { exact: true })).not.toBeChecked();
});

test('Clone Sample reads the current layer, current and below, or all layers', async ({ page }) => {
  await blueLayerWithRedBand(page);
  // An empty paint layer on top: only the layer below holds the red band.
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await brushTool(page, 'Clone', 40);
  await page.getByLabel('Clone aligned', { exact: true }).uncheck();
  await page.getByLabel('Clone sample', { exact: true }).selectOption('all');
  await altClick(page, 100, 200);
  await expect(footer(page)).toContainText('Clone source set');
  await drag(page, [[500, 400], [700, 400]]);
  expect(await pixel(page, 600, 400)).toEqual(RED);

  await page.getByLabel('Clone sample', { exact: true }).selectOption('current');
  await drag(page, [[500, 600], [700, 600]]);
  // The empty current layer has nothing to copy: the blue below shows.
  expect(await pixel(page, 600, 600)).toEqual(BLUE);

  await page.getByLabel('Clone sample', { exact: true }).selectOption('below');
  await drag(page, [[500, 700], [700, 700]]);
  expect(await pixel(page, 600, 700)).toEqual(RED);
  await saved(page);
  const file = await project(page);
  expect(file.settings.retouchOptions).toMatchObject({ cloneSample: 'below', cloneAligned: false });
  await editMenu(page);
  expect(await pixel(page, 600, 700)).toEqual(BLUE);
});

async function editMenu(page: Page) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await settled(page);
}

/** The composite column x, from y − 45 to y + 45, as 'R'/'B'/'other' codes. */
const column = (page: Page, x: number, y: number) =>
  canvas(page).evaluate((element: HTMLCanvasElement, point) => {
    const data = element.getContext('2d')!.getImageData(point.x, point.y - 45, 1, 91).data, codes: string[] = [];
    for (let offset = 0; offset < data.length; offset += 4) {
      const [r, g, b] = [data[offset], data[offset + 1], data[offset + 2]];
      codes.push(r > 200 && g < 60 && b < 60 ? 'R' : b > 200 && r < 60 && g < 60 ? 'B' : 'other');
    }
    return codes;
  }, { x, y });

test('Pattern Stamp defines a pattern from a selection and honours Aligned', async ({ page }) => {
  await blueLayerWithRedBand(page);
  await selectTool(page, 'Pattern Stamp');
  await expect(page.getByRole('button', { name: 'Define pattern from selection', exact: true })).toBeDisabled();
  // 40 × 100 px across the band: blue, red, blue rows.
  await selectRect(page, 580, 150, 620, 250);
  await selectTool(page, 'Pattern Stamp');
  await page.getByRole('button', { name: 'Define pattern from selection', exact: true }).click();
  await expect(footer(page)).toContainText(/Selection pattern 1 defined \(\d+×\d+ px\)/);
  await expect(page.getByLabel('Pattern source', { exact: true })).toHaveValue(/^image:/);
  await deselect(page);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await brushTool(page, 'Pattern Stamp', 100);

  // Aligned off: each click restarts the tile at the click point, so two
  // clicks produce the same column relative to their centres.
  await page.getByLabel('Pattern aligned', { exact: true }).uncheck();
  await click(page, 300, 600);
  await click(page, 500, 637);
  const first = await column(page, 300, 600), second = await column(page, 500, 637);
  expect(first).toContain('R');
  expect(first).toContain('B');
  expect(first).not.toContain('other');
  expect(second).toEqual(first);

  // Aligned on: one canvas-wide tiling, so the same offset gives another phase.
  await page.getByLabel('Pattern aligned', { exact: true }).check();
  await click(page, 800, 600);
  await click(page, 1000, 637);
  expect(await column(page, 1000, 637)).not.toEqual(await column(page, 800, 600));

  await saved(page);
  const file = await project(page);
  expect(file.settings.imagePatterns).toHaveLength(1);
  expect(file.settings.retouchOptions).toMatchObject({ patternAligned: true, patternImage: file.settings.imagePatterns![0].id });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Pattern Stamp');
  await expect(page.getByLabel('Pattern source', { exact: true })).toHaveValue(`image:${file.settings.imagePatterns![0].id}`);
  // Choosing a procedural pattern clears the image source.
  await page.getByLabel('Pattern source', { exact: true }).selectOption('stripes');
  await expect(page.getByLabel('Pattern source', { exact: true })).toHaveValue('stripes');
});
