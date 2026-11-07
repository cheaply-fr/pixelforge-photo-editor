// Local measurement of brush-stroke commit cost on a 2646 x 4096 poster
// (not part of CI).
//
//   node scripts/measure-stroke-commit.mjs <baseUrl>
//
// Opens a noisy full-canvas photo layer (incompressible: worst case for PNG
// encoding) and a sparse paint layer, paints short strokes and reports the
// time from pointer-up to the committed, rendered stroke, plus the browser's
// own `paint` performance spans when present.
import { chromium } from '@playwright/test';
import zlib from 'node:zlib';

const [baseUrl] = process.argv.slice(2);
if (!baseUrl) {
  console.error('usage: node scripts/measure-stroke-commit.mjs <baseUrl>');
  process.exit(2);
}

const W = 2646, H = 4096;
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};
function noisyPng() {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  let state = 7;
  for (let y = 0; y < H; y++) {
    const row = y * (W * 3 + 1);
    for (let x = 0; x < W * 3; x++) {
      state = (state * 1664525 + 1013904223) >>> 0;
      raw[row + 1 + x] = ((x >> 3) + (y >> 4) + (state >>> 28)) & 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(W, 0);
  header.writeUInt32BE(H, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
  route.fulfill({ json: { authenticated: false } }),
);
await page.goto(`${baseUrl}/editor?new=1`);
await page.locator('[role="application"][aria-busy="false"]').waitFor();
const canvas = page.getByTestId('editor-canvas');
const position = page.getByRole('region', { name: 'History' }).getByLabel('History position');
const settled = () =>
  page.waitForFunction(
    () => document.querySelector('[data-testid="editor-canvas"]')?.getAttribute('data-rendering') === 'false',
    undefined,
    { timeout: 300_000, polling: 20 },
  );
await page.getByTestId('file-input').setInputFiles({ name: 'noisy-poster.png', mimeType: 'image/png', buffer: noisyPng() });
await page.waitForFunction(() => (document.querySelector('[data-testid="editor-canvas"]'))?.width === 2646, undefined, { timeout: 300_000 });
await settled();
await page.getByTestId('tool-palette').getByRole('button', { name: 'Brush tool', exact: true }).click();
await page.getByLabel('Size', { exact: true }).fill('80');

async function stroke(index, fx, fy) {
  const box = await canvas.boundingBox();
  await canvas.evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  const at = (x, y) => ({ clientX: box.x + box.width * x, clientY: box.y + box.height * y });
  const common = { pointerId: 50 + index, pointerType: 'mouse', pressure: 1, isPrimary: true };
  const before = await position.innerText();
  await canvas.dispatchEvent('pointerdown', { ...common, ...at(fx, fy), buttons: 1 });
  // Let the gesture start (the layer decodes on press) before moving.
  await page.waitForTimeout(1500);
  for (let step = 1; step <= 10; step++)
    await canvas.dispatchEvent('pointermove', { ...common, ...at(fx + step * 0.01, fy), buttons: 1 });
  await page.waitForTimeout(500);
  const start = performance.now();
  await canvas.dispatchEvent('pointerup', { ...common, ...at(fx + 0.1, fy), buttons: 0 });
  // The commit adds one history step; then wait for its render.
  await page.waitForFunction(
    (previous) => document.querySelector('[aria-label="History position"]')?.textContent !== previous,
    before,
    { timeout: 120_000, polling: 10 },
  );
  await settled();
  return Math.round(performance.now() - start);
}

const results = { fullLayerCommitMs: [], sparseLayerCommitMs: [] };
// Full-canvas noisy photo layer: the whole layer is re-encoded per commit.
for (let i = 0; i < 3; i++) results.fullLayerCommitMs.push(await stroke(i, 0.2, 0.2 + i * 0.1));
// A new paint layer: grown in place, then stored at the stroke's bounds.
await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
await settled();
for (let i = 0; i < 3; i++) results.sparseLayerCommitMs.push(await stroke(10 + i, 0.2, 0.6 + i * 0.1));
results.paintSpans = await page.evaluate(() =>
  performance.getEntriesByType('measure').filter((entry) => /paint/i.test(entry.name)).slice(-6).map((entry) => [entry.name, Math.round(entry.duration)]),
);
console.log(JSON.stringify(results, null, 2));
await browser.close();
