import { expect, test, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';
import { openPanel } from './sidebar-panels';

/**
 * A noisy photo makes every raster history step a multi-megabyte PNG asset,
 * the case where the previous 32 MB history budget kept only a few steps.
 * Large layers are stored as shared 256 × 256 tiles
 * (tiled-layer-assets-contract.md), so a short stroke now costs only the
 * tiles it touched; the persistence test paints full-width strokes on a
 * larger photo to exceed the 64 MB draft history budget again.
 */
const SIZE = 1400;
/** Photo size and stroke span used by the draft-window test. */
const WIDE = { size: 3200, x0: 8, x1: 3192 };
let size = SIZE;
let span = { x0: 300, x1: 340 };
const STROKES = 12;
const RED = [255, 0, 0, 255];

test.beforeEach(async ({ page }) => {
  size = SIZE;
  span = { x0: 300, x1: 340 };
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const historyPanel = (page: Page) => page.getByRole('region', { name: 'History' });
const position = (page: Page) => historyPanel(page).getByLabel('History position');
const settled = (page: Page) => expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
const saveStatus = (page: Page) => page.getByRole('status', { name: 'Draft save status' });
const strokeY = (i: number) => 60 + i * 100;

async function openNoisyPhoto(page: Page, photo = SIZE) {
  size = photo;
  const png = await page.evaluate((size) => {
    const element = document.createElement('canvas');
    element.width = size;
    element.height = size;
    const context = element.getContext('2d')!;
    const image = context.createImageData(size, size);
    // Deterministic xorshift noise: incompressible, so each PNG is several MB.
    let seed = 0x2545f491;
    for (let i = 0; i < image.data.length; i += 4) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      image.data[i] = seed & 0xff;
      image.data[i + 1] = (seed >>> 8) & 0xff;
      image.data[i + 2] = (seed >>> 16) & 0x7f; // never pure red
      image.data[i + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return element.toDataURL('image/png').split(',')[1];
  }, size);
  await page.getByTestId('file-input').setInputFiles({
    name: 'noisy-photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(canvas(page)).toHaveAttribute('width', String(size));
  await settled(page);
  await openPanel(page, 'History');
  await expect(position(page)).toHaveText('1 / 1');
}

async function clientPoint(page: Page, x: number, y: number) {
  const box = (await canvas(page).boundingBox())!;
  return {
    clientX: box.x + ((x + 0.5) / size) * box.width,
    clientY: box.y + ((y + 0.5) / size) * box.height,
  };
}

async function stroke(page: Page, pointerId: number, y: number) {
  const start = await clientPoint(page, span.x0, y);
  const end = await clientPoint(page, span.x1, y);
  await canvas(page).evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  const common = { pointerId, pointerType: 'mouse', pressure: 1, isPrimary: true };
  await canvas(page).dispatchEvent('pointerdown', { ...common, ...start, buttons: 1 });
  await page.waitForTimeout(100);
  await canvas(page).dispatchEvent('pointermove', { ...common, ...end, buttons: 1 });
  await canvas(page).dispatchEvent('pointerup', { ...common, ...end, buttons: 0 });
  await settled(page);
}

/** Which of the stroke marks are currently painted (pure red centre pixel). */
const paintedMarks = (page: Page) =>
  canvas(page).evaluate(
    (element: HTMLCanvasElement, { count, red }) => {
      const context = element.getContext('2d')!;
      return Array.from({ length: count }, (_, i) => {
        const pixel = Array.from(context.getImageData(320, 60 + i * 100, 1, 1).data);
        return pixel.every((value, channel) => value === red[channel]);
      });
    },
    { count: STROKES, red: RED },
  );
const expectMarks = async (page: Page, painted: number) => {
  await settled(page);
  expect(await paintedMarks(page)).toEqual(Array.from({ length: STROKES }, (_, i) => i < painted));
};

async function paintStrokes(page: Page) {
  await selectTool(page, 'Brush');
  await page.getByLabel('Drawing color', { exact: true }).fill('#ff0000');
  await page.getByLabel('Size', { exact: true }).fill('24');
  for (let i = 0; i < STROKES; i += 1) {
    await stroke(page, 100 + i, strokeY(i));
    await expect(position(page)).toHaveText(`${i + 2} / ${i + 2}`);
  }
  await expectMarks(page, STROKES);
}

/** Editor shortcuts are ignored while a text field (e.g. brush Size) has focus. */
const blurFields = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

/** Current position and length of the in-memory history stack. */
async function stepCount(page: Page) {
  const text = (await position(page).textContent()) || '';
  const [, current, total] = /(\d+) \/ (\d+)/.exec(text)!;
  return { current: Number(current), total: Number(total) };
}

test('ten-plus multi-megabyte raster edits can all be undone and redone', async ({ page }) => {
  test.setTimeout(240_000);
  await openNoisyPhoto(page);
  await paintStrokes(page);
  // Every step is retained: the old 24-step / 32 MB budget would have kept ~4.
  expect(await stepCount(page)).toEqual({ current: STROKES + 1, total: STROKES + 1 });

  // Undo all of them with the keyboard, checking pixels after each step.
  await blurFields(page);
  for (let painted = STROKES - 1; painted >= 0; painted -= 1) {
    await page.keyboard.press('Control+z');
    await expect(position(page)).toHaveText(`${painted + 1} / ${STROKES + 1}`);
    await expectMarks(page, painted);
  }
  // Redo the full range, alternating Ctrl+Shift+Z and Ctrl+Y.
  for (let painted = 1; painted <= STROKES; painted += 1) {
    await page.keyboard.press(painted % 2 ? 'Control+Shift+z' : 'Control+y');
    await expect(position(page)).toHaveText(`${painted + 1} / ${STROKES + 1}`);
    await expectMarks(page, painted);
  }

  // The History panel restores both ends of the full range.
  await historyPanel(page).getByRole('button', { name: /^Restore history step 1:/ }).click();
  await expect(position(page)).toHaveText(`1 / ${STROKES + 1}`);
  await expectMarks(page, 0);
  await historyPanel(page).getByRole('button', { name: new RegExp(`^Restore history step ${STROKES + 1}:`) }).click();
  await expect(position(page)).toHaveText(`${STROKES + 1} / ${STROKES + 1}`);
  await expectMarks(page, STROKES);

  // A new edit after undo still discards the abandoned redo branch.
  await blurFields(page);
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Control+z');
  await expect(position(page)).toHaveText(`${STROKES - 2} / ${STROKES + 1}`);
  await expectMarks(page, STROKES - 3);
  await stroke(page, 300, strokeY(STROKES - 1));
  await expect(position(page)).toHaveText(`${STROKES - 1} / ${STROKES - 1}`);
  await page.keyboard.press('Control+Shift+z');
  await expect(position(page)).toHaveText(`${STROKES - 1} / ${STROKES - 1}`);
  await expect(saveStatus(page)).toHaveText('Saved on this device');
});

test('local saves persist the newest history window and reload restores it', async ({ page }) => {
  test.setTimeout(360_000);
  await openNoisyPhoto(page, WIDE.size);
  span = { x0: WIDE.x0, x1: WIDE.x1 };
  await paintStrokes(page);
  await expect(saveStatus(page)).toHaveText('Saved on this device', { timeout: 60_000 });
  // Older states stay in memory only and the panel says so.
  const note = historyPanel(page).getByLabel('History persistence');
  await expect(note).toContainText(/older steps? stays? in memory only/);
  const text = (await note.textContent())!;
  const [, first, last] = /Steps (\d+)–(\d+) are saved/.exec(text)!.map(Number);
  expect(last).toBe(STROKES + 1);
  const persisted = last - first + 1;
  expect(persisted).toBeGreaterThanOrEqual(2);
  expect(persisted).toBeLessThan(STROKES + 1);
  await expect(historyPanel(page).locator('[data-memory-only="true"]')).toHaveCount(first - 1);

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false', { timeout: 60_000 });
  await expect(canvas(page)).toHaveAttribute('width', String(size));
  await openPanel(page, 'History');
  await expect(position(page)).toHaveText(`${persisted} / ${persisted}`);
  await expectMarks(page, STROKES);
  await expect(note).toHaveCount(0);
  // Every persisted step is still undoable after reload.
  await blurFields(page);
  for (let i = 1; i < persisted; i += 1) {
    await page.keyboard.press('Control+z');
    await expect(position(page)).toHaveText(`${persisted - i} / ${persisted}`);
    await expectMarks(page, STROKES - i);
  }
  await expect(saveStatus(page)).toHaveText('Saved on this device');
  await expect(page.locator('footer')).not.toContainText(/Local save failed|exceeds/);
  expect(errors).toEqual([]);
});
