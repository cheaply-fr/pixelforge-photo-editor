import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

type SavedLayer = Record<string, unknown> & { kind: string; name: string; groupId?: string };
type Saved = { history: Array<{ w: number; h: number; layers: SavedLayer[]; groups?: Array<{ name: string; opacity: number }> }>; index: number };

/** Shapes only (fonts differ between machines), with joins, arcs, transforms and opacity. */
const SHAPES_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 120 80">
<style>.warm{fill:#ff5c35;stroke:#1d1d1f;stroke-width:3;stroke-linejoin:miter}</style>
<rect class="warm" x="8" y="8" width="44" height="30"/>
<g id="Badge" opacity="0.8">
  <circle cx="86" cy="24" r="16" fill="#2a7fff"/>
  <path d="M70 60 q 10 -20 20 0 t 20 0" fill="none" stroke="#18a058" stroke-width="4" stroke-linecap="butt"/>
</g>
<polygon points="10,70 30,46 50,70" fill="#ffd400" transform="rotate(-8 30 60)" opacity="0.6"/>
</svg>`;

const MIXED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">
<defs><linearGradient id="sky"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient></defs>
<rect width="300" height="60" fill="url(#sky)"/>
<rect id="Card" x="20" y="80" width="120" height="80" rx="12" fill="#ffffff" stroke="#333333" stroke-width="2"/>
<text id="Headline" x="160" y="120" font-family="Arial" font-size="28" fill="#222222" text-anchor="middle">Hello SVG</text>
</svg>`;

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

async function openSvg(page: Page, name: string, markup: string | Buffer) {
  await page.getByTestId('file-input').setInputFiles({
    name,
    mimeType: 'image/svg+xml',
    buffer: typeof markup === 'string' ? Buffer.from(markup) : markup,
  });
}

async function savedDocument(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const saved = (await downloadedProject((await (await pending).path())!)) as Saved;
  return saved.history[saved.index];
}

async function exportFile(page: Page, format: 'svg' | 'png') {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Export format').selectOption(format);
  await expect(page.getByLabel('Encoded file size')).toContainText(`.${format}`);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download image', exact: true }).click();
  const download = await pending;
  const bytes = await readFile((await download.path())!);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  return { name: download.suggestedFilename(), bytes };
}

/** Mean per-channel difference between two images drawn by the browser (0–255). */
async function meanDifference(page: Page, a: { type: string; base64: string }, b: { type: string; base64: string }, w: number, h: number) {
  return page.evaluate(async ({ a, b, w, h }) => {
    const pixels = async (source: { type: string; base64: string }) => {
      const image = new Image();
      image.src = `data:${source.type};base64,${source.base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, w, h);
      context.drawImage(image, 0, 0, w, h);
      return context.getImageData(0, 0, w, h).data;
    };
    const [left, right] = await Promise.all([pixels(a), pixels(b)]);
    let total = 0;
    for (let index = 0; index < left.length; index += 4)
      for (let channel = 0; channel < 3; channel++) total += Math.abs(left[index + channel] - right[index + channel]);
    return total / ((left.length / 4) * 3);
  }, { a, b, w, h });
}

test('opens an SVG as editable vector, text and pixel layers', async ({ page }) => {
  await openSvg(page, 'mixed.svg', MIXED_SVG);
  await expect(page.getByText('SVG opened as 1 vector, 1 text, 1 pixel layers; gradients, effects and embedded images are kept as pixel layers', { exact: true })).toBeVisible();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '300');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('height', '200');
  const frame = await savedDocument(page);
  expect(frame.layers.map((layer) => [layer.kind, layer.name])).toEqual([
    ['raster', 'Rectangle'],
    ['path', 'Card'],
    ['text', 'Headline'],
  ]);
  const text = frame.layers[2] as SavedLayer & { text: string; fontSize: number; matrix: number[] };
  expect(text.text).toBe('Hello SVG');
  expect(text.fontSize).toBe(28);
  // text-anchor="middle": the measured line is centred on x = 160.
  expect(text.matrix[4]).toBeLessThan(160);
  expect(text.matrix[4]).toBeGreaterThan(60);
  await expect(page.getByRole('button', { name: 'Select layer Card', exact: true })).toBeVisible();
});

test('imported vector layers render like the browser renders the original SVG', async ({ page }) => {
  await openSvg(page, 'shapes.svg', SHAPES_SVG);
  await expect(page.getByText(/^SVG opened as 4 vector layers/)).toBeVisible();
  const frame = await savedDocument(page);
  expect(frame.w).toBe(240);
  expect(frame.layers.every((layer) => layer.kind === 'path')).toBe(true);
  expect(frame.groups?.map((group) => [group.name, group.opacity])).toEqual([['Badge', 0.8]]);
  const png = await exportFile(page, 'png');
  const difference = await meanDifference(
    page,
    { type: 'image/svg+xml', base64: Buffer.from(SHAPES_SVG).toString('base64') },
    { type: 'image/png', base64: png.bytes.toString('base64') },
    240,
    160,
  );
  // Only anti-aliasing at edges may differ.
  expect(difference).toBeLessThan(1.5);
});

test('Export as SVG writes live vectors and text that reopen as the same layers', async ({ page }) => {
  await openSvg(page, 'mixed.svg', MIXED_SVG);
  await expect(page.getByText(/^SVG opened as/)).toBeVisible();
  const svg = await exportFile(page, 'svg');
  expect(svg.name).toBe('mixed.svg');
  const markup = svg.bytes.toString('utf8');
  expect(markup).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  expect(markup).toContain('width="300" height="200" viewBox="0 0 300 200"');
  expect(markup).toMatch(/<path data-name="Card" d="M [^"]+"/);
  expect(markup).toMatch(/<text data-name="Headline"[^>]*><tspan[^>]*>Hello SVG<\/tspan><\/text>/);
  expect(markup).toMatch(/<image data-name="Rectangle" [^>]*xlink:href="data:image\/png;base64,/);
  // Reopening the export gives back the same editable layers.
  await openSvg(page, 'round-trip.svg', svg.bytes);
  await expect(page.getByText('SVG opened as 1 vector, 1 text, 1 pixel layers; gradients, effects and embedded images are kept as pixel layers', { exact: true })).toBeVisible();
  const frame = await savedDocument(page);
  expect(frame.layers.map((layer) => [layer.kind, layer.name])).toEqual([
    ['raster', 'Rectangle'],
    ['path', 'Card'],
    ['text', 'Headline'],
  ]);
});

test('the SVG export looks like the canvas, text included', async ({ page }) => {
  await openSvg(page, 'mixed.svg', MIXED_SVG);
  await expect(page.getByText(/^SVG opened as/)).toBeVisible();
  const svg = await exportFile(page, 'svg');
  const png = await exportFile(page, 'png');
  const difference = await meanDifference(
    page,
    { type: 'image/svg+xml', base64: svg.bytes.toString('base64') },
    { type: 'image/png', base64: png.bytes.toString('base64') },
    300,
    200,
  );
  expect(difference).toBeLessThan(1.5);
});

test('shapes drawn in the editor export as native SVG elements from the File menu', async ({ page }) => {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await selectTool(page, 'Polygon');
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.7, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByLabel('Shape type', { exact: true })).toBeVisible();
  await page.getByLabel('Shape type', { exact: true }).selectOption('star');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Export as SVG', exact: true }).click();
  await expect(page.getByLabel('Export format')).toHaveValue('svg');
  await expect(page.getByTestId('export-viewport')).toContainText('Download a layered SVG');
  await expect(page.getByLabel('Export color profile')).toHaveCount(0);
  await expect(page.getByLabel('Encoded file size')).toContainText('.svg');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download image', exact: true }).click();
  const markup = (await readFile((await (await pending).path())!)).toString('utf8');
  // The white background is a pixel layer; the star stays a live polygon.
  expect(markup).toMatch(/<image data-name="Background"/);
  const points = /<polygon [^>]*points="([^"]+)"/.exec(markup)?.[1] ?? '';
  expect(points.split(' ')).toHaveLength(10);
  await expect(page.getByText(/^SVG export downloaded \(\d[\d,]* bytes\)$/)).toBeVisible();
});

test('placing an SVG adds its layers to the open document', async ({ page }) => {
  const before = await page.getByRole('button', { name: /^Select layer / }).count();
  await page.getByTestId('editor-canvas').dispatchEvent('drop', {
    dataTransfer: await page.evaluateHandle((markup) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([markup], 'shapes.svg', { type: 'image/svg+xml' }));
      return transfer;
    }, SHAPES_SVG),
  });
  await expect(page.getByRole('button', { name: /^Select layer / })).toHaveCount(before + 4);
  const frame = await savedDocument(page);
  const placed = frame.layers.slice(-4);
  expect(placed.map((layer) => layer.kind)).toEqual(['path', 'path', 'path', 'path']);
  // Placed layers join the document's own folders, so the SVG group's
  // opacity is folded into its members.
  expect(placed[1].groupId).toBeUndefined();
  expect(placed[1].opacity).toBeCloseTo(0.8, 5);
});
