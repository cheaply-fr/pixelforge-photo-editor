import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

test('Define Custom Path saves geometry, reloads it, and applies an editable copy', async ({ page }) => {
  await selectTool(page, 'Pen');
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  for (const [x, y] of [[0.2, 0.2], [0.7, 0.2], [0.45, 0.65], [0.2, 0.2]])
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await expect(page.locator('footer')).toContainText('Editable path layer added');
  page.once('dialog', (dialog) => dialog.accept('Saved triangle'));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Define Custom Path…', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Path preset “Saved triangle” saved on this device');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  expect(project.settings.customPathPresets).toHaveLength(1);
  expect(project.settings.customPathPresets[0].path.nodes).toHaveLength(3);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Direct Selection');
  await expect(page.getByLabel('Saved path preset', { exact: true })).toBeVisible();
  await page.getByLabel('Saved path preset', { exact: true }).selectOption({ label: 'Saved triangle' });
  await expect(page.locator('footer')).toContainText('Path preset “Saved triangle” applied as an editable path layer');
  const applied = await (async () => {
    const next = page.waitForEvent('download');
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
    return downloadedProject((await (await next).path())!);
  })();
  const layers = applied.history[applied.index].layers.filter((layer: { kind: string }) => layer.kind === 'path');
  expect(layers).toHaveLength(2);
  expect(layers[1].path).toMatchObject({
    nodes: layers[0].path.nodes,
    closed: layers[0].path.closed,
    fill: layers[0].path.fill,
    stroke: layers[0].path.stroke,
    strokeWidth: layers[0].path.strokeWidth,
    fillColor: layers[0].path.fillColor,
    strokeColor: layers[0].path.strokeColor,
  });
});
