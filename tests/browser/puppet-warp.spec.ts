import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { answerPrompt } from './prompt-dialog';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

async function downloadProject(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return downloadedProject((await download.path())!);
}

test('Puppet Warp moves a bounded pin, retains the source, and survives reload on desktop/mobile', async ({ page }) => {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 12; canvas.height = 8;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(12, 8);
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 12; x += 1) {
      const offset = (y * 12 + x) * 4;
      image.data[offset] = x * 18;
      image.data[offset + 1] = y * 24;
      image.data[offset + 2] = 120;
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'puppet-warp-fixture.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  const beforePixel = await page.getByTestId('editor-canvas').evaluate((canvas) => {
    const context = (canvas as HTMLCanvasElement).getContext('2d')!;
    return Array.from(context.getImageData(6, 4, 1, 1).data);
  });
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Puppet Warp…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await answerPrompt(page, 'Puppet Warp', { Pins: '6,4,2,0' });
  await expect(page.getByText('Puppet Warp applied locally; undo restores the source asset', { exact: true })).toBeVisible();
  const afterPixel = await page.getByTestId('editor-canvas').evaluate((canvas) => {
    const context = (canvas as HTMLCanvasElement).getContext('2d')!;
    return Array.from(context.getImageData(6, 4, 1, 1).data);
  });
  expect(afterPixel).not.toEqual(beforePixel);

  const after = await downloadProject(page);
  const layer = after.history[after.index].layers.at(-1)!;
  expect(layer.asset).not.toBe(sourceAsset);
  expect(after.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const reloaded = await downloadProject(page);
  expect(reloaded.history[reloaded.index].layers.at(-1)!.asset).toBe(layer.asset);
});

test('Puppet Warp is disabled for locked and unsupported active layers', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Puppet Warp…', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await page.getByLabel('Lock layer', { exact: true }).check();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Puppet Warp…', exact: true })).toBeDisabled();
});

test('a single Puppet Warp pin bends around itself and leaves the rest of the layer in place', async ({ page }) => {
  const canvas = page.getByTestId('editor-canvas');
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  const read = () => canvas.evaluate((element) => {
    const context = (element as HTMLCanvasElement).getContext('2d')!;
    const { width, height } = element as HTMLCanvasElement;
    const points = [[2, 2], [width - 3, 2], [2, height - 3], [width - 3, height - 3], [Math.round(width / 2), 4]];
    return {
      width,
      height,
      edges: points.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data)),
      row: Array.from(context.getImageData(0, 360, width, 120).data),
    };
  });
  const before = await read();
  expect(before.width).toBeGreaterThan(900);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Puppet Warp…', exact: true }).click();
  await answerPrompt(page, 'Puppet Warp', { Pins: '800,420,140,-60' });
  await expect(page.getByText('Puppet Warp applied locally; undo restores the source asset', { exact: true })).toBeVisible();
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  const after = await read();
  // The corners and the top edge are untouched: no whole-layer shift, no transparent strips.
  expect(after.edges).toEqual(before.edges);
  // Pixels near the pin moved.
  expect(after.row).not.toEqual(before.row);
});
