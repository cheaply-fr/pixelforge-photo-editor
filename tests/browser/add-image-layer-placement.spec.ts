import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

/* Layers > Add image layer centres the image, like a dropped or placed file. */

type Saved = { history: Array<{ w: number; h: number; layers: Array<{ name: string; matrix: number[] }> }>; index: number };

async function project(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return (await downloadedProject((await (await pending).path())!)) as Saved;
}

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

test('Add image layer centres the image in the document', async ({ page }) => {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 60;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 100, 60);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('layer-input').setInputFiles({ name: 'red.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByRole('button', { name: 'Select layer red.png' })).toBeVisible();
  const saved = await project(page);
  const frame = saved.history[saved.index];
  const layer = frame.layers.find((item) => item.name === 'red.png')!;
  expect(layer.matrix).toEqual([1, 0, 0, 1, Math.round(frame.w / 2 - 50), Math.round(frame.h / 2 - 30)]);
  // The visible canvas shows it in the middle, not the top-left corner.
  const canvas = page.getByTestId('editor-canvas');
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  const [centre, corner] = await canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext('2d')!;
    return [
      Array.from(context.getImageData(element.width / 2, element.height / 2, 1, 1).data),
      Array.from(context.getImageData(5, 5, 1, 1).data),
    ];
  });
  expect(centre).toEqual([255, 0, 0, 255]);
  expect(corner).not.toEqual([255, 0, 0, 255]);
});
