import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { downloadedProject } from './project-file';

async function fixture(page: Page) {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 8; canvas.height = 2;
    const context = canvas.getContext('2d')!;
    const data = context.createImageData(8, 2);
    const row = [[255,0,0,255], [0,255,0,255], [0,0,255,255], [255,255,0,255],
      [128,128,128,255], [48,76,72,255], [255,0,255,128], [0,0,0,0]];
    for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) data.data.set(row[x], (y * 8 + x) * 4);
    context.putImageData(data, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('file-input').setInputFiles({ name: 'ntsc-fixture.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '8');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
}
async function project(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const path = (await (await pending).path())!;
  return { path, value: await downloadedProject(path) };
}
async function pixels(page: Page) {
  const canvas = page.getByTestId('editor-canvas');
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  return canvas.evaluate((element: HTMLCanvasElement) => Array.from(element.getContext('2d')!.getImageData(0, 0, 8, 2).data));
}
async function ntscMenu(page: Page) {
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  return page.getByRole('menuitem', { name: 'NTSC Colors', exact: true });
}
async function history(page: Page, command: 'Undo' | 'Redo') {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: new RegExp(`^${command}`) }).click();
}

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', route => route.fulfill({ json: { authenticated: false } }));
});

for (const worker of [false, true]) {
  test(`NTSC Colors retains source, round-trips pixels and exports PNG (${worker ? 'worker' : 'main-thread'})`, async ({ page }) => {
    await page.addInitScript(force => {
      (window as Window & { __PIXELFORGE_FORCE_WORKER__?: boolean }).__PIXELFORGE_FORCE_WORKER__ = force;
      if (!force) Object.defineProperty(window, 'Worker', { value: undefined });
    }, worker);
    await page.goto('/editor?new=1');
    await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
    await fixture(page);
    const before = await project(page), original = await pixels(page);
    const source = before.value.history[before.value.index].layers.at(-1)!;
    await (await ntscMenu(page)).click();
    await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('ntsc-colors');
    await expect(page.getByLabel('Effect amount', { exact: true })).toHaveValue('100');
    await expect(page.getByText(/Local television-color approximation/)).toBeVisible();
    await expect.poll(() => pixels(page)).not.toEqual(original);
    const changed = await pixels(page);
    expect(changed[0]).toBeLessThan(200);
    expect(changed[1]).toBeGreaterThan(20);
    expect(changed.slice(16, 24)).toEqual(original.slice(16, 24));
    for (let offset = 3; offset < changed.length; offset += 4) expect(changed[offset]).toBe(original[offset]);
    const saved = await project(page);
    const layer = saved.value.history[saved.value.index].layers.at(-1)!;
    expect(layer.asset).toBe(source.asset);
    expect(saved.value.assets).toEqual(before.value.assets);
    expect(layer.adjustments.filterEffects).toMatchObject({ type: 'ntsc-colors', amount: 100 });
    await page.getByLabel('Effect amount', { exact: true }).press('Home');
    await expect.poll(() => pixels(page)).toEqual(original);
    await history(page, 'Undo');
    await expect.poll(() => pixels(page)).toEqual(changed);
    await history(page, 'Undo');
    await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
    await expect.poll(() => pixels(page)).toEqual(original);
    await history(page, 'Redo');
    await expect.poll(() => pixels(page)).toEqual(changed);
    await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
    await page.reload();
    await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('ntsc-colors');
    await expect.poll(() => pixels(page)).toEqual(changed);
    await page.getByTestId('project-input').setInputFiles(saved.path);
    await expect.poll(() => pixels(page)).toEqual(changed);
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByLabel('Export format', { exact: true }).selectOption('png');
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download image', exact: true }).click();
    const bytes = await readFile((await (await pending).path())!);
    const decoded = await page.evaluate(async encoded => {
      const raw = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([raw], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0); bitmap.close();
      return { w: canvas.width, h: canvas.height, data: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data) };
    }, bytes.toString('base64'));
    expect(decoded).toEqual({ w: 8, h: 2, data: changed });
  });
}

test('NTSC command is disabled for locked and hidden layers without modifying the project', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await fixture(page);
  await page.getByLabel('Lock layer', { exact: true }).check();
  await expect(await ntscMenu(page)).toBeDisabled();
  await page.keyboard.press('Escape');
  const locked = await project(page);
  expect(locked.value.history[locked.value.index].layers.at(-1)?.adjustments.filterEffects.type).toBe('none');
  await page.getByLabel('Lock layer', { exact: true }).uncheck();
  await page.getByLabel('Visible', { exact: true }).uncheck();
  await expect(await ntscMenu(page)).toBeDisabled();
});
