import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function start(page: Page) {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
}

async function openInfo(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'File Info / Privacy…', exact: true }).click();
  return page.getByRole('dialog', { name: 'File Info & Privacy' });
}

async function downloadProject(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return JSON.parse(await readFile((await download.path())!, 'utf8')) as {
    metadata?: { title: string; description: string; author: string };
    history: unknown[];
  };
}

test.beforeEach(async ({ page }) => start(page));

test('File Info validates multiline metadata, survives project/reload, and image bytes disclose privacy', async ({ page }) => {
  const info = await openInfo(page);
  await info.getByLabel('Document title', { exact: true }).fill('Coastline study');
  await info.getByLabel('Document description', { exact: true }).fill('Line one\nLine two');
  await info.getByLabel('Document author', { exact: true }).fill('PixelForge');
  await info.getByRole('button', { name: 'Save file info', exact: true }).click();
  await expect(info).toBeHidden();
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');

  const saved = await downloadProject(page);
  expect(saved.metadata).toEqual({ title: 'Coastline study', description: 'Line one\nLine two', author: 'PixelForge' });

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Export image' });
  await expect(exportDialog).toContainText('rendered pixels only');
  await expect(exportDialog).toContainText('EXIF/GPS metadata');
  const imageDownload = page.waitForEvent('download');
  await exportDialog.getByRole('button', { name: 'Download image', exact: true }).click();
  const imagePath = await (await imageDownload).path();
  const bytes = await readFile(imagePath!);
  expect(bytes.includes(Buffer.from('PixelForge'))).toBe(false);
  expect(bytes.includes(Buffer.from('Coastline study'))).toBe(false);
  await exportDialog.getByRole('button', { name: 'Close', exact: true }).click();

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const restored = await openInfo(page);
  await expect(restored.getByLabel('Document title', { exact: true })).toHaveValue('Coastline study');
  await expect(restored.getByLabel('Document description', { exact: true })).toHaveValue('Line one\nLine two');
  await expect(restored.getByLabel('Document author', { exact: true })).toHaveValue('PixelForge');
  await restored.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('File Info supports Escape and rejects malformed imported metadata without replacing the current draft', async ({ page }) => {
  const info = await openInfo(page);
  await info.getByLabel('Document description', { exact: true }).evaluate((input) => {
    // Bypass React's value tracker to exercise the same control-character path as imported data.
    // oxlint-disable-next-line typescript/unbound-method
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(input, 'bad\tvalue');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await info.getByRole('button', { name: 'Save file info', exact: true }).click();
  await expect(info.getByTestId('metadata-error')).toBeVisible();
  await info.getByLabel('Document title', { exact: true }).fill('Keep me');
  await info.getByLabel('Document description', { exact: true }).fill('Before import');
  await info.getByLabel('Document author', { exact: true }).fill('Author');
  await info.getByRole('button', { name: 'Save file info', exact: true }).click();
  await expect(info).toBeHidden();
  const source = await downloadProject(page);
  const malformed = { ...source, metadata: { ...source.metadata, unknown: 'reject' } };
  await page.getByTestId('project-input').setInputFiles({
    name: 'malformed.pixelforge',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(malformed)),
  });
  await expect(page.getByText(/Invalid document metadata/)).toBeVisible();
  const retained = await openInfo(page);
  await expect(retained.getByLabel('Document title', { exact: true })).toHaveValue('Keep me');
  await page.keyboard.press('Escape');
  await expect(retained).toBeHidden();
});

test('new documents reset local File Info metadata', async ({ page }) => {
  const info = await openInfo(page);
  await info.getByLabel('Document title', { exact: true }).fill('Old document');
  await info.getByRole('button', { name: 'Save file info', exact: true }).click();
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /^New white document/ }).click();
  const reset = await openInfo(page);
  await expect(reset.getByLabel('Document title', { exact: true })).toHaveValue('');
  await expect(reset.getByLabel('Document description', { exact: true })).toHaveValue('');
  await expect(reset.getByLabel('Document author', { exact: true })).toHaveValue('');
  await reset.getByRole('button', { name: 'Cancel', exact: true }).click();
});
