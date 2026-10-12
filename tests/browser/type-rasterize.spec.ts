import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';
import { test, expect, type Page } from '@playwright/test';

type Project = {
  history: Array<{ layers: Array<{ kind: string; asset?: string; text?: string }> }>;
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
};

const project = async (page: Page): Promise<Project> => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as Project;
};

const addText = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await selectTool(page, 'Text');
  await page.getByLabel('Text content', { exact: true }).fill('Rasterize me');
  const canvas = page.getByTestId('editor-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await expect.poll(async () => {
    const current = await project(page);
    return current.history[current.index].layers.some((layer) => layer.kind === 'text' && layer.text === 'Rasterize me');
  }).toBe(true);
};

test.beforeEach(async ({ page }) => prepare(page));

test('Type > Rasterize Type Layer converts editable text to pixels and undo restores it', async ({ page }) => {
  await addText(page);
  const before = await project(page);
  const textLayer = before.history[before.index].layers.at(-1)!;
  expect(textLayer).toMatchObject({ kind: 'text', text: 'Rasterize me' });

  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Rasterize Type Layer', exact: true })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Rasterize Type Layer', exact: true }).click();
  await expect(page.getByText('Layer rasterized. Undo restores editable content.', { exact: true })).toBeVisible();

  const rasterized = await project(page);
  const rasterLayer = rasterized.history[rasterized.index].layers.at(-1)!;
  expect(rasterLayer.kind).toBe('raster');
  expect(rasterLayer.asset).toBeTruthy();
  expect(rasterized.assets[rasterLayer.asset!].w).toBeGreaterThan(0);
  expect(rasterized.assets[rasterLayer.asset!].h).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  const undone = await project(page);
  expect(undone.history[undone.index].layers.at(-1)).toMatchObject({ kind: 'text', text: 'Rasterize me' });
});

test('Type > Rasterize Type Layer is scoped to unlocked text layers', async ({ page }) => {
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Rasterize Type Layer', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await addText(page);
  await page.getByLabel('Lock layer', { exact: true }).check();
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Rasterize Type Layer', exact: true })).toBeDisabled();
});
