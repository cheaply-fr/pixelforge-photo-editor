import { test, expect, type Page } from '@playwright/test';

type ProjectLayer = {
  kind: string;
  asset?: string;
  patchStrokes?: Array<{
    version: number;
    points: unknown[];
    sourceOffset: { x: number; y: number };
  }>;
};
type Project = {
  history: Array<{ layers: ProjectLayer[] }>;
  index: number;
  assets: Record<string, { url: string; w: number; h: number }>;
};

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

const project = async (page: Page): Promise<Project> => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const download = await pending;
  const file = await download.path();
  return JSON.parse(
    await (await import('node:fs/promises')).readFile(file!, 'utf8'),
  ) as Project;
};

const point = async (page: Page, x: number, y = 0.5) => {
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  return { clientX: box.x + box.width * x, clientY: box.y + box.height * y };
};

const dispatchPointer = async (
  page: Page,
  type: 'mouse' | 'touch',
  id: number,
  x: number,
  y = 0.5,
  endX?: number,
) => {
  const canvas = page.getByTestId('editor-canvas');
  const start = await point(page, x, y);
  const end = await point(page, endX ?? x, y);
  await canvas.evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  await canvas.dispatchEvent('pointerdown', {
    pointerId: id,
    pointerType: type,
    pressure: type === 'touch' ? 0.7 : 1,
    ...start,
    buttons: 1,
    isPrimary: true,
  });
  if (endX !== undefined) {
    await page.waitForTimeout(50);
    await canvas.dispatchEvent('pointermove', {
      pointerId: id,
      pointerType: type,
      pressure: type === 'touch' ? 0.7 : 1,
      ...end,
      buttons: 1,
      isPrimary: true,
    });
  }
  await canvas.dispatchEvent('pointerup', {
    pointerId: id,
    pointerType: type,
    pressure: type === 'touch' ? 0.7 : 1,
    ...(endX === undefined ? start : end),
    buttons: 0,
    isPrimary: true,
  });
};

const beginPatch = async (page: Page) => {
  await page.getByRole('button', { name: 'Patch tool', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Patch tool', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Click a source area, then drag/)).toBeVisible();
};

const beginPatchFromMenu = async (page: Page) => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const item = page.getByRole('menuitem', {
    name: 'Patch Tool',
    exact: true,
  });
  await item.scrollIntoViewIfNeeded();
  await item.click();
  await expect(
    page.getByRole('button', { name: 'Patch tool', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Click a source area, then drag/)).toBeVisible();
};

test.beforeEach(async ({ page }) => openEditor(page));

test('Patch toolbar/menu flow preserves source assets and round-trips through undo, project import and reload', async ({
  page,
}) => {
  await beginPatchFromMenu(page);
  const before = await project(page);
  const beforeLayer = before.history[before.index].layers.at(-1)!;

  await dispatchPointer(page, 'mouse', 301, 0.25);
  await expect(page.locator('footer')).toContainText('Patch source set');
  await dispatchPointer(page, 'mouse', 302, 0.7, 0.5, 0.76);
  await expect(page.locator('footer')).toContainText(
    'Patch applied nondestructively',
    { timeout: 10000 },
  );
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'data-rendering',
    'false',
  );
  const after = await project(page);
  const afterLayer = after.history[after.index].layers.at(-1)!;
  expect(afterLayer.kind).toBe('raster');
  expect(afterLayer.asset).toBe(beforeLayer.asset);
  expect(afterLayer.patchStrokes).toHaveLength(1);
  expect(afterLayer.patchStrokes![0].sourceOffset.x).toBeLessThan(0);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  const undone = await project(page);
  expect(
    undone.history[undone.index].layers.at(-1)!.patchStrokes,
  ).toBeUndefined();

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await expect(page.locator('footer')).toContainText('Redone');
  const exported = await project(page);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const download = await pending;
  await page
    .getByTestId('project-input')
    .setInputFiles((await download.path())!);
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'data-rendering',
    'false',
  );
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Saved on this device');
  const imported = await project(page);
  expect(
    imported.history[imported.index].layers.at(-1)!.patchStrokes,
  ).toHaveLength(1);
  expect(
    exported.history[exported.index].layers.at(-1)!.patchStrokes,
  ).toHaveLength(1);

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  const reloaded = await project(page);
  expect(
    reloaded.history[reloaded.index].layers.at(-1)!.patchStrokes,
  ).toHaveLength(1);
});

test('Patch rejects locked layers without changing the draft', async ({
  page,
}) => {
  await beginPatch(page);
  const before = await project(page);
  await page.getByLabel('Lock layer', { exact: true }).check();
  await dispatchPointer(page, 'touch', 303, 0.25);
  await expect(page.locator('footer')).toContainText(
    'Select a visible, unlocked raster layer before Patch',
  );
  const after = await project(page);
  expect(after.history.length).toBe(before.history.length + 1);
  expect(
    after.history[after.index].layers.at(-1)!.patchStrokes,
  ).toBeUndefined();
});

test('Patch touch cancellation leaves the source frame unchanged', async ({
  page,
}) => {
  await beginPatch(page);
  await dispatchPointer(page, 'touch', 304, 0.25);
  const before = await project(page);
  const canvas = page.getByTestId('editor-canvas');
  const start = await point(page, 0.7);
  const end = await point(page, 0.78);
  await canvas.evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 305,
    pointerType: 'touch',
    pressure: 0.7,
    ...start,
    buttons: 1,
    isPrimary: true,
  });
  await canvas.dispatchEvent('pointermove', {
    pointerId: 305,
    pointerType: 'touch',
    pressure: 0.7,
    ...end,
    buttons: 1,
    isPrimary: true,
  });
  await canvas.dispatchEvent('pointercancel', {
    pointerId: 305,
    pointerType: 'touch',
    pressure: 0,
    ...end,
    buttons: 0,
    isPrimary: true,
  });
  await expect(page.locator('footer')).toContainText('Gesture cancelled');
  const after = await project(page);
  expect(after.history.length).toBe(before.history.length);
  expect(
    after.history[after.index].layers.at(-1)!.patchStrokes,
  ).toBeUndefined();
});
