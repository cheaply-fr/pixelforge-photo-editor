import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

type Project = {
  history: Array<{
    layers: Array<{
      adjustments?: {
        brightness?: number;
        photoAdjustments?: { temperature?: number };
      };
    }>;
  }>;
  index: number;
};

async function openEditor(page: Page) {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
}

async function project(page: Page): Promise<Project> {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as Project;
}

test.beforeEach(async ({ page }) => openEditor(page));

test('Prompt to Edit applies a private local adjustment and survives reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Prompt to Edit…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  const dialog = page.getByRole('dialog', { name: 'Prompt to Edit' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Prompt to Edit instruction').fill('make it warmer and slightly brighter');
  await dialog.getByRole('button', { name: 'Apply local edit', exact: true }).click();
  await expect(page.getByText(/Prompt to Edit applied locally:.*brighten.*warm/, { exact: false })).toBeVisible();
  const saved = await project(page);
  const layer = saved.history[saved.index].layers.at(-1)!;
  expect(layer.adjustments).toMatchObject({
    brightness: 110,
    photoAdjustments: { temperature: 10 },
  });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const restored = await project(page);
  expect(restored.history[restored.index].layers.at(-1)!.adjustments).toMatchObject({
    brightness: 110,
    photoAdjustments: { temperature: 10 },
  });
});

test('Prompt to Edit fails closed for unsupported text and locked layers', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Prompt to Edit…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Prompt to Edit' });
  await dialog.getByLabel('Prompt to Edit instruction').fill('make the sky cinematic');
  await dialog.getByRole('button', { name: 'Apply local edit', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(page.getByText(/No supported local adjustment/, { exact: false })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByLabel('Lock layer', { exact: true }).check();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Prompt to Edit…', exact: true })).toBeDisabled();
});
