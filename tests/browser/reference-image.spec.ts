import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';
import { openPanel } from './sidebar-panels';

// 4×4 PNG: left half pure blue, right half pure yellow.
const SPLIT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAGUlEQVR4nGNgYPjPwPD//3+G//8ZGIjjAABV+hfp9XV+kwAAAABJRU5ErkJggg==',
  'base64',
);

type Project = {
  history: Array<{
    layers: Array<{ kind: string }>;
    reference?: { asset: string; opacity: number; visible: boolean; locked: boolean; fit: string; sample: boolean; name: string };
  }>;
  index: number;
  assets: Record<string, { w: number; h: number }>;
};

const prepare = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
};

const placeReference = async (page: Page) => {
  await openPanel(page, 'Reference image');
  const panel = page.getByTestId('reference-panel');
  await expect(panel.getByRole('button', { name: 'Place reference image…' })).toBeVisible();
  await page.getByTestId('reference-input').setInputFiles({
    name: 'guide.png',
    mimeType: 'image/png',
    buffer: SPLIT_PNG,
  });
  await expect(page.getByText(/Reference image placed \(4 × 4 px\)/)).toBeVisible();
  await expect(panel.getByTestId('reference-not-exported')).toBeVisible();
};

const exportPngBytes = async (page: Page) => {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Export format').selectOption('png');
  await expect(page.getByLabel('Encoded file size')).toHaveAttribute('data-bytes', /\d+/, {
    timeout: 15_000,
  });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download image', exact: true }).click();
  const bytes = await readFile((await (await pending).path())!);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  return bytes;
};

const downloadProject = async (page: Page): Promise<Project> => {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const path = await (await pending).path();
  return (await downloadedProject(path!)) as Project;
};

test.beforeEach(async ({ page }) => prepare(page));

test('a reference image is shown as an overlay but excluded from export pixels, layers and budget', async ({ page }) => {
  const heading = page.getByRole('heading', { name: /Layers 1 \// });
  await expect(heading).toBeVisible();
  const budget = page.getByTestId('layer-pixel-budget');
  const usage = await budget.textContent();
  const before = await exportPngBytes(page);

  await placeReference(page);
  const overlay = page.getByTestId('reference-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveCSS('opacity', '0.5');
  await expect(overlay).toHaveCSS('pointer-events', 'none');
  await expect(page.getByTestId('reference-disclosure')).toContainText('never exported');
  // Not a layer: count and pixel-budget readout are unchanged.
  await expect(heading).toBeVisible();
  await expect(budget).toHaveText(usage ?? '');

  const after = await exportPngBytes(page);
  expect(Buffer.compare(after, before)).toBe(0);

  // Flatten keeps the reference out of the pixels and keeps it as a guide.
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Flatten Image', exact: true }).click();
  await expect(page.getByTestId('reference-overlay')).toBeVisible();
  expect(Buffer.compare(await exportPngBytes(page), before)).toBe(0);
});

test('opacity, visibility, placement and lock are editable and undoable', async ({ page }) => {
  await placeReference(page);
  const overlay = page.getByTestId('reference-overlay');
  await page.getByRole('slider', { name: 'Reference opacity' }).fill('20');
  await expect(overlay).toHaveCSS('opacity', '0.2');
  await page.getByLabel('Reference placement').selectOption('stretch');
  await expect(overlay).toHaveCSS('object-fit', 'fill');

  await page.getByRole('button', { name: 'Hide reference image' }).click();
  await expect(overlay).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(page.getByTestId('reference-overlay')).toBeVisible();

  await page.getByRole('button', { name: 'Lock reference image' }).click();
  await expect(page.getByRole('slider', { name: 'Reference opacity' })).toBeDisabled();
  await expect(page.getByLabel('Reference placement')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Remove reference' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Replace…' })).toBeDisabled();
  // Visibility stays available while locked.
  await page.getByRole('button', { name: 'Hide reference image' }).click();
  await expect(page.getByTestId('reference-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show reference image' }).click();

  await page.getByRole('button', { name: 'Unlock reference image' }).click();
  await page.getByRole('button', { name: 'Remove reference' }).click();
  await expect(page.getByText('Reference image removed', { exact: true })).toBeVisible();
  await expect(page.getByTestId('reference-overlay')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Place reference image…' })).toBeVisible();
});

test('the eyedropper samples the reference only when asked to', async ({ page }) => {
  await placeReference(page);
  await page.getByLabel('Reference placement').selectOption('stretch');
  await selectTool(page, 'Eyedropper');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  const color = page.getByLabel('Drawing color', { exact: true });

  // Default: the artwork is sampled, not the reference.
  await canvas.click({ position: { x: box.width * 0.25, y: box.height / 2 } });
  await expect(page.getByText('Color sampled from image', { exact: true })).toBeVisible();
  await expect(color).not.toHaveValue('#0000ff');

  await page.getByLabel('Eyedropper samples the reference').check();
  await canvas.click({ position: { x: box.width * 0.25, y: box.height / 2 } });
  await expect(color).toHaveValue('#0000ff');
  await expect(page.getByText('Color sampled from reference image', { exact: true })).toBeVisible();
  await canvas.click({ position: { x: box.width * 0.75, y: box.height / 2 } });
  await expect(color).toHaveValue('#ffff00');

  // Contain placement letterboxes a square reference on a wide canvas.
  await page.getByLabel('Reference placement').selectOption('contain');
  if (box.width > box.height * 1.2) {
    await selectTool(page, 'Eyedropper');
    await canvas.click({ position: { x: 4, y: box.height / 2 } });
    await expect(page.getByText('No reference pixel here; reference not sampled', { exact: true })).toBeVisible();
  }
});

test('the reference persists in projects, drafts and project import', async ({ page }) => {
  await placeReference(page);
  await page.getByRole('slider', { name: 'Reference opacity' }).fill('35');
  await page.getByRole('button', { name: 'Lock reference image' }).click();
  const pendingFile = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const projectPath = (await (await pendingFile).path())!;
  const project = (await downloadedProject(projectPath)) as Project;
  const frame = project.history[project.index];
  expect(frame.layers).toHaveLength(1);
  expect(frame.reference).toMatchObject({ name: 'guide.png', opacity: 0.35, locked: true, visible: true, fit: 'contain' });
  expect(project.assets[frame.reference!.asset]).toMatchObject({ w: 4, h: 4 });

  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await openPanel(page, 'Reference image');
  await expect(page.getByTestId('reference-name')).toHaveText('guide.png');
  await expect(page.getByTestId('reference-overlay')).toHaveCSS('opacity', '0.35');

  // Project import into a fresh document restores the reference.
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await openPanel(page, 'Reference image');
  await expect(page.getByRole('button', { name: 'Place reference image…' })).toBeVisible();
  await page.getByTestId('project-input').setInputFiles(projectPath);
  await expect(page.getByTestId('reference-name')).toHaveText('guide.png');
  await expect(page.getByRole('button', { name: 'Unlock reference image' })).toBeVisible();
});

test('projects without a reference still open with no reference', async ({ page }) => {
  const project = await downloadProject(page);
  expect(project.history[project.index].reference).toBeUndefined();
  // A legacy-shaped project (no reference field) round-trips through import.
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const path = (await (await pending).path())!;
  await page.getByTestId('project-input').setInputFiles(path);
  await expect(page.getByRole('heading', { name: /Layers 1 \// })).toBeVisible();
  await openPanel(page, 'Reference image');
  await expect(page.getByRole('button', { name: 'Place reference image…' })).toBeVisible();
});
