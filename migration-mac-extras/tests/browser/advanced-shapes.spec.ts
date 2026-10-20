import { test, expect, type Page } from '@playwright/test';

const saved = async (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');

const project = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return JSON.parse(await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8'));
};

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await saved(page);
});

test('triangle and star variants stay editable and survive reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Polygon tool', exact: true }).click();
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByLabel('Shape type', { exact: true })).toBeVisible();
  await page.getByLabel('Filled shape', { exact: true }).check();
  await page.getByLabel('Shape type', { exact: true }).selectOption('star');
  await page.getByLabel('Polygon sides', { exact: true }).fill('7');
  await page.getByLabel('Polygon sides', { exact: true }).press('Enter');
  await saved(page);
  let exported = await project(page);
  let layer = exported.history[exported.index].layers[1];
  expect(layer).toMatchObject({ kind: 'polygon', variant: 'star', sides: 7, fill: true });
  await page.getByLabel('Shape type', { exact: true }).selectOption('triangle');
  await saved(page);
  exported = await project(page);
  layer = exported.history[exported.index].layers[1];
  expect(layer).toMatchObject({ kind: 'polygon', variant: 'triangle', sides: 7 });
  await page.reload();
  await expect(page.getByLabel('Shape type', { exact: true })).toHaveValue('triangle');
  exported = await project(page);
  expect(exported.history[exported.index].layers[1]).toMatchObject({ variant: 'triangle', sides: 7 });
});

test('invalid shape variants are rejected without replacing the current draft', async ({ page }) => {
  await page.getByRole('button', { name: 'Polygon tool', exact: true }).click();
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4, { steps: 3 });
  await page.mouse.up();
  await saved(page);
  const original = await project(page);
  const invalid = structuredClone(original);
  invalid.history[invalid.index].layers[1].variant = 'hexagon';
  await page.getByTestId('project-input').setInputFiles({
    name: 'invalid.pixelforge', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await expect(page.locator('footer')).toContainText('Invalid layer document');
  expect(await project(page)).toEqual(original);
});
