import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

const openEditor = async (page: Page) => {
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

const project = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as {
    settings: { tool: string; size: number; brushOpacity?: number };
    history: Array<{
      selection?: { mask?: string };
      layers: Array<{ asset?: string }>;
    }>;
    index: number;
    assets: Record<string, { url: string; w: number; h: number }>;
  };
};

const alphaStats = async (
  page: Page,
  asset: { url: string; w: number; h: number },
) =>
  page.evaluate(async ({ asset }) => {
    const image = new Image();
    image.src = asset.url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = asset.w;
    canvas.height = asset.h;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, asset.w, asset.h).data;
    let covered = 0;
    let partial = 0;
    for (let offset = 3; offset < data.length; offset += 4) {
      if (data[offset] > 0) covered += 1;
      if (data[offset] > 0 && data[offset] < 255) partial += 1;
    }
    return { covered, partial };
  }, { asset });

const stroke = async (
  page: Page,
  start: [number, number],
  end: [number, number],
  pointerType: 'mouse' | 'touch',
  waitForPreparation = true,
) => {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  const point = (ratio: [number, number]) => ({
    clientX: box.x + box.width * ratio[0],
    clientY: box.y + box.height * ratio[1],
  });
  await canvas.evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  await canvas.dispatchEvent('pointerdown', {
    pointerId: pointerType === 'touch' ? 83 : 82,
    pointerType,
    pressure: 1,
    ...point(start),
    buttons: 1,
    isPrimary: true,
  });
  if (waitForPreparation) await page.waitForTimeout(80);
  await canvas.dispatchEvent('pointermove', {
    pointerId: pointerType === 'touch' ? 83 : 82,
    pointerType,
    pressure: pointerType === 'touch' ? 0.5 : 1,
    ...point(end),
    buttons: 1,
    isPrimary: true,
  });
  await canvas.dispatchEvent('pointerup', {
    pointerId: pointerType === 'touch' ? 83 : 82,
    pointerType,
    pressure: 0,
    ...point(end),
    buttons: 0,
    isPrimary: true,
  });
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
};

test.beforeEach(async ({ page }) => openEditor(page));

test('Selection Brush creates a local alpha mask, composes Add and survives reload', async ({
  page,
}) => {
  await selectTool(page, 'Selection Brush');
  await expect(page.getByText('Selection Brush tool selected', { exact: true })).toBeVisible();
  await stroke(page, [0.22, 0.3], [0.62, 0.3], 'mouse');
  await expect(page.getByText('Selection Brush selection created', { exact: true })).toBeVisible();
  let saved = await project(page);
  const first = saved.history[saved.index], firstMask = first.selection?.mask;
  expect(firstMask).toBeTruthy();
  const firstStats = await alphaStats(page, saved.assets[firstMask!]);
  expect(firstStats.covered).toBeGreaterThan(0);

  await page.getByLabel('Selection mode', { exact: true }).selectOption('add');
  // Do not wait after pointerdown: this exercises the asynchronous selection
  // decode queue and verifies that early pointer moves are retained.
  await stroke(page, [0.7, 0.65], [0.84, 0.65], 'mouse', false);
  saved = await project(page);
  const added = saved.history[saved.index].selection?.mask;
  expect(added).toBeTruthy();
  expect((await alphaStats(page, saved.assets[added!])).covered).toBeGreaterThan(
    firstStats.covered,
  );
  await page.reload();
  saved = await project(page);
  const reloaded = saved.history[saved.index].selection?.mask;
  expect(reloaded).toBeTruthy();
  expect(await alphaStats(page, saved.assets[reloaded!])).toEqual(
    await alphaStats(page, saved.assets[added!]),
  );
});

test('Selection Brush accepts a touch gesture and cancellation leaves history unchanged', async ({
  page,
}) => {
  await selectTool(page, 'Selection Brush');
  const before = await project(page);
  await stroke(page, [0.25, 0.7], [0.7, 0.7], 'touch');
  await expect(page.getByText('Selection Brush selection created', { exact: true })).toBeVisible();
  const after = await project(page);
  expect(after.history.length).toBe(before.history.length + 1);
  expect(after.history[after.index].selection?.mask).toBeTruthy();

  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await canvas.evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 84,
    pointerType: 'touch',
    pressure: 1,
    clientX: box.x + box.width * 0.45,
    clientY: box.y + box.height * 0.45,
    buttons: 1,
    isPrimary: true,
  });
  await page.waitForTimeout(30);
  await canvas.dispatchEvent('pointermove', {
    pointerId: 84,
    pointerType: 'touch',
    pressure: 0.5,
    clientX: box.x + box.width * 0.75,
    clientY: box.y + box.height * 0.45,
    buttons: 1,
    isPrimary: true,
  });
  await page.keyboard.press('Escape');
  await expect(page.getByText('Selection Brush cancelled', { exact: true })).toBeVisible();
  const retained = await project(page);
  expect(retained.history.length).toBe(after.history.length);
  expect(retained.history[retained.index].selection?.mask).toBe(after.history[after.index].selection?.mask);
});
