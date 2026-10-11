import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

type Layer = Record<string, unknown> & { kind?: string; text?: string; id?: string };
type Project = {
  history: Array<{ layers: Layer[]; active: string; selection?: { mask?: string }; groups?: Array<Record<string, unknown>> }>;
  index: number;
  assets: Record<string, { url: string; w: number; h: number }>;
};

const prepare = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
};

const project = async (page: Page): Promise<Project> => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as Project;
};

const maskStats = async (page: Page, asset: { url: string; w: number; h: number }) =>
  page.evaluate(async ({ asset }) => {
    const image = new Image();
    image.src = asset.url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = asset.w;
    canvas.height = asset.h;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, asset.w, asset.h).data;
    let count = 0;
    let left = asset.w;
    let top = asset.h;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < asset.h; y += 1) {
      for (let x = 0; x < asset.w; x += 1) {
        if (data[(y * asset.w + x) * 4 + 3] === 0) continue;
        count += 1;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    return {
      count,
      hash: data.reduce((sum, value, offset) => (sum + value * (offset + 1)) % 1000000007, 0),
      bounds: right < 0 ? { x: 0, y: 0, width: 0, height: 0 } : {
        x: left,
        y: top,
        width: right - left + 1,
        height: bottom - top + 1,
      },
    };
  }, { asset });

const addText = async (page: Page, content = 'ABCD') => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await selectTool(page, 'Text');
  await page.getByLabel('Text content', { exact: true }).fill(content);
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  // Canvas keeps document pixels at a fixed backing size on narrow viewports;
  // element-relative click scrolls the mobile canvas before dispatching input.
  await canvas.click({ position: { x: box.width * 0.2, y: box.height * 0.2 }, force: true });
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  const created = await project(page);
  expect(created.history[created.index].layers.find((layer) => layer.kind === 'text')?.text).toBe(content);
};

const importProject = async (page: Page, value: Project) => {
  await page.getByTestId('project-input').setInputFiles({
    name: 'type-mask.pixelforge',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
};

const typeMenu = (page: Page) => page.getByRole('menu', { name: 'Type menu' });

test.beforeEach(async ({ page }) => prepare(page));

test('type masks create alpha selections, compose modes and preserve editable text through round trips', async ({ page }) => {
  await addText(page, 'ABCD');
  let exported = await project(page);
  const before = JSON.parse(JSON.stringify(exported.history[exported.index].layers.find((layer) => layer.kind === 'text')));

  await page.getByRole('button', { name: 'Type', exact: true }).click();
  const menu = typeMenu(page);
  await expect(menu.getByRole('menuitem', { name: 'Horizontal Type Mask', exact: true })).toBeEnabled();
  await menu.getByRole('menuitem', { name: 'Horizontal Type Mask', exact: true }).click();
  await expect(page.getByText('Horizontal Type Mask selection created', { exact: true })).toBeVisible();
  exported = await project(page);
  let frame = exported.history[exported.index];
  expect(frame.selection?.mask).toBeTruthy();
  const horizontal = await maskStats(page, exported.assets[frame.selection!.mask!]);
  expect(horizontal.count).toBeGreaterThan(0);
  expect(horizontal.bounds.width).toBeGreaterThan(0);
  expect(horizontal.bounds.height).toBeGreaterThan(0);
  expect(frame.layers.find((layer) => layer.kind === 'text')).toEqual(before);

  await page.getByLabel('Selection mode', { exact: true }).selectOption('subtract');
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await typeMenu(page).getByRole('menuitem', { name: 'Horizontal Type Mask', exact: true }).click();
  exported = await project(page);
  frame = exported.history[exported.index];
  const subtracted = await maskStats(page, exported.assets[frame.selection!.mask!]);
  expect(subtracted.count).toBeLessThan(horizontal.count);

  await page.getByLabel('Selection mode', { exact: true }).selectOption('replace');
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await typeMenu(page).getByRole('menuitem', { name: 'Horizontal Type Mask', exact: true }).click();
  await page.getByLabel('Selection mode', { exact: true }).selectOption('intersect');
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await typeMenu(page).getByRole('menuitem', { name: 'Horizontal Type Mask', exact: true }).click();
  exported = await project(page);
  frame = exported.history[exported.index];
  const intersected = await maskStats(page, exported.assets[frame.selection!.mask!]);
  expect(intersected).toEqual(horizontal);

  await page.getByLabel('Selection mode', { exact: true }).selectOption('replace');
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await typeMenu(page).getByRole('menuitem', { name: 'Vertical Type Mask', exact: true }).click();
  await expect(page.getByText('Vertical Type Mask selection created', { exact: true })).toBeVisible();
  exported = await project(page);
  frame = exported.history[exported.index];
  const vertical = await maskStats(page, exported.assets[frame.selection!.mask!]);
  expect(vertical.count).toBeGreaterThan(0);
  expect(vertical.bounds.height).toBeGreaterThanOrEqual(horizontal.bounds.height);
  expect(frame.layers.find((layer) => layer.kind === 'text')).toEqual(before);
  const verticalHash = vertical.hash;

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  exported = await project(page);
  frame = exported.history[exported.index];
  const undone = await maskStats(page, exported.assets[frame.selection!.mask!]);
  expect(undone.hash).toBe(horizontal.hash);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  exported = await project(page);
  frame = exported.history[exported.index];
  expect((await maskStats(page, exported.assets[frame.selection!.mask!])).hash).toBe(verticalHash);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  exported = await project(page);
  frame = exported.history[exported.index];
  expect(frame.selection?.mask).toBeTruthy();
  expect((await maskStats(page, exported.assets[frame.selection!.mask!])).count).toBeGreaterThan(0);

  const imported = JSON.parse(JSON.stringify(exported)) as Project;
  await importProject(page, imported);
  const importedFrame = imported.history[imported.index];
  expect(importedFrame.layers.find((layer) => layer.kind === 'text')?.text).toBe('ABCD');
  const importedOut = await project(page);
  const importedMask = importedOut.history[importedOut.index].selection!.mask!;
  expect((await maskStats(page, importedOut.assets[importedMask])).hash).toBe(verticalHash);
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
});

test('type mask menu disables for missing, empty, hidden and locked text', async ({ page }) => {
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await expect(typeMenu(page).getByRole('menuitem', { name: 'Horizontal Type Mask', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await addText(page, 'Mask');
  let fixture = await project(page);
  const currentFrame = fixture.history[fixture.index];
  const textLayer = currentFrame.layers.find((layer) => layer.kind === 'text')!;
  textLayer.text = '   ';
  await importProject(page, fixture);
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await expect(typeMenu(page).getByRole('menuitem', { name: 'Vertical Type Mask', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  fixture = await project(page);
  fixture.history[fixture.index].layers.find((layer) => layer.kind === 'text')!.text = 'Mask';
  fixture.history[fixture.index].layers.find((layer) => layer.kind === 'text')!.locked = true;
  await importProject(page, fixture);
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await expect(typeMenu(page).getByRole('menuitem', { name: 'Horizontal Type Mask', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  fixture = await project(page);
  const lockedText = fixture.history[fixture.index].layers.find((layer) => layer.kind === 'text')!;
  lockedText.locked = false;
  lockedText.visible = false;
  await importProject(page, fixture);
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await expect(typeMenu(page).getByRole('menuitem', { name: 'Vertical Type Mask', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  fixture = await project(page);
  const groupedText = fixture.history[fixture.index].layers.find((layer) => layer.kind === 'text')!;
  groupedText.visible = true;
  groupedText.groupId = 'a2f6ab6d-3ab1-4c72-9e5e-7c9bca3d7a11';
  fixture.history[fixture.index].groups = [{
    id: groupedText.groupId,
    name: 'Hidden group',
    visible: false,
    locked: false,
    opacity: 1,
    blend: 'source-over',
    collapsed: false,
  }];
  await importProject(page, fixture);
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await expect(typeMenu(page).getByRole('menuitem', { name: 'Horizontal Type Mask', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  fixture = await project(page);
  const malformed = fixture.history[fixture.index].layers.find((layer) => layer.kind === 'text')!;
  malformed.groupId = undefined;
  fixture.history[fixture.index].groups = [];
  malformed.matrix = [0, 0, 0, 0, 0, 0];
  await importProject(page, fixture);
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await expect(typeMenu(page).getByRole('menuitem', { name: 'Vertical Type Mask', exact: true })).toBeDisabled();
});
