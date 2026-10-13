import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

type Project = {
  history: Array<{
    w: number;
    h: number;
    artboards?: Array<{
      id: string;
      name: string;
      x: number;
      y: number;
      w: number;
      h: number;
      visible: boolean;
      locked: boolean;
      background?: string;
    }>;
    activeArtboardId?: string;
  }>;
  index: number;
};

const saved = async (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');

const downloadProject = async (page: Page): Promise<Project> => {
  await saved(page);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as Project;
};

const uploadProject = async (page: Page, value: Project) => {
  await page.getByTestId('project-input').setInputFiles({
    name: 'named-artboards.pixelforge',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
};

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await saved(page);
});

test('named artboard metadata imports, displays identity and round-trips through project persistence', async ({ page }) => {
  const project = await downloadProject(page);
  const frame = project.history[project.index];
  frame.artboards = [
    { id: 'hero', name: 'Hero', x: 0, y: 0, w: 640, h: 480, visible: true, locked: false, background: '#ffffff' },
    { id: 'social', name: 'Social', x: 660, y: 0, w: 640, h: 480, visible: true, locked: false, background: '#101820' },
  ];
  frame.activeArtboardId = 'social';
  await uploadProject(page, project);
  await expect(page.locator('.canvas-wrap')).toHaveAttribute('data-artboard-count', '2');
  await expect(page.locator('.canvas-wrap')).toHaveAttribute('data-active-artboard', 'social');
  const roundTrip = await downloadProject(page);
  expect(roundTrip.history[roundTrip.index].artboards).toEqual(frame.artboards);
  expect(roundTrip.history[roundTrip.index].activeArtboardId).toBe('social');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.canvas-wrap')).toHaveAttribute('data-artboard-count', '2');
  await expect(page.locator('.canvas-wrap')).toHaveAttribute('data-active-artboard', 'social');
});

test('malformed or out-of-bounds artboards are rejected without replacing the current draft', async ({ page }) => {
  const original = await downloadProject(page);
  const corrupt = structuredClone(original);
  const frame = corrupt.history[corrupt.index];
  frame.artboards = [
    { id: 'bad', name: 'Bad', x: frame.w - 2, y: 0, w: 8, h: 8, visible: true, locked: false },
  ];
  await uploadProject(page, corrupt);
  await expect(page.locator('footer')).toContainText('Invalid layer document');
  await expect(page.locator('.canvas-wrap')).toHaveAttribute('data-artboard-count', '0');
  expect((await downloadProject(page)).history[0].artboards).toBeUndefined();
});

test('active named artboard renders and exports at viewport dimensions', async ({ page }) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  const project = await downloadProject(page);
  const frame = project.history[project.index];
  frame.artboards = [
    {
      id: 'hero',
      name: 'Hero',
      x: 100,
      y: 80,
      w: 320,
      h: 200,
      visible: true,
      locked: false,
      background: '#00ff00',
    },
    {
      id: 'social',
      name: 'Social',
      x: 500,
      y: 100,
      w: 180,
      h: 120,
      visible: true,
      locked: false,
      background: '#0000ff',
    },
  ];
  frame.activeArtboardId = 'hero';
  await uploadProject(page, project);
  await expect(page.locator('.canvas-wrap')).toHaveAttribute('data-active-artboard', 'hero');

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByTestId('export-viewport')).toHaveText(
    /active artboard “Hero” at 320 × 200 px/,
  );
  await expect(page.getByRole('img', { name: 'PNG export preview' })).toBeVisible();
  const backgroundPixel = await page.getByRole('img', { name: 'PNG export preview' }).evaluate(async (image) => {
    await (image as HTMLImageElement).decode();
    const surface = document.createElement('canvas');
    surface.width = surface.height = 1;
    const context = surface.getContext('2d')!;
    context.drawImage(image as HTMLImageElement, 0, 0, 1, 1);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  });
  expect(backgroundPixel).toEqual([0, 255, 0, 255]);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download image', exact: true }).click();
  const download = await pending;
  const path = await download.path();
  const bytes = await (await import('node:fs/promises')).readFile(path!);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.readUInt32BE(16)).toBe(320);
  expect(bytes.readUInt32BE(20)).toBe(200);
  await page.getByLabel('Export artboard').selectOption('social');
  await expect(page.getByTestId('export-viewport')).toHaveText(
    /active artboard “Social” at 180 × 120 px/,
  );
  await expect(page.getByRole('img', { name: 'PNG export preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const roundTrip = await downloadProject(page);
  expect(roundTrip.history[roundTrip.index].artboards?.[0]).toMatchObject({ id: 'hero', w: 320, h: 200 });
});

test('artboard visibility controls hide overlays, move the active target and persist on desktop and mobile', async ({ page }) => {
  const project = await downloadProject(page);
  const frame = project.history[project.index];
  frame.artboards = [
    { id: 'hero', name: 'Hero', x: 0, y: 0, w: 640, h: 480, visible: true, locked: false },
    { id: 'social', name: 'Social', x: 660, y: 0, w: 120, h: 120, visible: true, locked: false },
  ];
  frame.activeArtboardId = 'hero';
  await uploadProject(page, project);
  await expect(page.getByLabel('Show Hero artboard')).toBeChecked();
  await page.getByLabel('Show Hero artboard').uncheck();
  await expect(page.locator('.canvas-wrap')).toHaveAttribute('data-active-artboard', 'social');
  await expect(page.locator('.artboard-overlay g')).toHaveCount(1);
  await expect(page.getByText('Hero hidden', { exact: true })).toBeVisible();
  const savedProject = await downloadProject(page);
  expect(savedProject.history[savedProject.index].artboards).toEqual([
    expect.objectContaining({ id: 'hero', visible: false }),
    expect.objectContaining({ id: 'social', visible: true }),
  ]);
  await page.reload();
  await expect(page.getByLabel('Show Hero artboard')).not.toBeChecked();
  await expect(page.locator('.artboard-overlay g')).toHaveCount(1);
});
