import { test, expect, type Page, type Request } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

async function openEditor(page: Page) {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
}

async function project(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return downloadedProject((await download.path())!);
}

function fontRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request: Request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/fonts/') && /\.woff2?$/.test(url.pathname)) urls.push(url.pathname);
  });
  return urls;
}

/** Per-row luminance sums of the editor canvas: a compact pixel signature. */
async function canvasRows(page: Page): Promise<number[]> {
  return page.getByTestId('editor-canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const rows: number[] = [];
    for (let y = 0; y < canvas.height; y += 1) {
      let sum = 0;
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        sum += data[offset] + data[offset + 1] + data[offset + 2];
      }
      rows.push(sum);
    }
    return rows;
  });
}

function rowDifference(a: number[], b: number[]): number {
  let changed = 0;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) if (Math.abs((a[index] ?? 0) - (b[index] ?? 0)) > 255) changed += 1;
  return changed;
}

async function addTextLayer(page: Page, family: string, text: string, beforeCommit?: () => Promise<void>) {
  await selectTool(page, 'Horizontal Type');
  await page.getByLabel('Text content', { exact: true }).fill(text);
  await page.getByLabel('Text tool font', { exact: true }).selectOption(family);
  // The Text tool options (and their font warning) unmount once a commit
  // hands the layer to the Move tool, so callers inspect them here.
  await beforeCommit?.();
  await page.getByTestId('editor-canvas').click({ position: { x: 40, y: 40 } });
  await expect(page.getByText('Editable text layer added', { exact: true })).toBeVisible();
  // Commit the edit so later layer-panel changes apply to the stored layer.
  await page.keyboard.press('Control+Enter');
  await expect(page.getByRole('button', { name: 'Move tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
}

test('font picker searches, filters by category, keeps favourites and supports the keyboard', async ({ page }) => {
  await openEditor(page);
  await selectTool(page, 'Horizontal Type');
  await page.getByRole('button', { name: 'Browse typefaces', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Text tool font' });
  await expect(picker).toBeVisible();
  // Virtualised: the full catalogue is counted but only a window is in the DOM.
  await expect(picker.locator('.font-picker-count')).toHaveText(/^1\d\d fonts$/);
  expect(await picker.locator('.font-picker-row').count()).toBeLessThan(20);

  await picker.getByLabel('Search fonts', { exact: true }).fill('garamond');
  await expect(picker.getByRole('button', { name: 'Use font EB Garamond', exact: true })).toBeVisible();
  await expect(picker.getByRole('button', { name: 'Use font Cormorant Garamond', exact: true })).toBeVisible();
  await expect(picker.getByRole('button', { name: 'Use font Lobster', exact: true })).toHaveCount(0);

  await picker.getByLabel('Search fonts', { exact: true }).fill('');
  await picker.getByLabel('Font category', { exact: true }).selectOption('monospace');
  await expect(picker.getByRole('button', { name: 'Use font JetBrains Mono', exact: true })).toBeVisible();
  await expect(picker.getByRole('button', { name: 'Use font Lora', exact: true })).toHaveCount(0);
  const favourite = picker.getByRole('button', { name: 'Favourite JetBrains Mono', exact: true });
  await favourite.click();
  await expect(favourite).toHaveAttribute('aria-pressed', 'true');
  await picker.getByLabel('Font category', { exact: true }).selectOption('favourites');
  await expect(picker.locator('.font-picker-count')).toHaveText('1 font');
  // The live preview renders with the font once its face has loaded.
  await expect(picker.getByTestId('font-picker-preview')).toHaveCSS('font-family', /JetBrains Mono/);
  await picker.getByRole('button', { name: 'Use font JetBrains Mono', exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.getByLabel('Text tool font', { exact: true })).toHaveValue('JetBrains Mono');

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Horizontal Type');
  await page.getByRole('button', { name: 'Browse typefaces', exact: true }).click();
  await picker.getByLabel('Font category', { exact: true }).selectOption('favourites');
  await expect(picker.getByRole('button', { name: 'Favourite JetBrains Mono', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await picker.getByLabel('Font category', { exact: true }).selectOption('recent');
  await expect(picker.getByRole('button', { name: 'Use font JetBrains Mono', exact: true })).toBeVisible();

  await picker.getByLabel('Font category', { exact: true }).selectOption('all');
  const search = picker.getByLabel('Search fonts', { exact: true });
  await search.fill('lobster');
  await search.press('ArrowDown');
  await expect(picker.getByRole('button', { name: 'Use font Lobster', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Text tool font', { exact: true })).toHaveValue('Lobster');
});

test('choosing a font loads only that family, renders with it and survives reload', async ({ page }) => {
  const requested = fontRequests(page);
  await openEditor(page);
  expect(requested, 'no font files load with the page').toEqual([]);

  await addTextLayer(page, 'Arial', 'Hamburgefonstiv');
  await expect.poll(async () => (await canvasRows(page)).some((row, index, rows) => row !== rows[0])).toBe(true);
  const arial = await canvasRows(page);
  expect(requested).toEqual([]);

  await page.getByLabel('Layer font', { exact: true }).selectOption('Press Start 2P');
  await expect.poll(() => requested.length).toBeGreaterThan(0);
  await expect.poll(async () => rowDifference(arial, await canvasRows(page))).toBeGreaterThan(10);
  expect(requested.every((url) => url.startsWith('/fonts/press-start-2p/press-start-2p-')), requested.join(', ')).toBe(true);

  const saved = await project(page);
  const layer = saved.history[saved.index].layers.find((item: { kind: string }) => item.kind === 'text') as { fontFamily: string };
  expect(layer.fontFamily).toBe('Press Start 2P');

  const before = await canvasRows(page);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Layer font', { exact: true })).toHaveValue('Press Start 2P');
  // The reloaded render waits for the face before drawing.
  await expect.poll(async () => rowDifference(before, await canvasRows(page))).toBe(0);
});

test('a library font renders differently from the fallback shown when it cannot load', async ({ browser, baseURL }) => {
  const render = async (blockFonts: boolean) => {
    // Service-worker fetches bypass page.route, so keep the worker out of this comparison.
    const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
    if (blockFonts) await page.route('**/fonts/**', (route) => route.abort());
    await openEditor(page);
    await addTextLayer(page, 'Bungee', 'Fallback?', async () => {
      if (blockFonts) await expect(page.getByTestId('font-fallback-warning')).toContainText('fallback rendering is active');
      else await expect(page.getByTestId('font-fallback-warning')).toHaveCount(0);
    });
    let rows: number[] = [];
    await expect
      .poll(async () => {
        rows = await canvasRows(page);
        return rows.some((row) => row !== rows[0]);
      })
      .toBe(true);
    // Let any in-flight render settle.
    await page.waitForTimeout(300);
    rows = await canvasRows(page);
    await context.close();
    return rows;
  };
  const fallback = await render(true);
  const loaded = await render(false);
  expect(rowDifference(fallback, loaded)).toBeGreaterThan(10);
});

test('documents with unknown fonts stay editable and disclose the fallback', async ({ page }) => {
  await openEditor(page);
  await addTextLayer(page, 'Arial', 'Portable');
  const saved = await project(page);
  const frame = saved.history[saved.index];
  frame.layers.find((item: { kind: string }) => item.kind === 'text').fontFamily = 'Studio Grotesk Pro';
  await page.getByTestId('project-input').setInputFiles({ name: 'missing-font.pixelforge', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await expect(page.getByText('Missing fonts: Studio Grotesk Pro. Text stays editable and renders with a fallback font.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Layer font', { exact: true })).toHaveValue('Studio Grotesk Pro');
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Manage Missing Fonts', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Manage Missing Fonts' });
  await expect(dialog.getByTestId('font-status-Studio-Grotesk-Pro')).toHaveText(/Missing · fallback active/);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('Layer font', { exact: true }).selectOption('Lora');
  await expect(page.getByLabel('Layer font', { exact: true })).toHaveValue('Lora');
});

test('glyphs panel searches icon and symbol fonts and inserts glyphs into text layers', async ({ page }) => {
  const requested = fontRequests(page);
  await openEditor(page);
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Glyphs, Icons & Symbols…', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Glyphs, icons & symbols' });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('Glyph font', { exact: true })).toHaveValue('Material Symbols Outlined');
  await expect(panel.locator('.glyphs-count')).toHaveText(/^\d{4} glyphs · showing first 240/);
  await panel.getByLabel('Search glyphs', { exact: true }).fill('home');
  await panel.getByRole('button', { name: 'Insert home', exact: true }).click();
  await expect(page.getByText('Glyph added as a new Material Symbols Outlined text layer', { exact: true })).toBeVisible();
  await panel.getByLabel('Search glyphs', { exact: true }).fill('search');
  await panel.getByRole('button', { name: 'Insert search', exact: true }).click();
  await expect(page.getByText('Glyph added to the active text layer', { exact: true })).toBeVisible();

  await panel.getByLabel('Glyph font', { exact: true }).selectOption('Font Awesome Free Solid');
  await panel.getByLabel('Search glyphs', { exact: true }).fill('love');
  await panel.getByRole('button', { name: 'Insert heart', exact: true }).click();
  await expect(page.getByText('Glyph added as a new Font Awesome Free Solid text layer', { exact: true })).toBeVisible();
  await expect(panel.getByText(/CC BY 4\.0/)).toBeVisible();

  await panel.getByLabel('Glyph font', { exact: true }).selectOption('Noto Sans Symbols 2');
  await expect(panel.getByLabel('Unicode block', { exact: true })).toBeVisible();
  await panel.getByLabel('Search glyphs', { exact: true }).fill('U+2605');
  await panel.getByRole('button', { name: 'Insert U+2605 · Miscellaneous Symbols', exact: true }).click();
  await expect(page.getByText('Glyph added as a new Noto Sans Symbols 2 text layer', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Close', exact: true }).click();

  const saved = await project(page);
  const texts = saved.history[saved.index].layers.filter((item: { kind: string }) => item.kind === 'text') as { fontFamily: string; text: string }[];
  expect(texts.map((layer) => [layer.fontFamily, layer.text])).toEqual([
    ['Material Symbols Outlined', ''],
    ['Font Awesome Free Solid', ''],
    ['Noto Sans Symbols 2', '★'],
  ]);
  expect(requested.some((url) => url.startsWith('/fonts/material-symbols-outlined/'))).toBe(true);
  expect(requested.some((url) => url.startsWith('/fonts/font-awesome-free-solid/'))).toBe(true);
  // Split symbol fonts load per unicode-range subset; U+2605 lives in "symbols".
  expect(requested).toContain('/fonts/noto-sans-symbols-2/noto-sans-symbols-2-symbols-400-normal.woff2');

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Layer font', { exact: true })).toHaveValue('Noto Sans Symbols 2');
});

test('a font used once keeps working offline through the service worker', async ({ page }) => {
  await openEditor(page);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller))).toBe(true);
  const requested = fontRequests(page);
  await addTextLayer(page, 'Lobster', 'Offline');
  await expect.poll(() => requested.some((url) => url.startsWith('/fonts/lobster/'))).toBe(true);
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Manage Missing Fonts', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Manage Missing Fonts' });
  await expect(dialog.getByTestId('font-status-Lobster')).toHaveText(/Library font · loaded/);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await caches.open('pixelforge-fonts-v1')).keys().then((keys) => keys.length))).toBeGreaterThan(0);
  const bookmark = page.url();

  await page.context().setOffline(true);
  try {
    await page.goto(bookmark, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByLabel('Layer font', { exact: true })).toHaveValue('Lobster');
    await page.getByRole('button', { name: 'Type', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Manage Missing Fonts', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Manage Missing Fonts' }).getByTestId('font-status-Lobster')).toHaveText(/Library font · loaded/);
  } finally {
    await page.context().setOffline(false);
  }
});
