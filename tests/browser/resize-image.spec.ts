import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

/**
 * The resize dialog is intentionally exercised through the public editor UI.
 * These tests run in both projects in playwright.config.ts (desktop Chrome and
 * Pixel 7), so a control that works only at desktop dimensions cannot quietly
 * regress.
 */
const beforeEachEditor = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Saved on this device');
};

const openResize = async (page: Page) => {
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Resize image…', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Image Size', exact: true })).toBeVisible();
  return dialog;
};

const dimensions = (page: Page) =>
  page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => ({
    width: canvas.width,
    height: canvas.height,
  }));

const savedDraftDimensions = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ width: number; height: number } | null>((resolve, reject) => {
        const id = new URL(location.href).hash.match(/^#draft=([a-f0-9-]{36})$/)?.[1];
        if (!id) return resolve(null);
        const opened = indexedDB.open('pixelforge-documents', 2);
        opened.onerror = () => reject(opened.error);
        opened.onsuccess = () => {
          const database = opened.result;
          const tx = database.transaction(['drafts', 'draftBlobs']);
          const request = tx.objectStore('drafts').get(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const pointer = request.result as {
              history?: Array<{ w: number; h: number }>;
              index?: number;
              kind?: string;
              chunks?: string[];
            } | undefined;
            if (!pointer?.kind || !Array.isArray(pointer.chunks)) {
              const frame = pointer?.history?.[pointer.index ?? -1];
              resolve(frame ? { width: frame.w, height: frame.h } : null);
              database.close();
              return;
            }
            const chunks = pointer.chunks.map((key) =>
              tx.objectStore('draftBlobs').get(key),
            );
            const values: ArrayBuffer[] = [];
            chunks.forEach((chunk, index) => {
              chunk.onsuccess = () => {
                values[index] = (chunk.result as { bytes: ArrayBuffer }).bytes;
              };
            });
            tx.oncomplete = () => {
              const payload = new Uint8Array(values.reduce((total, value) => total + value.byteLength, 0));
              let offset = 0;
              values.forEach((value) => { payload.set(new Uint8Array(value), offset); offset += value.byteLength; });
              const draft = JSON.parse(new TextDecoder().decode(payload)) as { history?: Array<{ w: number; h: number }>; index?: number };
              const frame = draft.history?.[draft.index ?? -1];
              resolve(frame ? { width: frame.w, height: frame.h } : null);
              database.close();
            };
          };
        };
      }),
  );

const project = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  const path = await download.path();
  return await downloadedProject(path!) as {
    history: Array<{ w: number; h: number; imageSize?: { resolution: number; resolutionUnit: string } }>;
    index: number;
  };
};

test.beforeEach(async ({ page }) => beforeEachEditor(page));

test('Image Size opens from the menu with safe defaults and a responsive dialog', async ({
  page,
}) => {
  const dialog = await openResize(page);
  await expect(dialog.getByLabel('Width (px)', { exact: true })).toHaveValue('1440');
  await expect(dialog.getByLabel('Height (px)', { exact: true })).toHaveValue('960');
  await expect(dialog.getByLabel('Keep proportions', { exact: true })).toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Apply resize', exact: true })).toBeEnabled();

  // On the mobile project this guards against the dialog being clipped by a
  // fixed desktop width. On desktop it also catches accidental off-screen
  // placement after menu/layout changes.
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
});

test('Image menu exposes one canonical resize command', async ({ page }) => {
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await expect(
    page.getByRole('menuitem', { name: 'Image Size…', exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('menuitem', { name: 'Resize image…', exact: true }),
  ).toHaveCount(0);
});

test('locked dimensions preserve aspect ratio while unlocked dimensions stay independent', async ({
  page,
}) => {
  const dialog = await openResize(page);
  const width = dialog.getByLabel('Width (px)', { exact: true });
  const height = dialog.getByLabel('Height (px)', { exact: true });

  await width.fill('720');
  await expect(height).toHaveValue('480');
  await height.fill('300');
  await expect(width).toHaveValue('450');

  await dialog.getByLabel('Keep proportions', { exact: true }).uncheck();
  await width.fill('1000');
  await height.fill('700');
  await expect(width).toHaveValue('1000');
  await expect(height).toHaveValue('700');
  await dialog.getByRole('button', { name: 'Apply resize', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1000');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('height', '700');
});

test('percentage presets set both dimensions atomically and can be cancelled', async ({
  page,
}) => {
  const before = await dimensions(page);
  const dialog = await openResize(page);
  await dialog.getByRole('button', { name: '50%', exact: true }).click();
  await expect(dialog.getByLabel('Width (px)', { exact: true })).toHaveValue('720');
  await expect(dialog.getByLabel('Height (px)', { exact: true })).toHaveValue('480');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect.poll(() => dimensions(page)).toEqual(before);

  const reopened = await openResize(page);
  await reopened.getByRole('button', { name: '150%', exact: true }).click();
  await expect(reopened.getByLabel('Width (px)', { exact: true })).toHaveValue('2160');
  await expect(reopened.getByLabel('Height (px)', { exact: true })).toHaveValue('1440');
  await reopened.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect.poll(() => dimensions(page)).toEqual(before);
});

test('invalid dimensions are visibly rejected and never mutate the document', async ({
  page,
}) => {
  const before = await dimensions(page);
  const dialog = await openResize(page);
  const width = dialog.getByLabel('Width (px)', { exact: true });
  const height = dialog.getByLabel('Height (px)', { exact: true });
  const apply = dialog.getByRole('button', { name: 'Apply resize', exact: true });

  await width.fill('0');
  await expect(dialog.getByText('Choose whole dimensions up to 16,000 pixels and 16 megapixels total.', { exact: true })).toBeVisible();
  await expect(apply).toBeDisabled();
  await expect.poll(() => dimensions(page)).toEqual(before);

  await width.fill('16000');
  await height.fill('16000');
  await expect(apply).toBeDisabled();
  await expect.poll(() => dimensions(page)).toEqual(before);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect.poll(() => dimensions(page)).toEqual(before);
});

test('Escape closes Image Size without applying draft changes', async ({ page }) => {
  const before = await dimensions(page);
  const dialog = await openResize(page);
  await dialog.getByLabel('Width (px)', { exact: true }).fill('800');
  await expect(dialog.getByLabel('Height (px)', { exact: true })).toHaveValue('533');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect.poll(() => dimensions(page)).toEqual(before);
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
});

test('applied resize is undoable, persists after reload, and remains a pixel operation', async ({
  page,
}) => {
  const dialog = await openResize(page);
  await dialog.getByLabel('Width (px)', { exact: true }).fill('720');
  await expect(dialog.getByLabel('Height (px)', { exact: true })).toHaveValue('480');
  await dialog.getByRole('button', { name: 'Apply resize', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '720');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('height', '480');
  // Verify the IndexedDB record itself, rather than accepting the previous
  // "Saved" status left over from opening the editor. Undo/redo is an
  // independent contract and should never make the reload check ambiguous.
  await expect.poll(() => savedDraftDimensions(page)).toEqual({ width: 720, height: 480 });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '720');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('height', '480');

  // The keyboard shortcut is part of the same contract as the menu command.
  await page.keyboard.press('Control+Alt+z');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1440');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('height', '960');
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '720');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('height', '480');
});

test('Image Size can be opened from the Photoshop shortcut and dismissed safely', async ({
  page,
}) => {
  await page.keyboard.press('Control+Alt+i');
  await expect(page.getByRole('heading', { name: 'Resize image', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('physical units, Fit To presets, and resampling methods expose a deterministic preview', async ({
  page,
}) => {
  const dialog = await openResize(page);
  const width = dialog.getByLabel('Width (px)', { exact: true });
  const height = dialog.getByLabel('Height (px)', { exact: true });
  const widthUnit = dialog.getByLabel('Width unit', { exact: true });
  const fit = dialog.getByLabel('Fit To', { exact: true });
  const preview = dialog.getByRole('status').first();

  await widthUnit.selectOption('inches');
  await expect(dialog.getByLabel('Width (inches)', { exact: true })).toHaveValue('20.00');
  await fit.selectOption('25');
  await expect(dialog.getByLabel('Width (px)', { exact: true })).toHaveValue('360');
  await expect(dialog.getByLabel('Height (px)', { exact: true })).toHaveValue('240');
  await expect(preview).toContainText('360 × 240 px');
  await expect(preview).toContainText('0.09 MP');
  await expect(dialog.getByLabel('Resample method', { exact: true })).toHaveValue('automatic');
  await dialog.getByLabel('Resample method', { exact: true }).selectOption('nearest');
  await expect(dialog.getByLabel('Resample method', { exact: true })).toHaveValue('nearest');
  // Switching Fit To returns the dimensions to pixels so the preview is
  // unambiguous and the two fields can be copied into export workflows.
  await fit.selectOption('Original Size');
  await expect(width).toHaveValue('1440');
  await expect(height).toHaveValue('960');
});

test('turning resampling off keeps pixels while allowing print resolution metadata to change', async ({
  page,
}) => {
  const dialog = await openResize(page);
  await dialog.getByLabel('Resample', { exact: true }).uncheck();
  await expect(dialog.getByLabel('Resample method', { exact: true })).toBeDisabled();
  await expect(dialog.getByText('Resampling off: pixel dimensions stay 1440 × 960; only print metadata changes.', { exact: true })).toBeVisible();
  await dialog.getByLabel('Resolution', { exact: true }).fill('300');
  await dialog.getByLabel('Width (px)', { exact: true }).fill('720');
  await dialog.getByRole('button', { name: 'Apply resize', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1440');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('height', '960');
  const saved = await project(page);
  const frame = saved.history[saved.index];
  expect(frame.w).toBe(1440);
  expect(frame.h).toBe(960);
  expect(frame.imageSize).toEqual({ resolution: 300, resolutionUnit: 'ppi' });

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await openResize(page);
  await expect(page.getByLabel('Resolution', { exact: true })).toHaveValue('300');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1440');
});

test('resolution bounds are announced and prevent an unsafe submission', async ({ page }) => {
  const before = await dimensions(page);
  const dialog = await openResize(page);
  const resolution = dialog.getByLabel('Resolution', { exact: true });
  const apply = dialog.getByRole('button', { name: 'Apply resize', exact: true });
  await resolution.fill('0');
  await expect(apply).toBeDisabled();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect.poll(() => dimensions(page)).toEqual(before);
  await resolution.fill('2401');
  await expect(apply).toBeDisabled();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect.poll(() => dimensions(page)).toEqual(before);
});
