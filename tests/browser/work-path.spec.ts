import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

type SavedLayer = { kind: string; path?: { closed?: boolean; nodes?: unknown[] } };

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

test('Create Work Path converts a selection bounds into an editable path and reloads on desktop/mobile', async ({ page }) => {
  await selectTool(page, 'Select');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.65, { steps: 6 });
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Create Work Path', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText('Work Path created from the selection bounds; edit its anchors with Direct Selection', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await download).path())!);
  const pathLayer = (project.history[project.index].layers as SavedLayer[]).find((layer) => layer.kind === 'path');
  expect(pathLayer?.path?.closed).toBe(true);
  expect(pathLayer?.path?.nodes).toHaveLength(4);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const restoredDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const restored = await downloadedProject((await (await restoredDownload).path())!);
  expect((restored.history[restored.index].layers as SavedLayer[]).find((layer) => layer.kind === 'path')?.path?.nodes).toHaveLength(4);
});
