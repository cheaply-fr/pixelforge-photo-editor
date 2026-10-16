import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );
});

const project = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  const path = await download.path();
  return await downloadedProject(path!) as {
    history: Array<{ layers: Array<{ styles?: Record<string, unknown>; asset?: string }> }>;
    index: number;
    assets: Record<string, unknown>;
  };
};

const canvasPixels = (page: Page) =>
  page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) =>
    Array.from(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data),
  );

test('Layer Styles decorate an editable layer and survive undo, reload and project round trip', async ({ page }) => {
  // Pixel-level full-frame renders and project downloads are intentionally
  // slower on the constrained CI runner than the ordinary editor checks.
  test.setTimeout(120_000);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  // The compact mobile layout scales the canvas; use its actual CSS box while
  // forcing the event through a docked panel that may overlap the canvas.
  const canvas = page.getByTestId('editor-canvas');
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await canvas.click({ position: { x: box!.width / 2, y: box!.height / 2 }, force: true });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  const before = await canvasPixels(page);

  await page.getByLabel('Enable outline', { exact: true }).check();
  await page.getByLabel('Outline width', { exact: true }).press('ArrowRight');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  const after = await canvasPixels(page);
  expect(after).not.toEqual(before);

  let exported = await project(page);
  const styledLayer = exported.history[exported.index].layers.at(-1)!;
  expect(styledLayer.styles).toMatchObject({
    outline: { enabled: true, width: 3 },
    dropShadow: { enabled: false },
  });
  const sourceAsset = styledLayer.asset;
  expect(sourceAsset).toBeTruthy();

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  // Width and enable are separate history entries, so undo both edits.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByLabel('Enable outline', { exact: true })).not.toBeChecked();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  expect(await canvasPixels(page)).toEqual(before);

  await page.getByLabel('Enable drop shadow', { exact: true }).check();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  exported = await project(page);
  const shadowLayer = exported.history[exported.index].layers.at(-1)!;
  expect(shadowLayer.styles).toMatchObject({ dropShadow: { enabled: true } });
  expect(shadowLayer.asset).toBe(sourceAsset);

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Enable drop shadow', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Enable outline', { exact: true })).not.toBeChecked();
  const reloaded = await project(page);
  expect(reloaded.history[reloaded.index].layers.at(-1)!.styles).toMatchObject({
    dropShadow: { enabled: true },
  });
});

test('Layer Style controls are disabled for locked layers', async ({ page }) => {
  await page.getByLabel('Lock layer', { exact: true }).check();
  await expect(page.getByLabel('Enable drop shadow', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Enable outline', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Outline width', { exact: true })).toBeDisabled();
});

test('Color overlay is nondestructive, editable and survives project reload', async ({ page }) => {
  test.setTimeout(120_000);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  const canvas = page.getByTestId('editor-canvas');
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await canvas.click({ position: { x: box!.width / 2, y: box!.height / 2 }, force: true });
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  const before = await canvasPixels(page);
  await page.getByLabel('Enable color overlay', { exact: true }).check();
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  expect(await canvasPixels(page)).not.toEqual(before);
  const exported = await project(page);
  const styledLayer = exported.history[exported.index].layers.at(-1)!;
  expect(styledLayer.styles).toMatchObject({
    colorOverlay: { enabled: true, opacity: 1 },
  });
  const sourceAsset = styledLayer.asset;
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Enable color overlay', { exact: true })).toBeChecked();
  const reloaded = await project(page);
  expect(reloaded.history[reloaded.index].layers.at(-1)!.asset).toBe(sourceAsset);
  expect(reloaded.history[reloaded.index].layers.at(-1)!.styles).toMatchObject({
    colorOverlay: { enabled: true },
  });
});

test('Gradient overlay keeps endpoints editable, source pixels and project reload', async ({ page }) => {
  test.setTimeout(120_000);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  const canvas = page.getByTestId('editor-canvas');
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await canvas.click({ position: { x: box!.width / 2, y: box!.height / 2 }, force: true });
  const before = await canvasPixels(page);
  await page.getByLabel('Enable gradient overlay', { exact: true }).check();
  await page.getByLabel('Gradient overlay start color', { exact: true }).fill('#0011ff');
  await page.getByLabel('Gradient overlay end color', { exact: true }).fill('#ff1100');
  await page.getByLabel('Gradient angle', { exact: true }).fill('90');
  await page.getByLabel('Reverse gradient overlay', { exact: true }).check();
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  expect(await canvasPixels(page)).not.toEqual(before);
  const exported = await project(page);
  const styledLayer = exported.history[exported.index].layers.at(-1)!;
  expect(styledLayer.styles).toMatchObject({
    gradientOverlay: {
      enabled: true,
      startColor: '#0011ff',
      endColor: '#ff1100',
      angle: 90,
      reverse: true,
    },
  });
  const sourceAsset = styledLayer.asset;
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Enable gradient overlay', { exact: true })).toBeChecked();
  const reloaded = await project(page);
  expect(reloaded.history[reloaded.index].layers.at(-1)!.asset).toBe(sourceAsset);
  expect(reloaded.history[reloaded.index].layers.at(-1)!.styles).toMatchObject({
    gradientOverlay: { enabled: true, reverse: true, angle: 90 },
  });
});

test('Layer Style menu activates the existing nondestructive style controls', async ({ page }) => {
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Layer Style', exact: true }).click();
  await expect(page.getByLabel('Enable outline', { exact: true })).toBeFocused();
});
