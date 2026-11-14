import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

/*
 * The Move tool moves every selected layer and every layer linked to them
 * (docs/layer-selection-contract.md, docs/layer-links-contract.md).
 */

type Saved = { history: Array<{ layers: Array<{ id: string; matrix: number[] }> }>; index: number };

async function project(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return (await downloadedProject((await (await pending).path())!)) as Saved;
}

/** Layer offsets by id. */
const offsets = async (page: Page) => {
  const saved = await project(page);
  return Object.fromEntries(saved.history[saved.index].layers.map((layer) => [layer.id, [layer.matrix[4], layer.matrix[5]]]));
};

async function threePaintLayers(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  for (let index = 0; index < 2; index += 1) await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  const rows = page.getByRole('button', { name: /^Select layer / });
  await expect(rows).toHaveCount(3);
  return rows;
}

async function drag(page: Page, dx: number, dy: number) {
  await selectTool(page, 'Move');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  const scale = box.width / Number(await canvas.getAttribute('width'));
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx * scale, start.y + dy * scale, { steps: 6 });
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
}

const near = (value: number, expected: number) => expect(Math.abs(value - expected)).toBeLessThanOrEqual(2);

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

test('dragging a linked layer with the Move tool moves its linked peer', async ({ page }) => {
  const rows = await threePaintLayers(page);
  // Link two layers, then select only one of them.
  await rows.nth(0).click();
  await rows.nth(1).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Link Layers', exact: true }).click();
  await expect(page.getByText(/Linked 2 layers for synchronized transforms/)).toBeVisible();
  await rows.nth(0).click();
  const before = await offsets(page);
  await drag(page, 120, 60);
  await expect(page.locator('footer')).toContainText('2 layers moved');
  const after = await offsets(page);
  const ids = Object.keys(before);
  const moved = ids.filter((id) => after[id][0] !== before[id][0]);
  expect(moved).toHaveLength(2);
  for (const id of moved) {
    near(after[id][0] - before[id][0], 120);
    near(after[id][1] - before[id][1], 60);
  }
  // Both moved by exactly the same offset; the unlinked layer stayed.
  expect(after[moved[0]]).toEqual([after[moved[1]][0] - before[moved[1]][0] + before[moved[0]][0], after[moved[1]][1] - before[moved[1]][1] + before[moved[0]][1]]);
  const still = ids.find((id) => !moved.includes(id))!;
  expect(after[still]).toEqual(before[still]);
  // One undo step restores both.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  expect(await offsets(page)).toEqual(before);
});

test('dragging with several layers selected moves all of them', async ({ page }) => {
  const rows = await threePaintLayers(page);
  await rows.nth(0).click();
  await rows.nth(2).click({ modifiers: ['Shift'] });
  const before = await offsets(page);
  await drag(page, -80, 40);
  await expect(page.locator('footer')).toContainText('3 layers moved');
  const after = await offsets(page);
  for (const id of Object.keys(before)) {
    near(after[id][0] - before[id][0], -80);
    near(after[id][1] - before[id][1], 40);
  }
});

test('a locked layer in the selection blocks the group move', async ({ page }) => {
  const rows = await threePaintLayers(page);
  await rows.nth(1).click();
  await page.getByLabel('Lock layer', { exact: true }).check();
  await rows.nth(0).click();
  await rows.nth(1).click({ modifiers: ['Shift'] });
  // Make the unlocked layer the active anchor of the two-layer selection.
  await rows.nth(0).click({ modifiers: ['ControlOrMeta'] });
  await rows.nth(0).click({ modifiers: ['ControlOrMeta'] });
  const before = await offsets(page);
  await drag(page, 50, 50);
  await expect(page.locator('footer')).toContainText('Unlock every selected and linked layer before moving them together');
  expect(await offsets(page)).toEqual(before);
});
