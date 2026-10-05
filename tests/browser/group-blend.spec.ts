import { test, expect, type Page } from '@playwright/test';

type Layer = {
  id: string;
  name: string;
  color?: string;
  groupId?: string;
  opacity: number;
  blend: string;
  matrix: number[];
  visible: boolean;
  styles?: unknown;
  adjustments?: unknown;
};
type Frame = {
  layers: Layer[];
  groups?: Array<{
    id: string;
    name: string;
    blend: string;
    opacity: number;
    visible: boolean;
    locked: boolean;
  }>;
};
type Project = { history: Frame[]; index: number };

const saved = async (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );

const drawShape = async (
  page: Page,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
) => {
  await page.getByRole('button', { name: 'Shape tool', exact: true }).click();
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width * (x + width),
    box.y + box.height * (y + height),
    { steps: 4 },
  );
  await page.mouse.up();
  await page.getByLabel('Filled shape', { exact: true }).check();
  await page.getByLabel('Shape color', { exact: true }).fill(color);
};

const selectShape = async (page: Page, index: number) => {
  const rows = page.getByRole('button', { name: /^Select layer Shape/ });
  await expect(rows).toHaveCount(2);
  await rows.nth(index).click();
};

const project = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const download = await pending;
  const path = await download.path();
  return {
    path: path!,
    value: JSON.parse(
      await (await import('node:fs/promises')).readFile(path!, 'utf8'),
    ) as Project,
  };
};

const overlapPixel = async (page: Page) => {
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'data-rendering',
    'false',
  );
  return page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d')!;
    const x = Math.floor(canvas.width * 0.52);
    const y = Math.floor(canvas.height * 0.52);
    return Array.from(context.getImageData(x, y, 1, 1).data);
  });
};

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
  await saved(page);
});

test('isolates overlapping group blends and preserves children through undo, lock, reload and import', async ({
  page,
}) => {
  const background = await overlapPixel(page);
  await drawShape(page, 0.22, 0.22, 0.52, 0.52, '#ff0000');
  await drawShape(page, 0.38, 0.38, 0.52, 0.52, '#0000ff');
  await selectShape(page, 1);
  await page.getByLabel('Enable outline', { exact: true }).check();
  await page.getByLabel('Outline width', { exact: true }).press('ArrowRight');
  await selectShape(page, 0);
  await page.getByLabel('Blend mode', { exact: true }).selectOption('screen');
  await page.getByLabel('Layer opacity', { exact: true }).fill('82');
  await page.getByLabel('Layer X', { exact: true }).fill('24');
  await page.getByLabel('Layer X', { exact: true }).press('Enter');
  const sourceOver = await overlapPixel(page);

  await page.getByRole('button', { name: 'Group active layer', exact: true }).click();
  await selectShape(page, 1);
  await page.getByLabel('Layer folder', { exact: true }).selectOption({ label: 'Group 1' });
  await expect(page.getByLabel('Group blend mode Group 1', { exact: true })).toHaveValue(
    'source-over',
  );
  await page
    .getByLabel('Group blend mode Group 1', { exact: true })
    .selectOption('multiply');
  const multiply = await overlapPixel(page);
  expect(multiply).not.toEqual(sourceOver);
  expect(multiply[3]).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByLabel('Group blend mode Group 1', { exact: true })).toHaveValue(
    'source-over',
  );
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await expect(page.getByLabel('Group blend mode Group 1', { exact: true })).toHaveValue(
    'multiply',
  );

  await page.getByLabel('Visible group Group 1', { exact: true }).uncheck();
  await expect.poll(() => overlapPixel(page)).toEqual(background);
  await page.getByLabel('Visible group Group 1', { exact: true }).check();
  await page.getByLabel('Group opacity Group 1', { exact: true }).fill('60');
  await page.getByLabel('Lock group Group 1', { exact: true }).check();
  await expect(page.getByLabel('Group blend mode Group 1', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Layer opacity', { exact: true })).toBeDisabled();
  await page.getByLabel('Lock group Group 1', { exact: true }).uncheck();
  await expect(page.getByLabel('Group blend mode Group 1', { exact: true })).toBeEnabled();

  await saved(page);
  const exported = await project(page);
  const frame = exported.value.history[exported.value.index];
  expect(frame.groups).toHaveLength(1);
  expect(frame.groups![0]).toMatchObject({ blend: 'multiply', opacity: 0.6 });
  const grouped = frame.layers.filter((layer) => layer.groupId === frame.groups![0].id);
  expect(grouped).toHaveLength(2);
  expect(grouped[0]).toMatchObject({
    blend: 'source-over',
    visible: true,
    styles: { outline: { enabled: true, width: 3 } },
  });
  expect(grouped[1]).toMatchObject({ blend: 'screen', opacity: 0.82 });
  expect(grouped[1].matrix[4]).toBe(24);
  expect(grouped[1].adjustments).toBeDefined();

  await page.reload();
  await saved(page);
  await expect(page.getByLabel('Group blend mode Group 1', { exact: true })).toHaveValue(
    'multiply',
  );
  const reloaded = await project(page);
  expect(reloaded.value.history[reloaded.value.index].groups![0]).toMatchObject({
    blend: 'multiply',
    opacity: 0.6,
  });

  await page.getByTestId('project-input').setInputFiles(exported.path);
  await saved(page);
  await expect(page.getByLabel('Group blend mode Group 1', { exact: true })).toHaveValue(
    'multiply',
  );
  const imported = await project(page);
  expect(imported.value.history[imported.value.index].layers).toEqual(
    reloaded.value.history[reloaded.value.index].layers,
  );
});

test('keeps non-contiguous folder members deterministic at the first member stacking slot', async ({
  page,
}) => {
  await drawShape(page, 0.2, 0.2, 0.3, 0.3, '#ff0000');
  await drawShape(page, 0.35, 0.35, 0.3, 0.3, '#0000ff');
  await selectShape(page, 0);
  await page.getByRole('button', { name: 'Group active layer', exact: true }).click();
  await selectShape(page, 1);
  await page.getByLabel('Layer folder', { exact: true }).selectOption({ label: 'Group 1' });
  const exported = await project(page);
  const value = exported.value;
  const frame = value.history[value.index];
  const shapes = frame.layers.filter((layer) => layer.name.startsWith('Shape'));
  expect(shapes).toHaveLength(2);
  const first = frame.layers.findIndex((layer) => layer.groupId === frame.groups![0].id);
  const grouped = frame.layers.filter((layer) => layer.groupId === frame.groups![0].id);
  // Insert a valid third shape between the folder's children. It must paint
  // above the complete folder surface, including the later blue child.
  const ungrouped = {
    ...grouped[1],
    id: '00000000-0000-4000-8000-000000000777',
    name: 'Interleaved leaf',
    groupId: undefined,
    color: '#00ff00',
    opacity: 1,
    blend: 'source-over',
  };
  frame.layers = [
    ...frame.layers.slice(0, first),
    grouped[0],
    ungrouped,
    grouped[1],
    ...frame.layers.slice(first + grouped.length),
  ];
  await page.getByTestId('project-input').setInputFiles({
    name: 'non-contiguous.pixelforge',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('button', { name: 'Select layer Interleaved leaf', exact: true })).toBeVisible();
  await expect(page.getByLabel('Group blend mode Group 1', { exact: true })).toHaveValue(
    'source-over',
  );
  await expect.poll(() => overlapPixel(page)).toEqual([0, 255, 0, 255]);
});
