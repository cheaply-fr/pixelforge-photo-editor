import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';

async function project(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return downloadedProject((await download.path())!);
}

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

test('Language Options persist direction and hyphenation intent on editable text', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('Text tool', { exact: true }).click();
  await page.getByTestId('editor-canvas').click({ position: { x: 96, y: 96 } });
  await expect(page.getByText('Editable text layer added', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Language Options', exact: true })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Language Options', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Language Options' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Text language', { exact: true }).selectOption('ar');
  await dialog.getByLabel('Text direction', { exact: true }).selectOption('auto');
  await dialog.getByLabel('Text hyphenation', { exact: true }).check();
  const before = await page.getByTestId('editor-canvas').evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await page.getByRole('button', { name: 'Apply language options', exact: true }).click();
  await expect(page.getByText('Language options updated; undo restores the previous text direction', { exact: true })).toBeVisible();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  const after = await page.getByTestId('editor-canvas').evaluate((element: HTMLCanvasElement) => element.toDataURL());
  expect(after).not.toBe(before);

  const saved = await project(page);
  const layer = saved.history[saved.index].layers.find((item: { kind: string }) => item.kind === 'text') as { languageOptions: { language: string; direction: string; hyphenation: boolean } };
  expect(layer.languageOptions).toEqual({ language: 'ar', direction: 'auto', hyphenation: true });

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Text language', { exact: true })).toHaveValue('ar');
  await expect(page.getByLabel('Text direction', { exact: true })).toHaveValue('auto');
  await expect(page.getByLabel('Text hyphenation', { exact: true })).toBeChecked();
  await page.getByTestId('project-input').setInputFiles({
    name: 'language-options.pixelforge', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(page.getByText('Project opened with editable layers and history', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Text language', { exact: true })).toHaveValue('ar');
});

test('Language Options is guarded for non-text and locked layers', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Language Options', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByLabel('Text tool', { exact: true }).click();
  await page.getByTestId('editor-canvas').click({ position: { x: 90, y: 90 } });
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Lock Layers…', exact: true }).click();
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Language Options', exact: true })).toBeDisabled();
});

