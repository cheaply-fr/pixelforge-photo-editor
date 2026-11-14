import { test, expect, type Locator, type Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { downloadedProject } from './project-file';

// Layers panel: drag-and-drop reorder (mouse and touch), keyboard reorder
// with a live announcement, per-row delete, the row menu, folders, clipping
// groups, locked refusals and file drops. See
// docs/layers-panel-interaction-contract.md.

/** A solid-colour RGBA PNG, encoded here so no image files live in the repo. */
function solidPng(width: number, height: number, rgba: [number, number, number, number]): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + width * 4);
  for (let x = 0; x < width; x += 1) row.set(rgba, 1 + x * 4);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const RED = solidPng(64, 64, [255, 0, 0, 255]);
const BLUE = solidPng(64, 64, [0, 0, 255, 255]);
const GREEN = solidPng(20, 10, [0, 255, 0, 255]);

type ProjectLayer = {
  id: string;
  name: string;
  matrix: number[];
  groupId?: string;
  clippingTo?: string;
  visible: boolean;
  locked: boolean;
};
type ProjectFrame = {
  w: number;
  h: number;
  layers: ProjectLayer[];
  active: string;
  selectedLayerIds?: string[];
  groups?: Array<{ id: string; name: string }>;
};

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );
});

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const footer = (page: Page) => page.locator('footer');
const live = (page: Page) => page.getByTestId('layers-live');
const settled = (page: Page) =>
  expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });
const row = (page: Page, name: string) =>
  page.getByRole('button', { name: `Select layer ${name}`, exact: true });
const item = (page: Page, name: string) =>
  page.locator('.layer-row-item').filter({ has: row(page, name) });
/** Layer names as the panel lists them (top of the stack first). */
const order = (page: Page) =>
  page
    .getByRole('button', { name: /^Select layer / })
    .evaluateAll((rows) =>
      rows.map((element) => (element.getAttribute('aria-label') || '').replace(/^Select layer /, '')),
    );
const addPaint = async (page: Page, count = 1) => {
  for (let index = 0; index < count; index += 1) {
    await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
    await settled(page);
  }
};
const addImageLayer = async (page: Page, name: string, buffer: Buffer) => {
  await page.getByTestId('layer-input').setInputFiles({ name, mimeType: 'image/png', buffer });
  await expect(footer(page)).toContainText('Image layer added');
  await settled(page);
};
async function menu(page: Page, name: string, entry: string | RegExp) {
  await page.getByRole('button', { name, exact: true }).click();
  await page
    .getByRole('menuitem', typeof entry === 'string' ? { name: entry, exact: true } : { name: entry })
    .click();
  await settled(page);
}
const undo = (page: Page) => menu(page, 'Edit', /^Undo/);
const redo = (page: Page) => menu(page, 'Edit', /^Redo/);
async function project(page: Page): Promise<ProjectFrame> {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const out = (await downloadedProject((await (await pending).path())!)) as {
    history: ProjectFrame[];
    index: number;
  };
  return out.history[out.index];
}
/** Composite RGBA at the document centre, where added image layers are placed. */
const centrePixel = (page: Page) =>
  canvas(page).evaluate((element: HTMLCanvasElement) =>
    Array.from(element.getContext('2d')!.getImageData(Math.floor(element.width / 2), Math.floor(element.height / 2), 1, 1).data));
/** Composite RGBA at a document pixel. */
const pixel = (page: Page, x: number, y: number) =>
  canvas(page).evaluate(
    (element: HTMLCanvasElement, [px, py]) =>
      Array.from(element.getContext('2d')!.getImageData(px, py, 1, 1).data),
    [x, y],
  );

/** Mouse-drag `from`'s row to a fraction of `to`'s height (0 = top edge). */
async function mouseDrag(page: Page, from: Locator, to: Locator, fraction: number, finish = true) {
  // Keep the whole list clear of the fixed status bar at the bottom.
  await from.evaluate((element) => element.scrollIntoView({ block: 'nearest' }));
  await page.locator('.layer-list').evaluate((list) => list.scrollIntoView({ block: 'center' }));
  const start = (await from.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2 + 8, { steps: 2 });
  // The list may auto-scroll near its edges: re-measure until the target settles.
  let previous = '';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const end = (await to.boundingBox())!;
    const key = `${Math.round(end.x)},${Math.round(end.y)}`;
    if (key === previous) break;
    previous = key;
    await page.mouse.move(end.x + end.width / 2, end.y + end.height * fraction, { steps: attempt ? 1 : 6 });
    await page.waitForTimeout(80);
  }
  if (finish) {
    await page.mouse.up();
    await settled(page);
  }
}

test.describe('desktop pointer', () => {
  test.skip(({ isMobile }) => isMobile, 'Mouse drag is covered on desktop; touch has its own test');

  test('mouse drag reorders with an insertion line, changes stacking pixels, undoes and survives reload', async ({ page }) => {
    await addImageLayer(page, 'red.png', RED);
    await addImageLayer(page, 'blue.png', BLUE);
    expect(await order(page)).toEqual(['blue.png', 'red.png', 'Background']);
    expect(await centrePixel(page)).toEqual([0, 0, 255, 255]);

    // Mid-drag the target row shows the line and the hint names the drop.
    await mouseDrag(page, item(page, 'red.png'), item(page, 'blue.png'), 0.2, false);
    await expect(item(page, 'blue.png')).toHaveClass(/drop-above/);
    await expect(page.getByTestId('layer-drop-hint')).toHaveText('Drop above blue.png');
    await expect(item(page, 'red.png')).toHaveClass(/dragging/);
    await page.mouse.up();
    await settled(page);
    await expect(page.getByTestId('layer-drop-hint')).toHaveCount(0);

    expect(await order(page)).toEqual(['red.png', 'blue.png', 'Background']);
    expect(await centrePixel(page)).toEqual([255, 0, 0, 255]);
    await expect(footer(page)).toContainText('Layer reordered');
    await expect(live(page)).toHaveText('red.png moved above blue.png, 1 of 3');
    // The dropped row is selected.
    await expect(row(page, 'red.png')).toHaveAttribute('data-selected', 'true');

    // One undo step per drop.
    await undo(page);
    expect(await order(page)).toEqual(['blue.png', 'red.png', 'Background']);
    expect(await centrePixel(page)).toEqual([0, 0, 255, 255]);
    await redo(page);
    expect(await order(page)).toEqual(['red.png', 'blue.png', 'Background']);

    // "Drop below": blue below Background.
    await mouseDrag(page, item(page, 'blue.png'), item(page, 'Background'), 0.85);
    expect(await order(page)).toEqual(['red.png', 'Background', 'blue.png']);

    await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
    await page.reload();
    await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
    expect(await order(page)).toEqual(['red.png', 'Background', 'blue.png']);
    expect((await project(page)).layers.map((layer) => layer.name)).toEqual(['blue.png', 'Background', 'red.png']);
  });

  test('Escape cancels a drag and leaves the order unchanged', async ({ page }) => {
    await addPaint(page, 2);
    const before = await order(page);
    await mouseDrag(page, item(page, 'Paint 1'), item(page, 'Paint 2'), 0.2, false);
    await expect(page.getByTestId('layer-drop-hint')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('layer-drop-hint')).toHaveCount(0);
    await page.mouse.up();
    expect(await order(page)).toEqual(before);
    await expect(live(page)).toHaveText(/Reorder cancelled/);
    // Escape did not leave a click that re-selected the dragged row.
    await expect(row(page, 'Paint 2')).toHaveAttribute('data-selected', 'true');
  });

  test('multi-selected rows move together', async ({ page }) => {
    await addPaint(page, 3);
    await row(page, 'Paint 1').click();
    await row(page, 'Background').click({ modifiers: ['Control'] });
    await mouseDrag(page, item(page, 'Background'), item(page, 'Paint 3'), 0.2);
    expect(await order(page)).toEqual(['Paint 1', 'Background', 'Paint 3', 'Paint 2']);
    await expect(footer(page)).toContainText('2 layers reordered');
    await expect(live(page)).toHaveText('2 layers moved above Paint 3, 1 of 4');
    await undo(page);
    expect(await order(page)).toEqual(['Paint 3', 'Paint 2', 'Paint 1', 'Background']);
  });

  test('drag into and out of a folder', async ({ page }) => {
    await addPaint(page, 3);
    await row(page, 'Paint 3').click();
    await page.getByRole('button', { name: 'Group active layer', exact: true }).click();
    await settled(page);
    const folder = page.locator('.group-row').filter({ hasText: 'Group 1' });
    await expect(folder).toBeVisible();

    // Lower part of the folder header: into the folder (at its top).
    await mouseDrag(page, item(page, 'Paint 1'), folder, 0.75, false);
    await expect(folder).toHaveClass(/drop-into/);
    await expect(page.getByTestId('layer-drop-hint')).toHaveText('Drop into folder Group 1');
    await page.mouse.up();
    await settled(page);
    await expect(row(page, 'Paint 1')).toContainText('· Group 1');
    expect(await order(page)).toEqual(['Paint 1', 'Paint 3', 'Paint 2', 'Background']);
    let frame = await project(page);
    const groupId = frame.groups![0].id;
    expect(frame.layers.filter((layer) => layer.groupId === groupId).map((layer) => layer.name)).toEqual(['Paint 3', 'Paint 1']);

    // Next to a layer outside the folder: out of the folder.
    await mouseDrag(page, item(page, 'Paint 1'), item(page, 'Background'), 0.2);
    await expect(row(page, 'Paint 1')).not.toContainText('Group 1');
    expect(await order(page)).toEqual(['Paint 3', 'Paint 2', 'Paint 1', 'Background']);
    frame = await project(page);
    expect(frame.layers.find((layer) => layer.name === 'Paint 1')!.groupId).toBeUndefined();
    expect(frame.layers.find((layer) => layer.name === 'Paint 3')!.groupId).toBe(groupId);

    // A folder dragged by its header moves as one block.
    await mouseDrag(page, folder.locator('.group-toggle'), item(page, 'Background'), 0.85);
    frame = await project(page);
    expect(frame.layers.map((layer) => layer.name)).toEqual(['Paint 3', 'Background', 'Paint 1', 'Paint 2']);
    expect(frame.layers[0].groupId).toBe(groupId);
    // The header click after the drag did not collapse the folder.
    await expect(folder.getByRole('button', { name: /^Collapse group/ })).toBeVisible();
  });

  test('a clipping base drags with its clipped layers; an unclipped layer dropped inside joins the group', async ({ page }) => {
    await addPaint(page, 3);
    // Paint 2 clipped to Paint 1.
    await row(page, 'Paint 2').click();
    await page.getByRole('button', { name: 'Create clipping mask', exact: true }).click();
    await settled(page);
    await expect(row(page, 'Paint 2')).toHaveAttribute('data-clipped', 'true');

    // Dragging the base carries the clipped layer.
    await mouseDrag(page, item(page, 'Paint 1'), item(page, 'Paint 3'), 0.2);
    expect(await order(page)).toEqual(['Paint 2', 'Paint 1', 'Paint 3', 'Background']);
    await expect(row(page, 'Paint 2')).toHaveAttribute('data-clipped', 'true');
    await expect(row(page, 'Paint 2')).toHaveAccessibleDescription('Clipped to Paint 1; layer 1 of 4, above Paint 1');

    // Paint 3 dropped between the base and its clipped layer joins the group.
    await mouseDrag(page, item(page, 'Paint 3'), item(page, 'Paint 1'), 0.2, false);
    await expect(page.getByTestId('layer-drop-hint')).toHaveText('Drop into clipping group of Paint 1');
    await page.mouse.up();
    await settled(page);
    expect(await order(page)).toEqual(['Paint 2', 'Paint 3', 'Paint 1', 'Background']);
    await expect(row(page, 'Paint 3')).toHaveAttribute('data-clipped', 'true');
    await expect(row(page, 'Paint 2')).toHaveAttribute('data-clipped', 'true');
    await expect(footer(page)).toContainText('moved into the clipping group of Paint 1');
    let frame = await project(page);
    const byName = (name: string) => frame.layers.find((layer) => layer.name === name)!;
    expect(byName('Paint 3').clippingTo).toBe(byName('Paint 1').id);
    expect(byName('Paint 2').clippingTo).toBe(byName('Paint 3').id);

    // A clipped layer dragged out of the group is released alone.
    await mouseDrag(page, item(page, 'Paint 2'), item(page, 'Background'), 0.85);
    await expect(footer(page)).toContainText('clipping mask released for Paint 2');
    await expect(row(page, 'Paint 2')).not.toHaveAttribute('data-clipped', 'true');
    await expect(row(page, 'Paint 3')).toHaveAttribute('data-clipped', 'true');
    frame = await project(page);
    expect(byName('Paint 2').clippingTo).toBeUndefined();
  });

  test('locked layers refuse to be dragged or deleted', async ({ page }) => {
    await addPaint(page, 2);
    await row(page, 'Paint 1').click();
    await page.getByLabel('Lock layer', { exact: true }).check();
    await settled(page);
    const before = await order(page);
    await mouseDrag(page, item(page, 'Paint 1'), item(page, 'Paint 2'), 0.2, false);
    await expect(page.getByTestId('layer-drop-hint')).toHaveText('Locked layers cannot be moved');
    await expect(page.getByTestId('layer-drop-hint')).toHaveAttribute('data-state', 'refused');
    await expect(item(page, 'Paint 2')).toHaveClass(/drop-refused/);
    await page.mouse.up();
    expect(await order(page)).toEqual(before);
    await expect(footer(page)).toContainText('Unlock the layers before moving them');

    await item(page, 'Paint 1').getByRole('button', { name: 'Delete Paint 1', exact: true }).click();
    await expect(footer(page)).toContainText('Unlock all selected layers before deleting');
    expect(await order(page)).toEqual(before);
  });

  test('right-click opens the row menu', async ({ page }) => {
    await addPaint(page, 2);
    await row(page, 'Paint 1').click({ button: 'right' });
    const rowMenu = page.getByRole('menu', { name: 'Layer options for Paint 1' });
    await expect(rowMenu).toBeVisible();
    await expect(rowMenu.getByRole('menuitem', { name: 'Duplicate', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(rowMenu.getByRole('menuitem', { name: 'Bring to Front', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(rowMenu.getByRole('menuitem', { name: 'Bring Forward', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await settled(page);
    expect(await order(page)).toEqual(['Paint 1', 'Paint 2', 'Background']);
    await expect(rowMenu).toHaveCount(0);
    // A press outside closes the menu without acting.
    await row(page, 'Paint 2').click({ button: 'right' });
    await expect(page.getByRole('menu')).toBeVisible();
    await page.locator('footer').click();
    await expect(page.getByRole('menu')).toHaveCount(0);
  });
});

test('keyboard reorder on a focused row announces the new position', async ({ page }) => {
  await addPaint(page, 3);
  await row(page, 'Paint 1').click();
  await expect(row(page, 'Paint 1')).toHaveAccessibleDescription('layer 3 of 4, above Background');
  await row(page, 'Paint 1').focus();

  await page.keyboard.press('Control+BracketRight');
  await settled(page);
  expect(await order(page)).toEqual(['Paint 3', 'Paint 1', 'Paint 2', 'Background']);
  await expect(live(page)).toHaveText('Paint 1 moved above Paint 2, 2 of 4');
  await expect(row(page, 'Paint 1')).toBeFocused();
  await expect(row(page, 'Paint 1')).toHaveAccessibleDescription('layer 2 of 4, above Paint 2');

  await page.keyboard.press('Alt+ArrowDown');
  await settled(page);
  expect(await order(page)).toEqual(['Paint 3', 'Paint 2', 'Paint 1', 'Background']);
  await expect(live(page)).toHaveText('Paint 1 moved above Background, 3 of 4');

  await page.keyboard.press('Control+Shift+BracketRight');
  await settled(page);
  expect(await order(page)).toEqual(['Paint 1', 'Paint 3', 'Paint 2', 'Background']);
  await expect(live(page)).toHaveText('Paint 1 moved above Paint 3, 1 of 4');

  await page.keyboard.press('Alt+ArrowUp');
  await expect(live(page)).toHaveText('Already at that end of the stack');

  await page.keyboard.press('Control+Shift+BracketLeft');
  await settled(page);
  expect(await order(page)).toEqual(['Paint 3', 'Paint 2', 'Background', 'Paint 1']);
  await expect(live(page)).toHaveText('Paint 1 moved to the bottom, 4 of 4');
  await expect(row(page, 'Paint 1')).toBeFocused();

  // Plain arrows move focus between rows.
  await page.keyboard.press('ArrowUp');
  await expect(row(page, 'Background')).toBeFocused();

  // The global shortcut works with the canvas focused too (one undo step each).
  await undo(page);
  expect(await order(page)).toEqual(['Paint 1', 'Paint 3', 'Paint 2', 'Background']);
});

test('row delete, Delete key, multi-selection delete, undo/redo and refusals', async ({ page }) => {
  await addPaint(page, 3);
  // Delete key on a focused row; selection moves to the layer below.
  await row(page, 'Paint 2').click();
  await page.keyboard.press('Delete');
  await settled(page);
  expect(await order(page)).toEqual(['Paint 3', 'Paint 1', 'Background']);
  await expect(row(page, 'Paint 1')).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('[data-selected="true"]')).toHaveCount(1);
  await expect(live(page)).toHaveText('Paint 2 deleted. Undo restores it.');
  await expect(row(page, 'Paint 1')).toBeFocused();

  // The trash button on an unselected row deletes only that row.
  await item(page, 'Paint 3').getByRole('button', { name: 'Delete Paint 3', exact: true }).click();
  await settled(page);
  expect(await order(page)).toEqual(['Paint 1', 'Background']);
  await undo(page);
  await undo(page);
  expect(await order(page)).toEqual(['Paint 3', 'Paint 2', 'Paint 1', 'Background']);
  await redo(page);
  expect(await order(page)).toEqual(['Paint 3', 'Paint 1', 'Background']);
  await undo(page);

  // A multi-selection is deleted in one step from any selected row's trash button.
  await row(page, 'Paint 1').click();
  await row(page, 'Paint 3').click({ modifiers: ['Control'] });
  await item(page, 'Paint 3').getByRole('button', { name: 'Delete Paint 3', exact: true }).click();
  await settled(page);
  expect(await order(page)).toEqual(['Paint 2', 'Background']);
  await expect(footer(page)).toContainText('2 layers deleted');
  await expect(row(page, 'Background')).toHaveAttribute('data-selected', 'true');
  await undo(page);
  expect(await order(page)).toEqual(['Paint 3', 'Paint 2', 'Paint 1', 'Background']);

  // Backspace works too; the last layer is refused.
  for (const name of ['Paint 3', 'Paint 2', 'Paint 1']) {
    await row(page, name).click();
    await page.keyboard.press('Backspace');
    await settled(page);
  }
  expect(await order(page)).toEqual(['Background']);
  await item(page, 'Background').getByRole('button', { name: 'Delete Background', exact: true }).click();
  await expect(footer(page)).toContainText('Keep at least one layer in the document');
  await expect(live(page)).toHaveText('Keep at least one layer in the document');
  expect(await order(page)).toEqual(['Background']);
});

test('row menu actions: arrange, hide, lock, rename, duplicate, clipping and folder', async ({ page }) => {
  await addPaint(page, 2);
  const openMenuFor = async (name: string) => {
    await item(page, name).getByRole('button', { name: `Layer options for ${name}`, exact: true }).click();
    const rowMenu = page.getByRole('menu', { name: `Layer options for ${name}` });
    await expect(rowMenu).toBeVisible();
    return rowMenu;
  };
  const choose = async (name: string, entry: string) => {
    const rowMenu = await openMenuFor(name);
    await rowMenu.getByRole('menuitem', { name: entry, exact: true }).click();
    await settled(page);
  };

  await choose('Paint 1', 'Bring to Front');
  expect(await order(page)).toEqual(['Paint 1', 'Paint 2', 'Background']);
  await choose('Paint 1', 'Send to Back');
  expect(await order(page)).toEqual(['Paint 2', 'Background', 'Paint 1']);
  await choose('Paint 1', 'Bring Forward');
  expect(await order(page)).toEqual(['Paint 2', 'Paint 1', 'Background']);
  await choose('Paint 1', 'Send Backward');
  expect(await order(page)).toEqual(['Paint 2', 'Background', 'Paint 1']);
  await choose('Paint 1', 'Bring Forward');

  await choose('Paint 2', 'Hide');
  await expect(row(page, 'Paint 2')).toContainText('· hidden');
  await choose('Paint 2', 'Show');
  await expect(row(page, 'Paint 2')).not.toContainText('· hidden');

  await choose('Paint 2', 'Lock');
  await expect(row(page, 'Paint 2')).toContainText('· locked');
  let rowMenu = await openMenuFor('Paint 2');
  await expect(rowMenu.getByRole('menuitem', { name: 'Delete', exact: true })).toBeDisabled();
  await expect(rowMenu.getByRole('menuitem', { name: 'Rename…', exact: true })).toBeDisabled();
  // Escape closes the menu and returns focus to its button.
  await page.keyboard.press('Escape');
  await expect(rowMenu).toHaveCount(0);
  await expect(item(page, 'Paint 2').getByRole('button', { name: 'Layer options for Paint 2', exact: true })).toBeFocused();
  await choose('Paint 2', 'Unlock');
  await expect(row(page, 'Paint 2')).not.toContainText('· locked');

  page.once('dialog', (dialog) => void dialog.accept('Sky'));
  await choose('Paint 2', 'Rename…');
  await expect(row(page, 'Sky')).toBeVisible();

  await choose('Sky', 'Duplicate');
  await expect(row(page, 'Sky copy')).toBeVisible();
  expect(await order(page)).toEqual(['Sky copy', 'Sky', 'Paint 1', 'Background']);

  await choose('Sky copy', 'Delete');
  expect(await order(page)).toEqual(['Sky', 'Paint 1', 'Background']);

  await choose('Sky', 'Create Clipping Mask');
  await expect(row(page, 'Sky')).toHaveAttribute('data-clipped', 'true');
  await choose('Sky', 'Release Clipping Mask');
  await expect(row(page, 'Sky')).not.toHaveAttribute('data-clipped', 'true');

  await choose('Paint 1', 'Group into Folder');
  await expect(page.locator('.group-row').filter({ hasText: 'Group 1' })).toBeVisible();
  await expect(row(page, 'Paint 1')).toContainText('· Group 1');
  rowMenu = await openMenuFor('Paint 1');
  await expect(rowMenu.getByRole('menuitem', { name: 'Group into Folder', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
});

test('rows describe their stack position; actions fit a compact layout without overflow', async ({ page, isMobile }) => {
  await addPaint(page, 2);
  await expect(row(page, 'Paint 2')).toHaveAccessibleDescription('layer 1 of 3, above Paint 1');
  await expect(row(page, 'Background')).toHaveAccessibleDescription('layer 3 of 3, bottom of the stack');
  const trash = item(page, 'Paint 1').getByRole('button', { name: 'Delete Paint 1', exact: true });
  const more = item(page, 'Paint 1').getByRole('button', { name: 'Layer options for Paint 1', exact: true });
  await trash.scrollIntoViewIfNeeded();
  for (const control of [trash, more]) {
    const box = (await control.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(24);
    expect(box.height).toBeGreaterThanOrEqual(24);
  }
  // Desktop reveals the row buttons on hover/focus; touch layouts always show them.
  const opacity = () => trash.evaluate((element) => getComputedStyle(element).opacity);
  if (isMobile) expect(await opacity()).toBe('1');
  else {
    await row(page, 'Paint 2').hover();
    expect(await opacity()).toBe('0');
    await row(page, 'Paint 1').hover();
    expect(await opacity()).toBe('1');
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const list = page.locator('.layer-list');
  expect(await list.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
});

test.describe('touch', () => {
  test.skip(({ isMobile }) => !isMobile, 'Touch long-press is covered on the mobile project');

  test('long-press the handle to drag; long-press a row for its menu', async ({ page }) => {
    await addImageLayer(page, 'red.png', RED);
    await addImageLayer(page, 'blue.png', BLUE);
    expect(await centrePixel(page)).toEqual([0, 0, 255, 255]);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', x?: number, y?: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: x === undefined ? [] : [{ x, y: y! }],
      });

    const handle = item(page, 'red.png').locator('[data-drag-handle]');
    await handle.scrollIntoViewIfNeeded();
    const start = (await handle.boundingBox())!;
    const target = (await item(page, 'blue.png').boundingBox())!;
    const sx = start.x + start.width / 2,
      sy = start.y + start.height / 2;
    await touch('touchStart', sx, sy);
    await page.waitForTimeout(450);
    const ty = target.y + target.height * 0.2;
    for (let step = 1; step <= 6; step += 1) await touch('touchMove', sx, sy + ((ty - sy) * step) / 6);
    await expect(page.getByTestId('layer-drop-hint')).toHaveText('Drop above blue.png');
    await touch('touchEnd');
    await settled(page);
    expect(await order(page)).toEqual(['red.png', 'blue.png', 'Background']);
    expect(await centrePixel(page)).toEqual([255, 0, 0, 255]);
    await expect(live(page)).toHaveText('red.png moved above blue.png, 1 of 3');

    // A quick touch move on the handle (no long press) does not reorder.
    const quick = (await item(page, 'Background').locator('[data-drag-handle]').boundingBox())!;
    await touch('touchStart', quick.x + quick.width / 2, quick.y + quick.height / 2);
    await touch('touchMove', quick.x + quick.width / 2, quick.y - 60);
    await touch('touchEnd');
    expect(await order(page)).toEqual(['red.png', 'blue.png', 'Background']);

    // Long-press on the row (not the handle) opens the row menu.
    const blueRow = (await row(page, 'blue.png').boundingBox())!;
    await touch('touchStart', blueRow.x + blueRow.width / 2, blueRow.y + blueRow.height / 2);
    await page.waitForTimeout(700);
    await touch('touchEnd');
    const rowMenu = page.getByRole('menu', { name: 'Layer options for blue.png' });
    await expect(rowMenu).toBeVisible();
    await rowMenu.getByRole('menuitem', { name: 'Bring to Front', exact: true }).tap();
    await settled(page);
    expect(await order(page)).toEqual(['blue.png', 'red.png', 'Background']);
    // The trash button is always visible on touch.
    await item(page, 'red.png').getByRole('button', { name: 'Delete red.png', exact: true }).tap();
    await settled(page);
    expect(await order(page)).toEqual(['blue.png', 'Background']);
  });
});

/** Dispatch a synthetic file drag (dragover + drop) at a viewport point. */
async function dropFilesAt(
  page: Page,
  files: Array<{ name: string; type: string; bytes: Buffer }>,
  x: number,
  y: number,
  options: { shiftKey?: boolean; dropToo?: boolean } = {},
) {
  await page.evaluate(
    ({ files, x, y, shiftKey, dropToo }) => {
      const transfer = new DataTransfer();
      for (const file of files)
        transfer.items.add(
          new File([Uint8Array.from(atob(file.bytes), (c) => c.charCodeAt(0))], file.name, { type: file.type }),
        );
      const target = document.elementFromPoint(x, y)!;
      const fire = (type: string) =>
        target.dispatchEvent(
          new DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, shiftKey, dataTransfer: transfer }),
        );
      fire('dragenter');
      fire('dragover');
      if (dropToo) fire('drop');
    },
    {
      files: files.map((file) => ({ ...file, bytes: file.bytes.toString('base64') })),
      x,
      y,
      shiftKey: Boolean(options.shiftKey),
      dropToo: options.dropToo !== false,
    },
  );
}

test.describe('file drag and drop', () => {
  test.skip(({ isMobile }) => isMobile, 'Mobile browsers have no file drag-and-drop; the import buttons cover it');

  test('image files dropped on the canvas become layers above the selection at the drop point', async ({ page }) => {
    await addPaint(page, 2);
    await row(page, 'Paint 1').click();
    const box = (await canvas(page).boundingBox())!;
    const size = await canvas(page).evaluate((element: HTMLCanvasElement) => [element.width, element.height]);
    // Drop at 25% / 50% of the canvas.
    const x = box.x + box.width * 0.25,
      y = box.y + box.height * 0.5;

    // The overlay explains what a drop will do.
    await dropFilesAt(page, [{ name: 'green.png', type: 'image/png', bytes: GREEN }], x, y, { dropToo: false });
    await expect(page.getByTestId('drop-overlay')).toContainText('Drop to add as layer');
    await dropFilesAt(page, [{ name: 'green.png', type: 'image/png', bytes: GREEN }], x, y, { dropToo: false, shiftKey: true });
    await expect(page.getByTestId('drop-overlay')).toContainText('Drop to open');

    await dropFilesAt(page, [{ name: 'green.png', type: 'image/png', bytes: GREEN }], x, y);
    await settled(page);
    await expect(page.getByTestId('drop-overlay')).toHaveCount(0);
    await expect(footer(page)).toContainText('Image layer added');
    expect(await order(page)).toEqual(['Paint 2', 'green.png', 'Paint 1', 'Background']);
    let frame = await project(page);
    const green = frame.layers.find((layer) => layer.name === 'green.png')!;
    const cx = size[0] * 0.25,
      cy = size[1] * 0.5;
    expect(Math.abs(green.matrix[4] - (cx - 10))).toBeLessThanOrEqual(1.5);
    expect(Math.abs(green.matrix[5] - (cy - 5))).toBeLessThanOrEqual(1.5);
    const sample = await pixel(page, Math.round(cx), Math.round(cy));
    expect(sample).toEqual([0, 255, 0, 255]);

    // Several files: each a layer in order, all in one undo step.
    await dropFilesAt(
      page,
      [
        { name: 'one.png', type: 'image/png', bytes: RED },
        { name: 'two.png', type: 'image/png', bytes: BLUE },
      ],
      box.x + box.width / 2,
      box.y + box.height / 2,
    );
    await settled(page);
    await expect(footer(page)).toContainText('2 image layers added');
    expect(await order(page)).toEqual(['Paint 2', 'two.png', 'one.png', 'green.png', 'Paint 1', 'Background']);
    await undo(page);
    expect(await order(page)).toEqual(['Paint 2', 'green.png', 'Paint 1', 'Background']);

    // Unsupported files get a status message and change nothing.
    await dropFilesAt(page, [{ name: 'notes.txt', type: 'text/plain', bytes: Buffer.from('hello') }], x, y);
    await expect(footer(page)).toContainText('notes.txt cannot be added as a layer');
    expect(await order(page)).toEqual(['Paint 2', 'green.png', 'Paint 1', 'Background']);
    frame = await project(page);
    expect(frame.layers).toHaveLength(4);
  });

  test('an unsupported drop reports a status', async ({ page }) => {
    const box = (await canvas(page).boundingBox())!;
    await dropFilesAt(page, [{ name: 'notes.txt', type: 'text/plain', bytes: Buffer.from('hello') }], box.x + 20, box.y + 20);
    await expect(footer(page)).toContainText('notes.txt cannot be added as a layer');
    expect(await order(page)).toEqual(['Background']);
  });

  test('Shift-drop opens the image as a new document', async ({ page }) => {
    await addPaint(page, 1);
    const box = (await canvas(page).boundingBox())!;
    await dropFilesAt(page, [{ name: 'photo.png', type: 'image/png', bytes: RED }], box.x + 30, box.y + 30, { shiftKey: true });
    await expect(footer(page)).toContainText('Photo opened');
    await settled(page);
    expect(await order(page)).toHaveLength(1);
    const size = await canvas(page).evaluate((element: HTMLCanvasElement) => [element.width, element.height]);
    expect(size).toEqual([64, 64]);
  });

  test('files dropped on the Layers panel insert at the drop line', async ({ page }) => {
    await addPaint(page, 2);
    await row(page, 'Paint 2').click();
    const target = item(page, 'Paint 1');
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    await dropFilesAt(page, [{ name: 'blue.png', type: 'image/png', bytes: BLUE }], box.x + box.width / 2, box.y + box.height * 0.85, { dropToo: false });
    await expect(target).toHaveClass(/drop-below/);
    await expect(page.getByTestId('layer-drop-hint')).toHaveText('Add below Paint 1');
    await dropFilesAt(page, [{ name: 'blue.png', type: 'image/png', bytes: BLUE }], box.x + box.width / 2, box.y + box.height * 0.85);
    await settled(page);
    expect(await order(page)).toEqual(['Paint 2', 'Paint 1', 'blue.png', 'Background']);
    await expect(row(page, 'blue.png')).toHaveAttribute('data-selected', 'true');
    await undo(page);
    expect(await order(page)).toEqual(['Paint 2', 'Paint 1', 'Background']);
  });
});
