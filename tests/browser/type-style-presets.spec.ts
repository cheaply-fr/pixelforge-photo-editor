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

test('saves and applies default type styles with undo/reload/project persistence', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('Text tool', { exact: true }).click();
  await page.getByTestId('editor-canvas').click({ position: { x: 80, y: 80 } });
  await expect(page.getByText('Editable text layer added', { exact: true })).toBeVisible();
  await page.getByLabel('Layer font size', { exact: true }).fill('84');
  await page.getByLabel('Layer text color', { exact: true }).fill('#224466');
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Save Default Type Styles', exact: true }).click();
  await expect(page.getByText('Default type style saved on this device', { exact: true })).toBeVisible();

  await page.getByLabel('Layer font size', { exact: true }).fill('24');
  await page.getByLabel('Layer text color', { exact: true }).fill('#ff0000');
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Load Default Type Styles', exact: true })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Load Default Type Styles', exact: true }).click();
  await expect(page.getByText('Default type style applied', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Layer font size', { exact: true })).toHaveValue('84');
  await expect(page.getByLabel('Layer text color', { exact: true })).toHaveValue('#224466');
  const saved = await project(page);
  const frame = saved.history[saved.index];
  const text = frame.layers.find((layer: { kind: string }) => layer.kind === 'text') as { fontSize: number; color: string };
  expect(text.fontSize).toBe(84);
  expect(text.color).toBe('#224466');
  expect(saved.settings.defaultTypeStyle).toMatchObject({ fontSize: 84, color: '#224466' });

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByLabel('Layer font size', { exact: true })).toHaveValue('24');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Layer font size', { exact: true })).toHaveValue('84');
  await page.getByTestId('project-input').setInputFiles({
    name: 'type-style.pixelforge', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(page.getByText('Project opened with editable layers and history', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Layer font size', { exact: true })).toHaveValue('84');
});

test('guards default type style commands for non-text and missing-style states', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Save Default Type Styles', exact: true })).toBeDisabled();
  await expect(page.getByRole('menuitem', { name: 'Load Default Type Styles', exact: true })).toBeDisabled();
});

test('keeps the Text tool font choice in the local settings and new editable layer', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('Text tool', { exact: true }).click();
  await page.getByLabel('Text tool font', { exact: true }).selectOption('Georgia');
  await page.getByTestId('editor-canvas').click({ position: { x: 120, y: 120 } });
  await expect(page.getByText('Editable text layer added', { exact: true })).toBeVisible();
  const saved = await project(page);
  const layer = saved.history[saved.index].layers.find((item: { kind: string }) => item.kind === 'text') as { fontFamily: string };
  expect(layer.fontFamily).toBe('Georgia');
  expect(saved.settings.fontFamily).toBe('Georgia');

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Text tool font', { exact: true })).toHaveValue('Georgia');
});
