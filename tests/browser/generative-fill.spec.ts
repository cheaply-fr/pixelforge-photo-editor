import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

type Layer = {
  kind: string;
  asset?: string;
  contentAwareFills?: Array<Record<string, unknown>>;
};
type Project = {
  history: Array<{ layers: Layer[]; selection?: unknown }>;
  index: number;
  assets: Record<string, { url: string; w: number; h: number }>;
};

async function openEditor(page: Page) {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
}

async function selectRegion(page: Page) {
  await selectTool(page, 'Select');
  const canvas = page.getByTestId('editor-canvas');
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * 0.35, bounds.y + bounds.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.65, bounds.y + bounds.height * 0.65, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByText('Rectangular selection created', { exact: true })).toBeVisible();
}

async function project(page: Page): Promise<Project> {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as Project;
}

test.beforeEach(async ({ page }) => openEditor(page));

test('Generative Fill applies a private local texture operation and survives reload', async ({ page }) => {
  await selectRegion(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Generative Fill…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  const dialog = page.getByRole('dialog', { name: 'Generative Fill' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Generative Fill description').fill('soft blue fabric');
  await dialog.getByLabel('Generative Fill radius').fill('18');
  await dialog.getByLabel('Generative Fill seed').fill('42');
  await dialog.getByRole('button', { name: 'Apply local fill', exact: true }).click();
  await expect(page.getByText(/Local Generative Fill applied/, { exact: false })).toBeVisible();
  const saved = await project(page);
  const layer = saved.history[saved.index].layers.at(-1)!;
  expect(layer.contentAwareFills).toHaveLength(1);
  expect(layer.contentAwareFills![0]).toMatchObject({
    mode: 'texture',
    prompt: 'soft blue fabric',
    radius: 18,
    opacity: 1,
    seed: 42,
  });
  expect(saved.assets[String(layer.contentAwareFills![0].mask)]).toBeTruthy();
  const sourceAsset = layer.asset;
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const reloaded = await project(page);
  const restored = reloaded.history[reloaded.index].layers.at(-1)!;
  expect(restored.asset).toBe(sourceAsset);
  expect(restored.contentAwareFills).toHaveLength(1);
  expect(restored.contentAwareFills![0]).toMatchObject({ mode: 'texture', seed: 42 });
});

test('Generative Fill is guarded without a selection and on locked layers', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Generative Fill…', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await selectRegion(page);
  await page.getByLabel('Lock layer', { exact: true }).check();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Generative Fill…', exact: true })).toBeDisabled();
});
