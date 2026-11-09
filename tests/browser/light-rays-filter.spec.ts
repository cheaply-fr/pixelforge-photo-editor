import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { openPanel } from './sidebar-panels';

type Layer = { smartFilters?: Array<Record<string, unknown>>; adjustments: { filterEffects?: Record<string, unknown> } };
type Project = { history: Array<{ layers: Layer[] }>; index: number };

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const WIDTH = 201;
const HEIGHT = 121;

const settled = (page: Page) =>
  expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });
const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device', { timeout: 30_000 });

/** A dark night sky with one bright glint, so rays and streaks are visible. */
async function importFixture(page: Page) {
  const encoded = await page.evaluate(({ width, height }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const glint = Math.hypot(x - 140, y - 60) < 6;
        image.data[offset] = glint ? 255 : 12 + (x % 7);
        image.data[offset + 1] = glint ? 250 : 14 + (y % 5);
        image.data[offset + 2] = glint ? 230 : 34;
        image.data[offset + 3] = 255;
      }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  }, { width: WIDTH, height: HEIGHT });
  await page.getByTestId('file-input').setInputFiles({
    name: 'light-rays.png',
    mimeType: 'image/png',
    buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveJSProperty('width', WIDTH);
  await settled(page);
}

async function filter(page: Page, item: string) {
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
  await settled(page);
}

const digest = async (page: Page) => {
  await settled(page);
  return page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0x811c9dc5;
    for (let index = 0; index < data.length; index += 1) hash = Math.imul(hash ^ data[index], 0x01000193);
    return (hash >>> 0).toString(16);
  });
};

/** Mean brightness of a small canvas patch (fractions of the canvas). */
const brightness = async (page: Page, fx: number, fy: number) => {
  await settled(page);
  return page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement, [x, y]) => {
    const data = canvas.getContext('2d')!.getImageData(Math.round(canvas.width * x) - 2, Math.round(canvas.height * y) - 2, 5, 5).data;
    let total = 0;
    for (let index = 0; index < data.length; index += 4) total += data[index] + data[index + 1] + data[index + 2];
    return total / (data.length / 4) / 3;
  }, [fx, fy]);
};

async function project(page: Page): Promise<Project> {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return (await downloadedProject((await (await pending).path())!)) as Project;
}

const undo = async (page: Page) => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
};
const redo = async (page: Page) => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
};

test('Light Rays renders editable rays with a movable centre, undo/redo and reload', async ({ page }) => {
  test.setTimeout(180_000);
  await importFixture(page);
  const original = await digest(page);
  const before = await brightness(page, 0.5, 0.2);

  await filter(page, 'Light Rays…');
  await openPanel(page, 'Filters');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('light-rays');
  await expect(page.getByTestId('light-rays-controls')).toBeVisible();
  const applied = await digest(page);
  expect(applied).not.toBe(original);
  // Rays from the centre brighten the dark sky above it.
  expect(await brightness(page, 0.5, 0.3)).toBeGreaterThan(before + 5);

  // The centre is placed with the on-canvas handle (drag + keyboard).
  const handle = page.getByTestId('filter-center-handle');
  await expect(handle).toBeVisible();
  await expect(handle).toHaveAttribute('data-center-x', '0.5');
  const canvasBox = (await page.getByTestId('editor-canvas').boundingBox())!;
  const handleBox = (await handle.boundingBox())!;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.4, canvasBox.y + canvasBox.height * 0.5, { steps: 4 });
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.3, canvasBox.y + canvasBox.height * 0.5, { steps: 4 });
  await page.mouse.up();
  await settled(page);
  await expect.poll(async () => Math.abs(Number(await handle.getAttribute('data-center-x')) - 0.3)).toBeLessThan(0.04);
  const moved = await digest(page);
  expect(moved).not.toBe(applied);
  await handle.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await settled(page);
  const nudged = await digest(page);
  expect(nudged).not.toBe(moved);

  // Parameters change the render, one undo step per change.
  const count = page.getByLabel('Ray count', { exact: true });
  await expect(count).toHaveValue('48');
  await count.fill('12');
  await expect(count).toHaveValue('12');
  const twelve = await digest(page);
  expect(twelve).not.toBe(nudged);
  await page.getByLabel('Inner radius', { exact: true }).fill('20');
  await page.getByLabel('Ray colour', { exact: true }).fill('#80c0ff');
  await page.getByLabel('Ray blend', { exact: true }).selectOption('add');
  const styled = await digest(page);
  expect(styled).not.toBe(twelve);

  await undo(page);
  await expect(page.getByLabel('Ray blend', { exact: true })).toHaveValue('screen');
  await undo(page);
  await expect(page.getByLabel('Ray colour', { exact: true })).toHaveValue('#ffe3a3');
  await undo(page);
  await expect(page.getByLabel('Inner radius', { exact: true })).toHaveValue('0');
  await expect.poll(() => digest(page)).toBe(twelve);
  await undo(page);
  await expect(count).toHaveValue('48');
  await expect.poll(() => digest(page)).toBe(nudged);
  for (let step = 0; step < 4; step += 1) await redo(page);
  await expect(page.getByLabel('Ray blend', { exact: true })).toHaveValue('add');
  await expect.poll(() => digest(page)).toBe(styled);

  // Starburst shape and bright-pixel streak mode.
  await page.getByLabel('Ray shape', { exact: true }).selectOption('starburst');
  await expect(count).toHaveValue('8');
  const starburst = await digest(page);
  expect(starburst).not.toBe(styled);
  await page.getByLabel('Light source', { exact: true }).selectOption('source');
  await expect(page.getByLabel('Bright threshold', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Ray shape', { exact: true })).toHaveCount(0);
  const streaks = await digest(page);
  expect(streaks).not.toBe(starburst);
  await page.getByLabel('Light rays seed', { exact: true }).fill('77');
  await expect(page.getByLabel('Light rays seed', { exact: true })).toHaveValue('77');
  const reseeded = await digest(page);

  await saved(page);
  const exported = await project(page);
  const effect = exported.history[exported.index].layers.at(-1)!.adjustments.filterEffects!;
  expect(effect).toMatchObject({
    type: 'light-rays',
    seed: 77,
    lightRays: { mode: 'source', shape: 'starburst', count: 8, innerRadius: 20, color: '#80c0ff', blend: 'add' },
  });
  expect(Math.abs(Number(effect.centerX) - 0.3)).toBeLessThan(0.1);

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => digest(page)).toBe(reseeded);
  await openPanel(page, 'Filters');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('light-rays');
  await expect(page.getByLabel('Light source', { exact: true })).toHaveValue('source');
  await expect(page.getByLabel('Light rays seed', { exact: true })).toHaveValue('77');
});

test('a stacked Light Rays entry stays editable, including its centre', async ({ page }) => {
  test.setTimeout(180_000);
  await importFixture(page);
  const original = await digest(page);
  await filter(page, 'Light Rays…');
  await page.getByLabel('Ray count', { exact: true }).fill('16');
  await settled(page);
  await page.getByRole('button', { name: /^Add filter to stack/ }).click();
  await settled(page);
  await openPanel(page, 'Filters');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
  await expect.poll(() =>
    page.getByRole('list', { name: 'Stacked filters' }).getByRole('listitem').locator('span').allTextContents(),
  ).toEqual(['1. Light rays']);
  const stacked = await digest(page);
  expect(stacked).not.toBe(original);

  await page.getByRole('button', { name: 'Edit stacked filter 1. Light rays', exact: true }).click();
  await expect(page.getByTestId('filter-stack-editing')).toContainText('Editing stacked filter 1. Light rays');
  const count = page.getByLabel('Ray count', { exact: true });
  await expect(count).toHaveValue('16');
  await count.fill('6');
  const edited = await digest(page);
  expect(edited).not.toBe(stacked);
  const handle = page.getByTestId('filter-center-handle');
  await expect(handle).toBeVisible();
  await handle.focus();
  await page.keyboard.press('Shift+ArrowDown');
  await expect.poll(async () => Number(await handle.getAttribute('data-center-y'))).toBeGreaterThan(0.5);
  const recentred = await digest(page);
  expect(recentred).not.toBe(edited);

  await undo(page);
  await expect.poll(() => digest(page)).toBe(edited);
  await redo(page);
  await expect.poll(() => digest(page)).toBe(recentred);
  await page.getByTestId('filter-stack-editing').getByRole('button', { name: 'Done', exact: true }).click();

  await saved(page);
  const exported = await project(page);
  const layer = exported.history[exported.index].layers.at(-1)!;
  expect(layer.smartFilters).toHaveLength(1);
  expect(layer.smartFilters![0]).toMatchObject({ type: 'light-rays', lightRays: { count: 6 } });
  expect(Number(layer.smartFilters![0].centerY)).toBeGreaterThan(0.5);

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => digest(page)).toBe(recentred);
  await page.getByRole('button', { name: 'Edit stacked filter 1. Light rays', exact: true }).click();
  await expect(page.getByLabel('Ray count', { exact: true })).toHaveValue('6');
});
