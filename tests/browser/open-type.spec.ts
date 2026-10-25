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

test('OpenType presentation flags persist on editable text layers across project reloads', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('Text tool', { exact: true }).click();
  await page.getByTestId('editor-canvas').click({ position: { x: 96, y: 96 } });
  await expect(page.getByText('Editable text layer added', { exact: true })).toBeVisible();
  await expect(page.getByText('Editable text layer added', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'OpenType', exact: true })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'OpenType', exact: true }).click();
  await expect(page.getByText('OpenType controls are available in the selected text layer inspector', { exact: true })).toBeVisible();

  await page.getByLabel('OpenType ligatures', { exact: true }).uncheck();
  await page.getByLabel('OpenType contextual alternates', { exact: true }).uncheck();
  await page.getByLabel('OpenType discretionary ligatures', { exact: true }).check();
  await page.getByLabel('OpenType kerning', { exact: true }).selectOption('none');
  const beforeSmallCaps = await page.getByTestId('editor-canvas').evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await page.getByLabel('OpenType small caps', { exact: true }).check();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  const afterSmallCaps = await page.getByTestId('editor-canvas').evaluate((element: HTMLCanvasElement) => element.toDataURL());
  expect(afterSmallCaps).not.toBe(beforeSmallCaps);

  const saved = await project(page);
  const layer = saved.history[saved.index].layers.find((item: { kind: string }) => item.kind === 'text') as {
    openType: { ligatures: boolean; discretionaryLigatures: boolean; contextualAlternates: boolean; kerning: string; smallCaps: boolean; variableAxes: { wght: number; wdth: number } };
  };
  expect(layer.openType).toEqual({
    ligatures: false,
    discretionaryLigatures: true,
    contextualAlternates: false,
    kerning: 'none',
    smallCaps: true,
    variableAxes: { wght: 400, wdth: 100 },
  });

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('OpenType kerning', { exact: true })).toHaveValue('none');
  await expect(page.getByLabel('OpenType small caps', { exact: true })).toBeChecked();
  await page.getByTestId('project-input').setInputFiles({
    name: 'open-type.pixelforge', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(page.getByText('Project opened with editable layers and history', { exact: true })).toBeVisible();
  await expect(page.getByLabel('OpenType discretionary ligatures', { exact: true })).toBeChecked();
});

test('OpenType is disabled for non-text and locked layers', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'OpenType', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByLabel('Text tool', { exact: true }).click();
  await page.getByTestId('editor-canvas').click({ position: { x: 90, y: 90 } });
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByRole('menuitem', { name: 'OpenType', exact: true }).click();
  await expect(page.getByLabel('OpenType ligatures')).toBeVisible();
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Lock Layers…', exact: true }).click();
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'OpenType', exact: true })).toBeDisabled();
});

test('variable font axes persist on editable text layers', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('Text tool', { exact: true }).click();
  await page.getByTestId('editor-canvas').click({ position: { x: 96, y: 96 } });
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByRole('menuitem', { name: 'OpenType', exact: true }).click();
  await expect(page.getByLabel('Variable font weight')).toBeVisible();
  await page.getByLabel('Variable font weight').fill('650');
  await page.getByLabel('Variable font width').fill('120');
  await page.reload();
  await expect(page.getByLabel('Variable font weight')).toHaveValue('650');
  await expect(page.getByLabel('Variable font width')).toHaveValue('120');
});
