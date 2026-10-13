import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

const openEditor = async (page: Page) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
};

const project = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return (await downloadedProject((await download.path())!)) as unknown as {
    history: Array<{ active: string; layers: Array<{ id: string; asset: string }>; selection?: unknown }>;
    index: number;
  };
};

test.beforeEach(async ({ page }) => openEditor(page));

test('Content-Aware Scale transforms an explicit selection and survives reload', async ({ page }) => {
  await selectTool(page, 'Select');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.28, box.y + box.height * 0.28);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.45, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByText('Rectangular selection created', { exact: true })).toBeVisible();
  const before = await project(page);
  const beforeFrame = before.history[before.index];
  const beforeAsset = beforeFrame.layers.find((layer) => layer.id === beforeFrame.active)!.asset;
  page.on('dialog', async (dialog) => {
    await dialog.accept(dialog.message().includes('horizontally') ? '125' : '80');
  });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Content-Aware Scale…', exact: true }).click();
  await expect(page.getByText('Content-Aware Scale applied locally; undo restores the original pixels', { exact: true })).toBeVisible();
  const after = await project(page);
  const afterFrame = after.history[after.index];
  const afterAsset = afterFrame.layers.find((layer) => layer.id === afterFrame.active)!.asset;
  expect(after.index).toBeGreaterThan(before.index);
  expect(afterAsset).not.toBe(beforeAsset);
  expect(afterFrame.selection).toBeTruthy();
  await page.reload();
  const reloaded = await project(page);
  expect(reloaded.history[reloaded.index].layers.find((layer) => layer.id === reloaded.history[reloaded.index].active)!.asset).toBe(afterAsset);
});

