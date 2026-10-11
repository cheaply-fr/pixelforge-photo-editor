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
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as {
    history: Array<{
      layers: Array<{ id: string; name: string; locked?: boolean; groupId?: string }>;
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
  await page.mouse.move(
    box.x + box.width * (x + w),
    box.y + box.height * (y + h),
    { steps: 4 },
  );
  await page.mouse.up();
};

const layerMenu = (page: Page) => page.getByRole('menu', { name: 'Layer menu' });
const additiveModifier: 'Meta' | 'Control' =
  process.platform === 'darwin' ? 'Meta' : 'Control';

test.beforeEach(async ({ page }) => editor(page));

test('Arrange commands move selected layers as a stable block and persist through undo/reload', async ({
  page,
}) => {
  await drawShape(page, 0.08, 0.1, 0.08, 0.06);
  await drawShape(page, 0.3, 0.2, 0.08, 0.06);
  await drawShape(page, 0.55, 0.3, 0.08, 0.06);

  const shape1 = page.getByRole('button', { name: 'Select layer Shape 1', exact: true });
  const shape2 = page.getByRole('button', { name: 'Select layer Shape 2', exact: true });
  await shape1.click();
  await shape2.click({ modifiers: ['Shift'] });

  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  const menu = layerMenu(page);
  await expect(menu.getByRole('menuitem', { name: 'Bring to Front', exact: true })).toBeEnabled();
  await menu.getByRole('menuitem', { name: 'Bring to Front', exact: true }).click();

  let out = await project(page);
  let frame = out.history[out.index];
  expect(frame.layers.map((layer) => layer.name)).toEqual([
    'Background',
    'Shape 3',
    'Shape 1',
    'Shape 2',
  ]);
  expect(frame.selectedLayerIds).toHaveLength(2);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  out = await project(page);
  frame = out.history[out.index];
  expect(frame.layers.map((layer) => layer.name)).toEqual([
    'Background',
    'Shape 1',
    'Shape 2',
    'Shape 3',
  ]);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  out = await project(page);
  frame = out.history[out.index];
  expect(frame.layers.map((layer) => layer.name)).toEqual([
    'Background',
    'Shape 3',
    'Shape 1',
    'Shape 2',
  ]);
  expect(frame.selectedLayerIds).toHaveLength(2);
});

test('Arrange menu disables boundary, locked and grouped moves', async ({ page }) => {
  await drawShape(page, 0.1, 0.1, 0.08, 0.06);
  await drawShape(page, 0.35, 0.2, 0.08, 0.06);

  const top = page.getByRole('button', { name: 'Select layer Shape 2', exact: true });
  await top.click();
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  let menu = layerMenu(page);
  await expect(menu.getByRole('menuitem', { name: 'Bring to Front', exact: true })).toBeDisabled();
  await expect(menu.getByRole('menuitem', { name: 'Bring Forward', exact: true })).toBeDisabled();
  await expect(menu.getByRole('menuitem', { name: 'Send to Back', exact: true })).toBeEnabled();
  await menu.getByRole('menuitem', { name: 'Send to Back', exact: true }).click();

  const bottom = page.getByRole('button', { name: 'Select layer Shape 2', exact: true });
  await bottom.click();
  await page.getByLabel('Lock layer', { exact: true }).check();
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  menu = layerMenu(page);
  await expect(menu.getByRole('menuitem', { name: 'Bring Forward', exact: true })).toBeDisabled();
  await menu.getByRole('menuitem', { name: 'Bring Forward', exact: true }).press('Escape');

  await page.getByLabel('Lock layer', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Group active layer', exact: true }).click();
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  menu = layerMenu(page);
  await expect(menu.getByRole('menuitem', { name: 'Bring Forward', exact: true })).toBeDisabled();
  await expect(menu.getByRole('menuitem', { name: 'Send Backward', exact: true })).toBeDisabled();
});

test('Arrange commands retain platform modifier selection semantics', async ({ page }) => {
  await drawShape(page, 0.1, 0.1, 0.08, 0.06);
  await drawShape(page, 0.35, 0.2, 0.08, 0.06);
  const shape1 = page.getByRole('button', { name: 'Select layer Shape 1', exact: true });
  const shape2 = page.getByRole('button', { name: 'Select layer Shape 2', exact: true });
  await shape1.click();
  await shape2.click({ modifiers: [additiveModifier] });
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await layerMenu(page)
    .getByRole('menuitem', { name: 'Send Backward', exact: true })
    .click();
  const out = await project(page);
  const frame = out.history[out.index];
  expect(frame.selectedLayerIds).toHaveLength(2);
  expect(frame.layers.map((layer) => layer.name)).toEqual([
    'Shape 1',
    'Shape 2',
    'Background',
  ]);
});
