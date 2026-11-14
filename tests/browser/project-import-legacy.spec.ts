import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

/*
 * Older versions saved File > Download project file as plain JSON with the
 * `.pixelforge` extension. A browser reports no MIME type for that extension,
 * so the import must look at the bytes, not the name or type
 * (docs/portable-project-bundle-contract.md).
 */

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

async function currentProject(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return downloadedProject((await (await pending).path())!);
}

for (const mimeType of ['', 'application/octet-stream']) {
  test(`a legacy JSON .pixelforge project opens with ${mimeType || 'no'} MIME type`, async ({ page }) => {
    await page.getByLabel('Document name').fill('Legacy JSON project');
    // The v2 editable document, exactly as older versions wrote it.
    const legacy = await currentProject(page);
    expect(legacy.version).toBeGreaterThanOrEqual(2);
    await page.getByLabel('Document name').fill('Something else');
    await page.getByTestId('project-input').setInputFiles({
      name: 'old-painting.pixelforge',
      mimeType,
      buffer: Buffer.from(JSON.stringify(legacy)),
    });
    await expect(page.locator('footer')).toContainText('Project opened with editable layers and history');
    await expect(page.getByLabel('Document name')).toHaveValue('Legacy JSON project');
  });
}

test('a current ZIP bundle still opens, and a broken .pixelforge file is refused', async ({ page }) => {
  await page.getByLabel('Document name').fill('Bundle project');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const bundle = await pending;
  await page.getByLabel('Document name').fill('Something else');
  await page.getByTestId('project-input').setInputFiles((await bundle.path())!);
  await expect(page.locator('footer')).toContainText('Project opened with editable layers and history');
  await expect(page.getByLabel('Document name')).toHaveValue('Bundle project');
  await page.getByTestId('project-input').setInputFiles({ name: 'broken.pixelforge', mimeType: '', buffer: Buffer.from('{ "version": 2, oops') });
  await expect(page.locator('footer')).toContainText('Invalid project file');
  await expect(page.getByLabel('Document name')).toHaveValue('Bundle project');
});
