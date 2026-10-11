import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

const editor = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );
};

const project = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as {
    history: Array<{
      layers: Array<{
        id: string;
        name: string;
        matrix: number[];
        groupId?: string;
        visible?: boolean;
      }>;
      active: string;
      selectedLayerIds?: string[];
    }>;
    index: number;
  };
};

const drawShape = async (page: Page, x: number, y: number, w: number, h: number) => {
  await page.getByRole('button', { name: 'Shape tool', exact: true }).click();
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * (x + w), box.y + box.height * (y + h), { steps: 4 });
  await page.mouse.up();
};

test.beforeEach(async ({ page }) => editor(page));

const additiveModifier: 'Meta' | 'Control' = process.platform === 'darwin' ? 'Meta' : 'Control';

test('multi-select supports shift ranges, modifier toggles, persistence and menu commands', async ({
  page,
}) => {
  await drawShape(page, 0.08, 0.1, 0.08, 0.06);
  await drawShape(page, 0.3, 0.2, 0.08, 0.06);
  await drawShape(page, 0.55, 0.3, 0.08, 0.06);
  const shape1 = page.getByRole('button', { name: 'Select layer Shape 1', exact: true });
  const shape2 = page.getByRole('button', { name: 'Select layer Shape 2', exact: true });
  const shape3 = page.getByRole('button', { name: 'Select layer Shape 3', exact: true });
  await shape1.click();
  await shape3.click({ modifiers: ['Shift'] });
  await expect(shape1).toHaveAttribute('data-selected', 'true');
  await expect(shape2).toHaveAttribute('data-selected', 'true');
  await expect(shape3).toHaveAttribute('data-selected', 'true');
  await shape2.click({ modifiers: [additiveModifier] });
  await expect(shape2).toHaveAttribute('data-selected', 'false');
  let out = await project(page);
  let frame = out.history[out.index];
  expect(frame.selectedLayerIds).toHaveLength(2);
  await page.reload();
  await expect(shape1).toHaveAttribute('data-selected', 'true');
  await expect(shape2).toHaveAttribute('data-selected', 'false');
  await expect(shape3).toHaveAttribute('data-selected', 'true');

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'All Layers', exact: true }).click();
  out = await project(page);
  frame = out.history[out.index];
  expect(frame.selectedLayerIds).toHaveLength(frame.layers.length);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Deselect Layers', exact: true }).click();
  out = await project(page);
  frame = out.history[out.index];
  expect(frame.selectedLayerIds).toEqual([]);
});

test('duplicate, group, isolate and delete operate on the selected layer set with undo', async ({
  page,
}) => {
  await drawShape(page, 0.1, 0.1, 0.08, 0.06);
  await drawShape(page, 0.35, 0.2, 0.08, 0.06);
  await page.getByRole('button', { name: 'Select layer Shape 1', exact: true }).click();
  await page.getByRole('button', { name: 'Select layer Shape 2', exact: true }).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Duplicate layer', exact: true }).click();
  let out = await project(page);
  let frame = out.history[out.index];
  expect(frame.layers).toHaveLength(5);
  expect(frame.selectedLayerIds).toHaveLength(2);
  expect(frame.layers.filter((layer) => layer.name.endsWith('copy'))).toHaveLength(2);
  await page.getByRole('button', { name: 'Group active layer', exact: true }).click();
  out = await project(page);
  frame = out.history[out.index];
  const selected = new Set(frame.selectedLayerIds);
  expect(selected.size).toBe(2);
  expect(frame.layers.filter((layer) => selected.has(layer.id)).every((layer) => layer.groupId)).toBe(true);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Isolate Layers', exact: true }).click();
  out = await project(page);
  frame = out.history[out.index];
  expect(frame.layers.filter((layer) => layer.visible)).toHaveLength(2);
  await page.getByRole('button', { name: 'Delete layer', exact: true }).click();
  out = await project(page);
  frame = out.history[out.index];
  expect(frame.layers).toHaveLength(3);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  out = await project(page);
  expect(out.history[out.index].layers).toHaveLength(5);
});
