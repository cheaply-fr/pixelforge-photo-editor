import { expect, test } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

type Project = {
  history: Array<{ layers: Array<{ id: string }>; slices?: Array<{ id: string; name: string; x: number; y: number; width: number; height: number }>; artboards?: Array<{ id: string; name: string; x: number; y: number; w: number; h: number; visible: boolean; locked: boolean; background?: string; layerIds?: string[] }>; activeSliceId?: string; activeArtboardId?: string }>;
  index: number;
};

const setup = async (page: import('@playwright/test').Page) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
};

const downloadProject = async (page: import('@playwright/test').Page): Promise<Project> => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as Project;
};

test.beforeEach(async ({ page }) => setup(page));

test('Slice Select saves a named slice, selects it, and round-trips through reload', async ({ page }) => {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await selectTool(page, 'Slice');
  await page.mouse.move(box.x + box.width * 0.18, box.y + box.height * 0.18);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.58, { steps: 2 });
  await page.mouse.up();
  await expect(page.getByTestId('slice-preview-controls')).toBeVisible();
  await page.getByLabel('Slice name').fill('Hero / card');
  await page.getByTestId('slice-save').click();
  await expect(page.getByTestId('slice-save')).toHaveText('Update slice');
  const project = await downloadProject(page);
  const frame = project.history[project.index];
  expect(frame.slices).toHaveLength(1);
  expect(frame.slices![0].name).toBe('Hero-card');
  expect(frame.activeSliceId).toBe(frame.slices![0].id);

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Slice Select');
  const reloadedBox = (await page.getByTestId('editor-canvas').boundingBox())!;
  await page.mouse.click(reloadedBox.x + reloadedBox.width * 0.35, reloadedBox.y + reloadedBox.height * 0.35);
  await expect(page.getByTestId('slice-save')).toHaveText('Update slice');
  await expect(page.getByLabel('Slice name')).toHaveValue('Hero-card');
  await page.getByLabel('Slice name').fill('Hero-updated');
  await page.getByTestId('slice-save').click();
  await expect(page.getByLabel('Slice name')).toHaveValue('Hero-updated');
  await page.getByTestId('slice-delete').click();
  await expect(page.getByTestId('slice-preview-controls')).toBeHidden();
  expect((await downloadProject(page)).history[0].slices).toBeUndefined();
});

test('Frame creates an artboard viewport, persists its name/background, and cancels on mobile', async ({ page }) => {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await selectTool(page, 'Frame');
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 2 });
  await page.mouse.up();
  await expect(page.getByTestId('frame-preview-controls')).toBeVisible();
  await page.getByLabel('Artboard name').fill('Social card');
  await page.getByLabel('Artboard background').fill('#102030');
  await page.getByTestId('frame-add').click();
  await expect(page.getByTestId('frame-preview-controls')).toBeHidden();
  await expect(page.getByTestId('artboard-controls')).toBeVisible();
  const saved = await downloadProject(page);
  expect(saved.history[saved.index].artboards?.[0]).toMatchObject({ name: 'Social card', background: '#102030' });
  expect(saved.history[saved.index].artboards?.[0].layerIds).toEqual([saved.history[saved.index].layers[0].id]);

  await page.setViewportSize({ width: 390, height: 844 });
  await selectTool(page, 'Frame');
  const mobileBox = (await page.getByTestId('editor-canvas').boundingBox())!;
  await page.mouse.move(mobileBox.x + mobileBox.width * 0.25, mobileBox.y + mobileBox.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(mobileBox.x + mobileBox.width * 0.5, mobileBox.y + mobileBox.height * 0.5, { steps: 2 });
  await page.mouse.up();
  await expect(page.getByTestId('frame-preview-controls')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('frame-preview-controls')).toBeHidden();
  const canceled = await downloadProject(page);
  expect(canceled.history[canceled.index].artboards).toHaveLength(1);
});
