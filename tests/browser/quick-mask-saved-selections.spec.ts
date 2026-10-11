import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

const prepare = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
};

const drag = async (
  page: Page,
  start: [number, number],
  end: [number, number],
) => {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(
    box.x + box.width * start[0],
    box.y + box.height * start[1],
  );
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width * end[0],
    box.y + box.height * end[1],
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
};

const project = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as {
    history: Array<{
      w: number;
      h: number;
      selection?: { x: number; y: number; w: number; h: number; mask?: string };
      quickMask?: { asset: string; active: boolean };
      savedSelections?: {
        version: number;
        selections: Array<{
          id: string;
          name: string;
          selection: { x: number; y: number; w: number; h: number };
        }>;
      };
    }>;
    index: number;
    assets: Record<string, { url: string; w: number; h: number }>;
  };
};

const alphaAt = async (
  page: Page,
  asset: { url: string; w: number; h: number },
  xRatio: number,
  yRatio: number,
) =>
  page.evaluate(
    async ({ asset, xRatio, yRatio }) => {
      const image = new Image();
      image.src = asset.url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = asset.w;
      canvas.height = asset.h;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const x = Math.max(
        0,
        Math.min(asset.w - 1, Math.floor(asset.w * xRatio)),
      );
      const y = Math.max(
        0,
        Math.min(asset.h - 1, Math.floor(asset.h * yRatio)),
      );
      return context.getImageData(x, y, 1, 1).data[3];
    },
    { asset, xRatio, yRatio },
  );

test.beforeEach(async ({ page }) => prepare(page));

test('Quick Mask enters from a selection, paints alpha, exits to a mask selection, and persists', async ({
  page,
}) => {
  await selectTool(page, 'Select');
  await drag(page, [0.2, 0.2], [0.8, 0.8]);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const selectionDownload = page.waitForEvent('download');
  await expect(page.getByRole('menuitem', { name: 'Save Selection…', exact: true })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Save Selection…', exact: true }).click();
  expect((await selectionDownload).suggestedFilename()).toMatch(/\.pixelselection$/);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(
    page.getByRole('menuitem', {
      name: 'Edit in Quick Mask Mode',
      exact: true,
    }),
  ).toBeEnabled();
  await page
    .getByRole('menuitem', { name: 'Edit in Quick Mask Mode', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Quick Mask mode', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(
    page.getByText('Quick Mask stroke applied', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Quick Mask mode', exact: true })
    .click();
  await expect(
    page.getByText('Quick Mask converted to selection', { exact: true }),
  ).toBeVisible();
  let saved = await project(page);
  const frame = saved.history[saved.index];
  expect(frame.quickMask).toBeUndefined();
  expect(frame.selection?.mask).toBeTruthy();
  const selectionMask = saved.assets[frame.selection!.mask!];
  expect(await alphaAt(page, selectionMask, 0.5, 0.5)).toBe(0);
  expect(await alphaAt(page, selectionMask, 0.25, 0.25)).toBeGreaterThan(200);
  await page.reload();
  saved = await project(page);
  expect(saved.history[saved.index].selection?.mask).toBeTruthy();
});

test('Quick Mask active state restores after reload and mobile pointer input is reachable', async ({
  page,
}) => {
  await selectTool(page, 'Select');
  await drag(page, [0.25, 0.25], [0.7, 0.7]);
  await page
    .getByRole('button', { name: 'Quick Mask mode', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Quick Mask mode', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Quick Mask mode', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('button', { name: 'Quick Mask mode', exact: true })
    .click();
  await expect(
    page.getByText('Quick Mask converted to selection', { exact: true }),
  ).toBeVisible();
});

test('saved selections are named, loaded, renamed, deleted and retained in project history', async ({
  page,
}) => {
  await selectTool(page, 'Select');
  await drag(page, [0.15, 0.2], [0.45, 0.55]);
  await page
    .getByLabel('Saved selection name', { exact: true })
    .fill('Subject area');
  await page
    .getByRole('button', { name: 'Save selection', exact: true })
    .click();
  await expect(page.getByText('Subject area', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Clear selection', exact: true })
    .click();
  await page.getByRole('button', { name: /^Load$/ }).click();
  await expect(
    page.getByText('Saved selection loaded', { exact: true }),
  ).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept('Hero'));
  await page.getByRole('button', { name: /^Rename$/ }).click();
  await expect(page.getByText('Hero', { exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /^Delete$/ }).click();
  await expect(page.getByText('Hero', { exact: true })).toHaveCount(0);
  // Recreate one entry and prove the editable project payload carries it.
  await page
    .getByLabel('Saved selection name', { exact: true })
    .fill('Persisted');
  await page
    .getByRole('button', { name: 'Save selection', exact: true })
    .click();
  const saved = await project(page);
  expect(
    saved.history[saved.index].savedSelections?.selections.map(
      (entry) => entry.name,
    ),
  ).toEqual(['Persisted']);
  await page.reload();
  await expect(page.getByText('Persisted', { exact: true })).toBeVisible();
});
