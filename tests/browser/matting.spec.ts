import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';

const makeFixture = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 1;
  const context = canvas.getContext('2d')!;
  const pixels = context.createImageData(4, 1);
  pixels.data.set([
    255, 200, 200, 128,
    20, 40, 60, 255,
    7, 8, 9, 0,
    30, 40, 50, 128,
  ]);
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png').split(',')[1];
});

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

test('Matting removes a white fringe nondestructively and round-trips on desktop/mobile', async ({ page }) => {
  const encoded = await makeFixture(page);
  await page.getByTestId('file-input').setInputFiles({
    name: 'matting-fixture.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  const before = await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    return [data[1], data[3]];
  });
  expect(before[0]).toBeGreaterThan(150);
  expect(before[1]).toBe(128);

  const prompts = ['white', '100'];
  page.on('dialog', async (dialog) => await dialog.accept(prompts.shift()!));
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Matting…', exact: true }).click();
  await expect(page.getByText('White matte removal applied nondestructively', { exact: true })).toBeVisible();
  const after = await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    return [data[1], data[3]];
  });
  expect(after[0]).toBeLessThan(before[0]);
  expect(after[1]).toBe(before[1]);

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  expect(project.history[project.index].layers.at(-1)).toMatchObject({
    kind: 'raster', matting: { mode: 'white', amount: 100 },
  });

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByText('White matte removal applied nondestructively', { exact: true })).toHaveCount(0);
});
