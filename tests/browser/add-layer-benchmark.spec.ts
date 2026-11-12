// Opt-in benchmark (skipped unless PIXELFORGE_BENCH=1, desktop project only):
// time "Add paint layer" in the middle of a large many-layer document, after
// painting on a lower layer, and report composite-cache reuse. See
// docs/performance-budgets.md.
//   PIXELFORGE_BENCH=1 BENCH_LAYERS=40 npx playwright test add-layer-benchmark --project=desktop
import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';

const W = Number(process.env.BENCH_W || 2646), H = Number(process.env.BENCH_H || 4096), N = Number(process.env.BENCH_LAYERS || 40);
const settled = (page: Page) =>
  expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false', { timeout: 600_000 });

test('add an empty paint layer in the middle of a tall stack', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop' || process.env.PIXELFORGE_BENCH !== '1');
  test.setTimeout(3_600_000);
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Canvas Size…', exact: true }).click();
  await page.getByLabel('Width (px)').fill(String(W));
  await page.getByLabel('Height (px)').fill(String(H));
  await page.getByRole('button', { name: 'Apply canvas size', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveJSProperty('width', W);
  await settled(page);
  for (let i = 0; i < N; i += 1) {
    const b64: string = await page.evaluate(async ({ W, H, i, noise }) => {
      const c = new OffscreenCanvas(W, H), x = c.getContext('2d')!;
      let seed = i * 7919 + 1;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let k = 0; k < 6; k += 1) {
        x.fillStyle = `hsla(${Math.floor(rnd() * 360)},70%,50%,0.6)`;
        x.beginPath();
        x.arc(rnd() * W, rnd() * H, 80 + rnd() * W * 0.25, 0, Math.PI * 2);
        x.fill();
      }
      if (noise) {
        // Painting-like texture decodes far slower than flat discs.
        const patch = x.getImageData(0, 0, W, Math.floor(H / 4));
        for (let k = 0; k < patch.data.length; k += 4) {
          patch.data[k] = rnd() * 255;
          patch.data[k + 1] = rnd() * 255;
          patch.data[k + 3] = 180;
        }
        x.putImageData(patch, 0, Math.floor(rnd() * H * 0.75));
      }
      const bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let bin = '';
      for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
      return btoa(bin);
    }, { W, H, i, noise: process.env.BENCH_NOISE === '1' });
    await page.getByTestId('layer-input').setInputFiles({ name: `Bench ${i}.png`, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
    await expect(page.getByRole('button', { name: /^Select layer / })).toHaveCount(i + 2, { timeout: 120_000 });
    await settled(page);
  }
  const rows = page.getByRole('button', { name: /^Select layer / });
  const canvas = page.getByTestId('editor-canvas');
  const marks = () => page.evaluate(() => ({
    composite: (performance.getEntriesByName('pixelforge.composite-cache', 'mark') as PerformanceMark[]).map((m) => m.detail),
    presented: performance.getEntriesByName('pixelforge.presented-composite', 'mark').length,
  }));
  // Paint on a middle layer first, as an artist would before adding a layer.
  await rows.nth(Math.floor(N / 2)).click();
  await settled(page);
  await selectTool(page, 'Brush');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  for (let s = 1; s <= 6; s += 1) await page.mouse.move(box.x + box.width * (0.3 + s * 0.05), box.y + box.height * 0.3, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(50);
  await settled(page);
  for (let n = 0; n < 3; n += 1) {
    await page.evaluate(() => { performance.clearMarks('pixelforge.composite-cache'); performance.clearMarks('pixelforge.presented-composite'); });
    const start = Date.now();
    await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
    await expect(rows).toHaveCount(N + 2 + n);
    await page.waitForTimeout(50);
    await settled(page);
    console.log(`add ${n}: ${Date.now() - start} ms; marks ${JSON.stringify(await marks())}`);
  }
  // A pause long enough for the render worker to idle out drops its caches.
  await page.evaluate(() => { (globalThis as { __PIXELFORGE_WORKER_IDLE_MS__?: number }).__PIXELFORGE_WORKER_IDLE_MS__ = 500; });
  await page.getByRole('button', { name: /^Select layer / }).first().click();
  await settled(page);
  await page.waitForTimeout(1500);
  await page.evaluate(() => { performance.clearMarks('pixelforge.composite-cache'); performance.clearMarks('pixelforge.presented-composite'); });
  const afterIdle = Date.now();
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await expect(rows).toHaveCount(N + 5);
  await page.waitForTimeout(50);
  await settled(page);
  console.log(`add after idle: ${Date.now() - afterIdle} ms; marks ${JSON.stringify(await marks())}`);
  // Reopen the saved draft (cold caches): the time an artist waits on load.
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device', { timeout: 600_000 });
  const opened = Date.now();
  await page.reload();
  await expect(rows).toHaveCount(N + 5, { timeout: 600_000 });
  await settled(page);
  console.log(`reopen: ${Date.now() - opened} ms`);
  await page.evaluate(() => { performance.clearMarks('pixelforge.composite-cache'); performance.clearMarks('pixelforge.presented-composite'); });
  const afterOpen = Date.now();
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await expect(rows).toHaveCount(N + 6);
  await page.waitForTimeout(50);
  await settled(page);
  console.log(`add after reopen: ${Date.now() - afterOpen} ms; marks ${JSON.stringify(await marks())}`);
});
