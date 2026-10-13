import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

const openEditor = async (page: Page) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
};

test.beforeEach(async ({ page }) => openEditor(page));

test('radial gradient has an editable mode, changes pixels, and persists', async ({ page }) => {
  await page.getByRole('button', { name: 'Gradient tool', exact: true }).click();
  const mode = page.getByLabel('Gradient type', { exact: true });
  await expect(mode).toBeVisible();
  await mode.selectOption('radial');
  const dither = page.getByLabel('Dither', { exact: true });
  await dither.fill('58');
  await expect(dither).toHaveValue('58');
  const canvas = page.getByTestId('editor-canvas');
  const before = await canvas.screenshot();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.5, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('footer')).toContainText('Gradient applied; undo restores the original pixels');
  expect(await canvas.screenshot()).not.toEqual(before);

  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  const project = await downloadedProject((await download.path())!);
  expect(project.settings).toMatchObject({ gradientMode: 'radial' });
  await page.reload();
  await expect(page.getByLabel('Gradient type', { exact: true })).toHaveValue('radial');
  await mode.selectOption('reflected');
  await expect(mode).toHaveValue('reflected');
  const end = page.getByLabel('Gradient end', { exact: true });
  await end.selectOption('background');
  await expect(end).toHaveValue('background');
  await page.getByLabel('Gradient midpoint enabled', { exact: true }).check();
  const midpoint = page.getByLabel('Gradient midpoint colour', { exact: true });
  await midpoint.fill('#00ff00');
  await expect(midpoint).toHaveValue('#00ff00');
  const midpointPosition = page.getByLabel('Midpoint position', { exact: true });
  await midpointPosition.fill('64');
  await expect(midpointPosition).toHaveValue('64');
  await page.getByLabel('Reverse gradient', { exact: true }).check();
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const endpointPending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const endpointDownload = await endpointPending;
  const endpointProject = await downloadedProject((await endpointDownload.path())!);
  expect(endpointProject.settings).toMatchObject({
    gradientMode: 'reflected',
    gradientEnd: 'background',
    gradientMidpoint: '#00ff00',
    gradientMidpointPosition: 64,
    gradientDither: 58,
    gradientReverse: true,
  });
});
