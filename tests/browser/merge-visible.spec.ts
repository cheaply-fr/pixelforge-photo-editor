import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

async function project(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const download = await pending;
  const path = await download.path();
  return await downloadedProject(path!) as {
    history: Array<{
      w: number;
      h: number;
      layers: Array<Record<string, unknown>>;
      groups?: unknown[];
      artboards?: Array<{
        id: string;
        name: string;
        x: number;
        y: number;
        w: number;
        h: number;
        visible: boolean;
        locked: boolean;
        layerIds?: string[];
      }>;
    }>;
    index: number;
  };
}

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
});

test('merges grouped RGBA output, retains undo/redo and reload project state', async ({
  page,
}) => {
  const canvas = page.getByTestId('editor-canvas');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'New transparent document', exact: true })
    .click();
  await page.keyboard.press('Shift+F5');
  await expect
    .poll(() =>
      canvas.evaluate((item: HTMLCanvasElement) =>
        Array.from(item.getContext('2d')!.getImageData(12, 12, 1, 1).data),
      ),
    )
    .toEqual([255, 92, 53, 255]);

  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Duplicate Layer/ }).click();
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Hide Layers/ }).click();
  await expect(
    page.getByRole('button', {
      name: 'Select layer Background copy',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Select layer Background', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Group active layer', exact: true })
    .click();
  const opacity = page.getByLabel('Group opacity Group 1', { exact: true });
  await opacity.fill('50');
  await expect
    .poll(() =>
      canvas.evaluate((item: HTMLCanvasElement) =>
        Array.from(item.getContext('2d')!.getImageData(12, 12, 1, 1).data),
      ),
    )
    .toEqual([255, 92, 52, 128]);

  // Give the frame an explicit full-source artboard before merging. The
  // resulting composite must replace those membership IDs after the merge,
  // then survive project export/import below.
  const beforeMerge = await project(page);
  const mergeFrame = beforeMerge.history[beforeMerge.index];
  const visibleSourceIds = mergeFrame.layers
    .filter((item) => item.visible !== false)
    .map((item) => String(item.id));
  mergeFrame.artboards = [
    {
      id: 'full-frame',
      name: 'Full frame',
      x: 0,
      y: 0,
      w: mergeFrame.w,
      h: mergeFrame.h,
      visible: true,
      locked: false,
      layerIds: visibleSourceIds,
    },
  ];
  await page.getByTestId('project-input').setInputFiles({
    name: 'merge-visible-artboard.pixelforge',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(beforeMerge)),
  });
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await expect(
    page.getByRole('menuitem', { name: 'Merge Visible', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('menuitem', { name: 'Merge Visible', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: /Layers/ })).toContainText(
    '2 /',
  );
  await expect
    .poll(() =>
      canvas.evaluate((item: HTMLCanvasElement) =>
        Array.from(item.getContext('2d')!.getImageData(12, 12, 1, 1).data),
      ),
    )
    .toEqual([255, 92, 52, 128]);
  let saved = await project(page);
  expect(saved.history[saved.index].layers).toHaveLength(2);
  expect(
    saved.history[saved.index].layers.filter((item) => item.visible === false),
  ).toHaveLength(1);
  expect(saved.history[saved.index].groups || []).toHaveLength(0);
  expect(saved.history[saved.index].layers[0]).toMatchObject({
    kind: 'raster',
    visible: true,
  });
  expect(saved.history[saved.index].artboards?.[0].layerIds).toEqual([
    saved.history[saved.index].layers[0].id,
  ]);

  // Import the exact exported project into the live editor before exercising
  // history travel, proving the merged asset and hidden source survive the
  // interchange boundary as well as local reload.
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const importDownloadPending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const importDownload = await importDownloadPending;
  const importPath = await importDownload.path();
  await page.getByTestId('project-input').setInputFiles(importPath!);
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect
    .poll(() =>
      canvas.evaluate((item: HTMLCanvasElement) =>
        Array.from(item.getContext('2d')!.getImageData(12, 12, 1, 1).data),
      ),
    )
    .toEqual([255, 92, 52, 128]);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByRole('heading', { name: /Layers/ })).toContainText(
    '2 /',
  );
  await expect(
    page.getByLabel('Group opacity Group 1', { exact: true }),
  ).toBeVisible();
  saved = await project(page);
  expect(saved.history[saved.index].groups).toHaveLength(1);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await expect(page.getByRole('heading', { name: /Layers/ })).toContainText(
    '2 /',
  );
  await expect(
    page.getByLabel('Group opacity Group 1', { exact: true }),
  ).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect
    .poll(() =>
      canvas.evaluate((item: HTMLCanvasElement) =>
        Array.from(item.getContext('2d')!.getImageData(12, 12, 1, 1).data),
      ),
    )
    .toEqual([255, 92, 52, 128]);
  saved = await project(page);
  expect(saved.history[saved.index].artboards?.[0].layerIds).toEqual([
    saved.history[saved.index].layers[0].id,
  ]);
  expect(saved.history[saved.index].layers).toHaveLength(2);
});
