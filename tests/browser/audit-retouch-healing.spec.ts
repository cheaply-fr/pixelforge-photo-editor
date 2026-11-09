import { test, expect } from '@playwright/test';
import { selectTool } from './tool-selection';
import {
  BLUE,
  RED,
  blueLayerWithRedBand,
  brushTool,
  click,
  drag,
  editMenu,
  footer,
  openEditor,
  pixel,
  project,
  saved,
  selectRect,
} from './audit-retouch-helpers';

// Toolbar audit I-18 (Spot Healing Type) and I-19 (Patch selection workflow
// with Source / Destination), on the desktop and mobile projects.

test.beforeEach(async ({ page }) => openEditor(page));

/** Healed band pixels turn back to the surrounding blue. */
const healed = (sample: number[]) => sample[2] > 200 && sample[0] < 60;

test('Spot Healing records each Type, heals the band and keeps the choice after reload', async ({ page }) => {
  test.setTimeout(90_000);
  await blueLayerWithRedBand(page, 30);
  await brushTool(page, 'Spot Healing', 60);
  await expect(page.getByLabel('Spot Healing type', { exact: true })).toHaveValue('content-aware');
  await expect(page.getByText(/bounded local context ring/)).toBeVisible();
  const rows: Array<[string, number]> = [['content-aware', 100], ['texture', 500], ['proximity', 900]];
  for (const [type, x] of rows) {
    await page.getByLabel('Spot Healing type', { exact: true }).selectOption(type);
    await drag(page, [[x - 60, 200], [x + 60, 200]]);
    await expect(footer(page)).toContainText('Spot Healing applied nondestructively');
    expect(healed(await pixel(page, x, 200)), `${type} at ${x}`).toBe(true);
  }
  // Untouched band between the strokes.
  expect(await pixel(page, 300, 200)).toEqual(RED);
  await saved(page);
  const file = await project(page);
  const strokes = file.history[file.index].layers.at(-1)!.spotHealing!;
  expect(strokes.map((stroke) => stroke.type)).toEqual(['content-aware', 'texture', 'proximity']);
  expect(file.settings.retouchOptions).toMatchObject({ spotHealingType: 'proximity' });
  await editMenu(page, /^Undo/);
  expect(await pixel(page, 900, 200)).toEqual(RED);
  await editMenu(page, /^Redo/);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(async () => healed(await pixel(page, 500, 200))).toBe(true);
  await selectTool(page, 'Spot Healing');
  await expect(page.getByLabel('Spot Healing type', { exact: true })).toHaveValue('proximity');
});

test('Patch Source: dragging a selection replaces it with the pixels where it is dropped', async ({ page }) => {
  await blueLayerWithRedBand(page);
  // A selection around a piece of the red band (rows 160–240).
  await selectRect(page, 500, 130, 700, 270);
  await brushTool(page, 'Patch', 40);
  await expect(page.getByLabel('Patch mode', { exact: true })).toHaveValue('source');
  await drag(page, [[600, 200], [600, 500]], 10);
  await expect(footer(page)).toContainText('Patch applied nondestructively');
  for (const [x, y] of [[600, 200], [520, 170], [680, 230]])
    expect(await pixel(page, x, y), `${x},${y}`).toEqual(BLUE);
  // Outside the selection the band and the drop area are unchanged.
  expect(await pixel(page, 400, 200)).toEqual(RED);
  expect(await pixel(page, 600, 500)).toEqual(BLUE);
  const file = await project(page);
  const stroke = file.history[file.index].layers.at(-1)!.patchStrokes!.at(-1)!;
  expect(stroke.region).toBe('source');
  expect(stroke.sourceOffset.x).toBe(0);
  expect(Math.abs(stroke.sourceOffset.y - 300)).toBeLessThanOrEqual(2);
  expect(file.assets[stroke.selectionMask!]).toMatchObject({ w: 1200, h: 800 });
  await editMenu(page, /^Undo/);
  expect(await pixel(page, 600, 200)).toEqual(RED);
  await editMenu(page, /^Redo/);
  expect(await pixel(page, 600, 200)).toEqual(BLUE);
});

test('Patch Destination copies the selection to the drop point; Brush keeps the click-and-paint flow', async ({ page }) => {
  await blueLayerWithRedBand(page);
  await selectRect(page, 500, 130, 700, 270);
  await brushTool(page, 'Patch', 40);
  await page.getByLabel('Patch mode', { exact: true }).selectOption('destination');
  await drag(page, [[600, 200], [600, 500]], 10);
  await expect(footer(page)).toContainText('Patch applied nondestructively');
  // The band piece now also appears 300 px lower; the original stays.
  for (const [x, y] of [[600, 500], [520, 470], [680, 530]])
    expect(await pixel(page, x, y), `${x},${y}`).toEqual(RED);
  expect(await pixel(page, 600, 200)).toEqual(RED);
  expect(await pixel(page, 600, 600)).toEqual(BLUE);
  expect(await pixel(page, 750, 500)).toEqual(BLUE);
  const file = await project(page);
  expect(file.history[file.index].layers.at(-1)!.patchStrokes!.at(-1)!.region).toBe('destination');
  expect(file.settings.retouchOptions).toMatchObject({ patchMode: 'destination' });

  // Brush mode inside the selection: click a source, then paint.
  await page.getByLabel('Patch mode', { exact: true }).selectOption('brush');
  await expect(page.getByText(/Click a source area, then drag/)).toBeVisible();
  await click(page, 550, 700);
  await expect(footer(page)).toContainText('Patch source set');
  await drag(page, [[540, 200], [660, 200]]);
  await expect(footer(page)).toContainText('Patch applied nondestructively');
  // The brush copied blue from below into the band, inside the selection only.
  expect(await pixel(page, 600, 200)).toEqual(BLUE);
  expect(await pixel(page, 450, 200)).toEqual(RED);
  const after = await project(page);
  expect(after.history[after.index].layers.at(-1)!.patchStrokes!.at(-1)!.region).toBeUndefined();
});
