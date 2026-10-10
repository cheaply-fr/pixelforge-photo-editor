import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';

async function project(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const download = await pending;
  return JSON.parse(
    await (
      await import('node:fs/promises')
    ).readFile((await download.path())!, 'utf8'),
  ) as {
    history: Array<{ layers: Array<Record<string, unknown>> }>;
    index: number;
  };
}

async function openEditor(page: Page) {
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
}

async function addClosedBase(page: Page) {
  await selectTool(page, 'Pen');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  const points = [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.75, 0.75],
    [0.25, 0.75],
    [0.25, 0.25],
  ];
  for (const [x, y] of points)
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await expect(page.locator('footer')).toContainText(
    'Editable path layer added',
    { timeout: 10000 },
  );
}

test.beforeEach(async ({ page }) => openEditor(page));

test('create and release clipping masks persist through undo, reorder cleanup and project round-trip', async ({
  page,
}) => {
  await addClosedBase(page);
  await page
    .getByRole('button', { name: 'Add paint layer', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Create clipping mask', exact: true }),
  ).toBeEnabled();
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.5, {
    steps: 4,
  });
  await page.mouse.up();
  await page
    .getByRole('button', { name: 'Create clipping mask', exact: true })
    .click();
  await expect(page.getByText(/Clipping mask created/)).toBeVisible();
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  const samples = await canvas.evaluate((element) => {
    const context = (element as HTMLCanvasElement).getContext('2d')!;
    return {
      outside: Array.from(context.getImageData(80, 360, 1, 1).data),
      inside: Array.from(context.getImageData(480, 360, 1, 1).data),
    };
  });
  expect(samples.inside.slice(0, 3)).not.toEqual(samples.outside.slice(0, 3));
  let exported = await project(page);
  let frame = exported.history[exported.index];
  expect(frame.layers.at(-1)).toMatchObject({ kind: 'raster' });
  expect(frame.layers.at(-1)?.clippingTo).toBe(frame.layers.at(-2)?.id);
  await page
    .getByRole('button', { name: 'Release clipping mask', exact: true })
    .click();
  expect((await project(page)).history.at(-1)).toBeDefined();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(
    page.getByRole('button', { name: 'Release clipping mask', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Lower layer', exact: true }).click();
  exported = await project(page);
  frame = exported.history[exported.index];
  expect(frame.layers.some((layer) => layer.clippingTo)).toBe(false);
  await page.reload();
  exported = await project(page);
  frame = exported.history[exported.index];
  expect(frame.layers.some((layer) => layer.clippingTo)).toBe(false);
});
