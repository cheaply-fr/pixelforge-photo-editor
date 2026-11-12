// Opt-in benchmark (skipped unless PIXELFORGE_BENCH=1, desktop project only):
// reopen a saved draft of a large many-layer document whose layers carry live
// filters, and time (1) the first visible composite, (2) "Render ready" and
// (3) the first stroke afterwards on a layer near the top of the stack. See
// docs/performance-budgets.md.
//   PIXELFORGE_BENCH=1 BENCH_LAYERS=16 npx playwright test large-draft-benchmark --project=desktop
import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';

const W = Number(process.env.BENCH_W || 2646), H = Number(process.env.BENCH_H || 4096), N = Number(process.env.BENCH_LAYERS || 16);
const FILTERS = (process.env.BENCH_FILTERS || 'Clouds,Lens Flare…').split(',');
const canvas = (page: Page) => page.getByTestId('editor-canvas');
const settled = (page: Page) => expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 1_800_000 });

async function menu(page: Page, name: string, item: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

/** Sample the render progress text every 250 ms until rendering stops. */
async function progressTimeline(page: Page, start: number) {
  const samples: string[] = [];
  for (;;) {
    const state = await page.evaluate(() => ({
      rendering: document.querySelector('[data-testid="editor-canvas"]')?.getAttribute('data-rendering'),
      status: document.querySelector('[aria-label="Render status"]')?.textContent ?? '',
    })).catch(() => ({ rendering: 'true', status: '' }));
    if (state.status) samples.push(`${((Date.now() - start) / 1000).toFixed(1)}s ${state.status}`);
    if (state.rendering === 'false') break;
    await page.waitForTimeout(250);
  }
  return samples.filter((sample, index) => index === 0 || sample.split(' ').slice(1).join(' ') !== samples[index - 1].split(' ').slice(1).join(' '));
}

test('reopen a large filtered draft and paint near the top', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop' || process.env.PIXELFORGE_BENCH !== '1');
  test.setTimeout(7_200_000);
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Canvas Size…', exact: true }).click();
  await page.getByLabel('Width (px)').fill(String(W));
  await page.getByLabel('Height (px)').fill(String(H));
  await page.getByRole('button', { name: 'Apply canvas size', exact: true }).click();
  await expect(canvas(page)).toHaveJSProperty('width', W);
  await settled(page);
  const rows = page.getByRole('button', { name: /^Select layer / });
  for (let i = 0; i < N; i += 1) {
    const b64: string = await page.evaluate(async ({ W, H, i }) => {
      const c = new OffscreenCanvas(W, H), x = c.getContext('2d')!;
      let seed = i * 7919 + 1;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let k = 0; k < 4; k += 1) {
        x.fillStyle = `hsla(${Math.floor(rnd() * 360)},70%,50%,0.5)`;
        x.beginPath();
        x.arc(rnd() * W, rnd() * H, 60 + rnd() * W * 0.2, 0, Math.PI * 2);
        x.fill();
      }
      const bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let bin = '';
      for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
      return btoa(bin);
    }, { W, H, i });
    await page.getByTestId('layer-input').setInputFiles({ name: `Bench ${i}.png`, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
    await expect(rows).toHaveCount(i + 2, { timeout: 120_000 });
    await settled(page);
    // A live render filter on the new (active) layer, as in a painting.
    const filter = FILTERS[i % FILTERS.length];
    if (filter) {
      await menu(page, 'Filter', filter);
      const apply = page.getByRole('dialog').getByRole('button', { name: /^(Apply|OK)/ });
      if (await apply.count()) await apply.first().click();
      await settled(page);
    }
  }
  // An artist leaves the bottom layer active, as a saved draft often does.
  await rows.last().click();
  await settled(page);
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device', { timeout: 600_000 });

  const opened = Date.now();
  await page.reload();
  await expect(rows).toHaveCount(N + 1, { timeout: 1_800_000 });
  const firstVisible = Date.now() - opened;
  const loadTimeline = await progressTimeline(page, opened);
  await settled(page);
  const ready = Date.now() - opened;
  console.log(`reopen: rows+canvas ${firstVisible} ms, render ready ${ready} ms`);
  console.log(`reopen timeline: ${loadTimeline.join(' | ')}`);

  // First stroke on the 3rd row from the top.
  await rows.nth(2).click();
  await settled(page);
  await selectTool(page, 'Brush');
  await page.evaluate(() => performance.clearMarks('pixelforge.composite-cache'));
  await canvas(page).scrollIntoViewIfNeeded();
  // The visible part of the canvas (a tall document can extend past the viewport).
  const full = (await canvas(page).boundingBox())!, viewport = page.viewportSize()!;
  const top = Math.max(full.y, 0), bottom = Math.min(full.y + full.height, viewport.height);
  const left = Math.max(full.x, 0), right = Math.min(full.x + full.width, viewport.width);
  const box = { x: left, y: top, width: right - left, height: bottom - top };
  const strokeStart = Date.now();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  for (let s = 1; s <= 6; s += 1) await page.mouse.move(box.x + box.width * (0.3 + s * 0.05), box.y + box.height * 0.3, { steps: 2 });
  await page.mouse.up();
  await expect(page.locator('footer')).toContainText('Paint layer updated', { timeout: 900_000 });
  const strokeTimeline = await progressTimeline(page, strokeStart);
  await settled(page);
  console.log(`first stroke: ${Date.now() - strokeStart} ms; timeline ${strokeTimeline.join(' | ')}`);
  console.log(`first stroke marks: ${JSON.stringify(await page.evaluate(() =>
    (performance.getEntriesByName('pixelforge.composite-cache', 'mark') as PerformanceMark[]).map((m) => m.detail)))}`);
  const second = Date.now();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(50);
  await settled(page);
  console.log(`second stroke: ${Date.now() - second} ms`);
});
