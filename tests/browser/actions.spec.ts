import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => window.localStorage.removeItem('pixelforge.actions.v1'));
});

async function openActions(page: Page) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Action recipes…' }).click();
  await expect(page.getByTestId('actions-dialog')).toBeVisible();
}

test('records an allow-listed filter command, persists it, and replays it', async ({ page }) => {
  await openActions(page);
  await page.getByLabel('Recipe name').fill('Web finish');
  await page.getByTestId('start-action-recording').click();
  await expect(page.getByTestId('actions-recording')).toContainText('Web finish');
  await page.getByRole('button', { name: 'Close action recipes' }).click();

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Vivid', exact: true }).click();
  await expect(page.getByLabel('Draft save status')).toHaveText('Saved on this device');

  await openActions(page);
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page.getByText('Web finish', { exact: true })).toBeVisible();
  await expect(page.getByText('1 step', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('footer > span').first()).toContainText('replayed');

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await openActions(page);
  await expect(page.getByText('Web finish', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Web finish', { exact: true })).toHaveCount(0);
});

test('records and replays the Facet Pixelate command', async ({ page }) => {
  await openActions(page);
  await page.getByLabel('Recipe name').fill('Facet finish');
  await page.getByTestId('start-action-recording').click();
  await page.getByRole('button', { name: 'Close action recipes' }).click();
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Facet…', exact: true }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('facet');
  await openActions(page);
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page.getByText('Facet finish', { exact: true })).toBeVisible();
  await expect(page.getByText('1 step', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('footer > span').first()).toContainText('replayed');
});

test('closes the recipe surface without changing the document', async ({ page }) => {
  const before = await page.getByTestId('editor-canvas').getAttribute('width');
  await openActions(page);
  await page.getByRole('button', { name: 'Close action recipes' }).click();
  await expect(page.getByTestId('actions-dialog')).toHaveCount(0);
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', before || '');
});

test('applies a recorded Action to a bounded image batch and downloads a privacy manifest', async ({ page }) => {
  const onePixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  await openActions(page);
  await page.getByLabel('Recipe name').fill('Batch vivid');
  await page.getByTestId('start-action-recording').click();
  await page.getByRole('button', { name: 'Close action recipes' }).click();
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Vivid', exact: true }).click();
  await openActions(page);
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await page.getByRole('button', { name: 'Batch…', exact: true }).click();
  await page.getByTestId('batch-image-input').setInputFiles({
    name: 'batch-vivid.png',
    mimeType: 'image/png',
    buffer: onePixel,
  });
  await expect(page.getByRole('heading', { name: 'Batch apply “Batch vivid”' })).toBeVisible();
  await page.getByRole('button', { name: 'Apply Action and build ZIP' }).click();
  await expect(page.getByLabel('Batch image export progress')).toHaveText(/1\/1 images/);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download batch ZIP' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/pixelforge-images-batch\.zip$/);
  expect(await download.failure()).toBeNull();
});
