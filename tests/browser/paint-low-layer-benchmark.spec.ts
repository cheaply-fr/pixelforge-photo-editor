// Opt-in benchmark (skipped unless PIXELFORGE_BENCH=1, desktop project only):
// time brush strokes on a low and on the top layer of a large many-layer
// document and report composite-cache reuse. See docs/performance-budgets.md.
//   PIXELFORGE_BENCH=1 BENCH_LAYERS=40 npx playwright test paint-low-layer-benchmark --project=desktop
import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';

const W = Number(process.env.BENCH_W || 2646), H = Number(process.env.BENCH_H || 4096), N = Number(process.env.BENCH_LAYERS || 40);
const settled = (page: Page) =>
  expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false', { timeout: 600_000 });

test('paint strokes on a low and the top layer of a tall stack', async ({ page }, info) => {
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
  const t0 = Date.now();
  for (let i = 0; i < N; i += 1) {
    const b64: string = await page.evaluate(async ({ W, H, i }) => {
      const c = new OffscreenCanvas(W, H), x = c.getContext('2d')!;
      let seed = i * 7919 + 1;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let k = 0; k < 6; k += 1) {
        x.fillStyle = `hsla(${Math.floor(rnd() * 360)},70%,50%,0.6)`;
        x.beginPath();
        x.arc(rnd() * W, rnd() * H, 80 + rnd() * W * 0.25, 0, Math.PI * 2);
        x.fill();
      }
      const bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let bin = '';
      for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
      return btoa(bin);
    }, { W, H, i });
    await page.getByTestId('layer-input').setInputFiles({ name: `Bench ${i}.png`, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
    await expect(page.getByRole('button', { name: /^Select layer / })).toHaveCount(i + 2, { timeout: 120_000 });
    await settled(page);
  }
  console.log(`built ${N + 1} layers in ${Date.now() - t0} ms (${W}x${H})`);
  const names = await page.getByRole('button', { name: /^Select layer / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  console.log(JSON.stringify(names.slice(0, 3)), JSON.stringify(names.slice(-3)));
  await selectTool(page, 'Brush');
  const canvas = page.getByTestId('editor-canvas');
  const stroke = async (label: string, n: number) => {
    const box = (await canvas.boundingBox())!;
    await page.evaluate(() => performance.clearMarks('pixelforge.composite-cache'));
    const viewport = page.viewportSize()!, top = Math.max(box.y, 0) + 20, bottom = Math.min(box.y + box.height, viewport.height - 80);
    const y = top + (bottom - top) * (0.2 + n * 0.25);
    await page.mouse.move(box.x + box.width * 0.2, y);
    await page.mouse.down();
    for (let s = 1; s <= 8; s += 1) await page.mouse.move(box.x + box.width * (0.2 + s * 0.07), y, { steps: 2 });
    const up = Date.now();
    await page.mouse.up();
    await page.waitForTimeout(50);
    await settled(page);
    const marks = await page.evaluate(() => (performance.getEntriesByName('pixelforge.composite-cache', 'mark') as PerformanceMark[]).map((m) => m.detail));
    console.log(`${label} stroke ${n}: ${Date.now() - up} ms after release; renders ${marks.length}, suffixLayers ${JSON.stringify([...new Set(marks.map((m) => m.suffixLayers))])}, reusedLayers ${JSON.stringify([...new Set(marks.map((m) => m.reusedLayers))])}`);
  };
  const rows = page.getByRole('button', { name: /^Select layer / });
  // The panel lists the top layer first.
  for (const [label, row] of [['low', N - 1], ['top', 0]] as const) {
    await rows.nth(row).click();
    await settled(page);
    for (let n = 0; n < 3; n += 1) await stroke(label, n);
  }
});
