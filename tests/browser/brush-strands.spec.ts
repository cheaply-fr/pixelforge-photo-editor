import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';

// Brush › Silk strands on a small 400×300 black document: one mouse drag
// paints several distinct fine strands that twist around the stroke. Pixels
// are read back from the composited editor canvas (desktop and mobile).

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const overlay = (page: Page) => page.getByTestId('strand-preview-overlay');
const settled = (page: Page) => expect(canvas(page)).toHaveAttribute('data-rendering', 'false');

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

async function newDocument(page: Page, width = 400, height = 300) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('New document width (px)').fill(String(width));
  await dialog.getByLabel('New document height (px)').fill(String(height));
  await dialog.getByLabel('Background contents').selectOption('black');
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(canvas(page)).toHaveJSProperty('width', width);
  await settled(page);
}

async function setColor(page: Page, value: string) {
  await page.getByLabel('Drawing color', { exact: true }).evaluate((input: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function setSlider(page: Page, label: string, value: string) {
  const slider = page.getByLabel(label, { exact: true });
  await slider.fill(value);
  await expect(slider).toHaveValue(value);
}

async function setupSilk(page: Page, values: { count: string; width: string; twists: string; seed: string }) {
  await selectTool(page, 'Brush');
  await setColor(page, '#ffffff');
  // Size is the ribbon width; each strand keeps its own 2 px thickness.
  await page.getByLabel('Size', { exact: true }).fill(values.width);
  await page.getByLabel('Size', { exact: true }).press('Enter');
  await setSlider(page, 'Opacity', '100');
  await page.getByLabel('Silk strands', { exact: true }).check();
  await setSlider(page, 'Strands', values.count);
  await setSlider(page, 'Strand thickness', '2');
  await setSlider(page, 'Twists', values.twists);
  await setSlider(page, 'Wobble', '0');
  await setSlider(page, 'Strand opacity jitter', '0');
  await page.getByLabel('Strand seed', { exact: true }).fill(values.seed);
  await expect(page.getByLabel('Strand seed', { exact: true })).toHaveValue(values.seed);
}

async function at(page: Page, x: number, y: number) {
  return canvas(page).evaluate((element: HTMLCanvasElement, point) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + (point.x / element.width) * rect.width, y: rect.top + (point.y / element.height) * rect.height };
  }, { x, y });
}

/** Brightness (max channel) of every pixel in one canvas column. */
const column = (page: Page, x: number) =>
  canvas(page).evaluate((element: HTMLCanvasElement, columnX) => {
    const data = element.getContext('2d')!.getImageData(columnX, 0, 1, element.height).data,
      values: number[] = [];
    for (let index = 0; index < data.length; index += 4) values.push(Math.max(data[index], data[index + 1], data[index + 2]));
    return values;
  }, x);

/** Separate bright runs (strands) in a column, ignoring faint anti-aliasing. */
const runs = (values: number[], threshold = 40) => {
  const found: { start: number; end: number }[] = [];
  values.forEach((value, y) => {
    if (value < threshold) return;
    const last = found[found.length - 1];
    if (last && y - last.end <= 1) last.end = y;
    else found.push({ start: y, end: y });
  });
  return found;
};

/** Checksum and painted-pixel count of the whole canvas, computed in the page. */
const snapshot = (page: Page) =>
  canvas(page).evaluate((element: HTMLCanvasElement) => {
    const data = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    let hash = 0x811c9dc5,
      lit = 0;
    for (let index = 0; index < data.length; index += 1) {
      hash = Math.imul(hash ^ data[index], 0x01000193);
      if (index % 4 === 0 && Math.max(data[index], data[index + 1], data[index + 2]) > 40) lit += 1;
    }
    return { hash: hash >>> 0, lit };
  });

/** Drag from (40,150) to (360,150) in a gentle arc; checks the live preview mid-drag. */
async function drag(page: Page, expectPreview = false) {
  await canvas(page).scrollIntoViewIfNeeded();
  const points: [number, number][] = [];
  for (let i = 0; i <= 16; i += 1) points.push([40 + i * 20, 150 + Math.sin((i / 16) * Math.PI) * 6]);
  const start = await at(page, ...points[0]);
  await page.mouse.move(start.x, start.y);
  // Count document renders started while the button is down.
  await canvas(page).evaluate((element: HTMLCanvasElement) => {
    const state = window as unknown as { __strandRenders: number; __strandObserver?: MutationObserver };
    state.__strandRenders = 0;
    state.__strandObserver?.disconnect();
    state.__strandObserver = new MutationObserver(() => {
      if (element.dataset.rendering === 'true') state.__strandRenders += 1;
    });
    state.__strandObserver.observe(element, { attributes: true, attributeFilter: ['data-rendering'] });
  });
  await page.mouse.down();
  for (const [x, y] of points.slice(1)) {
    const next = await at(page, x, y);
    await page.mouse.move(next.x, next.y, { steps: 2 });
  }
  if (expectPreview) {
    // The preview is drawn on its own overlay; the layer itself is not
    // re-rendered while dragging, so the canvas centre is still black.
    await expect.poll(async () => Number(await overlay(page).getAttribute('data-strands'))).toBeGreaterThan(0);
    expect((await column(page, 200)).every((value) => value < 10)).toBe(true);
  }
  // No full layer-stack render per pointer move: nothing renders until release.
  expect(await page.evaluate(() => (window as unknown as { __strandRenders: number }).__strandRenders)).toBe(0);
  await page.mouse.up();
  await expect(page.locator('footer')).toContainText(/Silk strands painted \(\d+ strands\)/, { timeout: 15000 });
  await settled(page);
}

test('Silk strands controls are accessible, Brush-only, persisted and fit the viewport', async ({ page }) => {
  await selectTool(page, 'Brush');
  const toggle = page.getByLabel('Silk strands', { exact: true });
  await expect(toggle).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await expect(page.getByLabel('Strands', { exact: true })).toHaveCount(0);
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toBeChecked();
  for (const label of ['Strands', 'Strand thickness', 'Twists', 'Wobble', 'Strand opacity jitter', 'Strand seed'])
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Silk strands options' })).toBeVisible();
  await expect(page.getByTestId('strand-note')).toContainText('bounded local approximation');
  await expect(overlay(page)).toHaveCount(1);
  await setSlider(page, 'Strands', '30');
  await setSlider(page, 'Twists', '3.5');
  await page.getByLabel('Strand seed', { exact: true }).fill('4242');
  const seed = page.getByLabel('Strand seed', { exact: true });
  await page.getByRole('button', { name: 'New seed', exact: true }).click();
  await expect(seed).not.toHaveValue('4242');
  await seed.fill('4242');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  for (const label of ['Strands', 'Strand seed', 'New seed']) {
    const control = label === 'New seed' ? page.getByRole('button', { name: label, exact: true }) : page.getByLabel(label, { exact: true });
    await control.scrollIntoViewIfNeeded();
    const box = (await control.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  }

  // Pencil and Eraser never show the strand controls or overlay.
  await selectTool(page, 'Pencil');
  await expect(page.getByLabel('Silk strands', { exact: true })).toHaveCount(0);
  await expect(overlay(page)).toHaveCount(0);
  await selectTool(page, 'Brush');
  await expect(page.getByLabel('Strands', { exact: true })).toHaveValue('30');

  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  expect(project.settings.brushStrands).toMatchObject({ enabled: true, count: 30, twists: 3.5, seed: 4242 });
});

test('the built-in Silk smoke preset turns Silk strands on', async ({ page }) => {
  await selectTool(page, 'Brush');
  const library = page.getByLabel('Saved brush preset', { exact: true });
  await expect(library.locator('option', { hasText: 'Silk smoke' })).toHaveCount(1);
  await library.selectOption({ label: 'Silk smoke' });
  await expect(page.locator('footer')).toContainText('Brush preset “Silk smoke” applied');
  await expect(page.getByLabel('Silk strands', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Strands', { exact: true })).toHaveValue('22');
  await expect(page.getByLabel('Brush mode', { exact: true })).toHaveValue('screen');
  // Another built-in preset turns strands off again.
  await library.selectOption({ label: 'Smoke wisp' });
  await expect(page.getByLabel('Silk strands', { exact: true })).not.toBeChecked();
});

test('one drag paints several distinct fine strands across the ribbon', async ({ page }) => {
  await newDocument(page);
  await setupSilk(page, { count: '8', width: '160', twists: '0', seed: '4' });
  await drag(page, true);
  await expect(page.locator('footer')).toContainText('Silk strands painted (8 strands)');
  for (const x of [180, 200, 220]) {
    const found = runs(await column(page, x));
    // Separate strands, each thin (Size 2), not one painted blob.
    expect(found.length, `strands at x=${x}`).toBeGreaterThanOrEqual(6);
    for (const run of found) expect(run.end - run.start, `strand thickness at x=${x}`).toBeLessThanOrEqual(6);
    // Within the ribbon width around the stroke.
    expect(Math.min(...found.map((run) => run.start))).toBeGreaterThanOrEqual(150 - 95);
    expect(Math.max(...found.map((run) => run.end))).toBeLessThanOrEqual(156 + 95);
  }
  // Tapered ends: near the stroke start the ribbon has narrowed.
  const nearStart = runs(await column(page, 48));
  const middle = runs(await column(page, 200));
  const spread = (list: { start: number; end: number }[]) =>
    list.length ? Math.max(...list.map((run) => run.end)) - Math.min(...list.map((run) => run.start)) : 0;
  expect(spread(nearStart)).toBeLessThan(spread(middle) * 0.6);
  // The preview overlay is cleared once the committed composite is shown.
  await expect.poll(async () => overlay(page).getAttribute('data-strands'), { timeout: 6000 }).toBe('0');
});

test('strands twist and cross over, and the same seed repaints identically', async ({ page }) => {
  await newDocument(page);
  await setupSilk(page, { count: '12', width: '160', twists: '2', seed: '4' });
  await drag(page);
  // Vertical extent of the bright strands in each column, measured in the page.
  const spreads = await canvas(page).evaluate((element: HTMLCanvasElement) => {
    const { width, height } = element,
      data = element.getContext('2d')!.getImageData(0, 0, width, height).data,
      result: number[] = [];
    for (let x = 110; x <= 290; x += 6) {
      let top = -1,
        bottom = -1;
      for (let y = 0; y < height; y += 1) {
        const index = (y * width + x) * 4;
        if (Math.max(data[index], data[index + 1], data[index + 2]) < 30) continue;
        if (top < 0) top = y;
        bottom = y;
      }
      result.push(top < 0 ? 0 : bottom - top);
    }
    return result;
  });
  const widest = Math.max(...spreads), narrowest = Math.min(...spreads);
  expect(widest).toBeGreaterThan(60);
  // Where the ribbon twists edge-on every strand meets: the band pinches.
  expect(narrowest).toBeLessThan(widest * 0.3);
  // At least two pinch points (two twists give four crossings over the stroke).
  let pinches = 0;
  for (let i = 1; i < spreads.length; i += 1)
    if (spreads[i] < widest * 0.35 && spreads[i - 1] >= widest * 0.35) pinches += 1;
  expect(pinches).toBeGreaterThanOrEqual(2);

  const first = await snapshot(page);
  expect(first.lit).toBeGreaterThan(500);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await settled(page);
  expect((await column(page, 200)).every((value) => value < 10)).toBe(true);
  await drag(page);
  expect(await snapshot(page)).toEqual(first);
});

test('a stroke on a tiled (1 MP or more) layer is kept by the dirty-tile commit and survives undo/redo', async ({ page }) => {
  // 1,200 × 1,000 px: the Background is stored as tiles, so the commit only
  // re-encodes the tiles the strands reported as written.
  await newDocument(page, 1200, 1000);
  await setupSilk(page, { count: '10', width: '200', twists: '1', seed: '4' });
  await canvas(page).scrollIntoViewIfNeeded();
  const points: [number, number][] = [[150, 500], [450, 430], [750, 560], [1050, 500]];
  const start = await at(page, ...points[0]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const point of points.slice(1)) {
    const next = await at(page, ...point);
    await page.mouse.move(next.x, next.y, { steps: 4 });
  }
  await page.mouse.up();
  await expect(page.locator('footer')).toContainText('Silk strands painted (10 strands)', { timeout: 20000 });
  await settled(page);
  const painted = await snapshot(page);
  expect(painted.lit).toBeGreaterThan(2000);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await settled(page);
  expect((await snapshot(page)).lit).toBe(0);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z');
  await settled(page);
  expect(await snapshot(page)).toEqual(painted);
});
