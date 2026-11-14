import { expect, test, type Locator, type Page } from '@playwright/test';
import { clickCanvas, dragOnCanvas, highlight, openEditor, openSample, selectTool, shoot } from './helpers';

// Help Center screenshots for the Painting and drawing category (W4).

async function settled(page: Page): Promise<void> {
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });
}

/** Set a range slider the way a drag would (React listens to input events). */
async function setRange(target: Locator, value: number): Promise<void> {
  await target.evaluate((element, next) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(next));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

const options = (page: Page) => page.getByTestId('tool-options-area');
const slider = (page: Page, label: string, value: number) => setRange(options(page).getByRole('slider', { name: label, exact: true }), value);

async function newWhite(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /^New white document/ }).click();
  await settled(page);
}

async function setColor(page: Page, hex: string, well = 'Drawing color'): Promise<void> {
  await page.getByLabel(well, { exact: true }).fill(hex);
}

async function setSize(page: Page, px: number): Promise<void> {
  await options(page).getByRole('spinbutton', { name: 'Size', exact: true }).fill(String(px));
  await options(page).getByRole('spinbutton', { name: 'Size', exact: true }).press('Tab');
}

/** Drag through several points given as fractions of the canvas box. */
async function path(page: Page, points: [number, number][], steps = 10): Promise<void> {
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  const at = ([x, y]: [number, number]) => [box.x + box.width * x, box.y + box.height * y] as const;
  await page.mouse.move(...at(points[0]));
  await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(...at(point), { steps });
  await page.mouse.up();
  await settled(page);
}

const wave = (y: number, amp: number, x0 = 0.1, x1 = 0.9, n = 12): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y + Math.sin((i / n) * Math.PI * 2) * amp]);

async function ring(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  await highlight(target);
}

test('brush-strokes', async ({ page }) => {
  await openEditor(page);
  await newWhite(page);
  await selectTool(page, 'Brush');
  await setColor(page, '#1f6feb');
  await setSize(page, 40);
  await path(page, wave(0.3, 0.08));
  await setColor(page, '#e5533d');
  await slider(page, 'Hardness', 0);
  await setSize(page, 70);
  await path(page, wave(0.6, -0.08));
  await slider(page, 'Hardness', 100);
  await ring(page, options(page).getByRole('spinbutton', { name: 'Size', exact: true }));
  await highlight(page.getByLabel('Drawing color', { exact: true }));
  await shoot(page, 'brush-strokes');
});

test('brush-dynamics', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'city');
  await selectTool(page, 'Brush');
  await setColor(page, '#ffcc66');
  await setSize(page, 14);
  await slider(page, 'Spacing', 300);
  await slider(page, 'Scatter', 400);
  await slider(page, 'Count', 3);
  await slider(page, 'Size jitter', 70);
  await slider(page, 'Hue jitter', 40);
  await slider(page, 'Brightness jitter', 30);
  await path(page, wave(0.25, 0.06));
  const group = options(page).getByRole('slider', { name: 'Hue jitter', exact: true });
  await ring(page, group);
  await shoot(page, 'brush-dynamics');
});

test('brush-preset-library', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'city');
  await selectTool(page, 'Brush');
  await options(page).getByRole('combobox', { name: 'Saved brush preset', exact: true }).selectOption({ label: 'Star field' });
  await setColor(page, '#bcd7ff');
  await path(page, wave(0.2, 0.05), 14);
  await options(page).getByRole('combobox', { name: 'Saved brush preset', exact: true }).selectOption({ label: 'Soft glow' });
  await setColor(page, '#ff9a5c');
  await clickCanvas(page, [0.75, 0.3]);
  await settled(page);
  await ring(page, options(page).getByRole('group', { name: 'Brush preset library' }));
  await shoot(page, 'brush-preset-library');
});

test('pencil-tool', async ({ page }) => {
  await openEditor(page);
  await newWhite(page);
  await selectTool(page, 'Pencil');
  await setColor(page, '#222222');
  await setSize(page, 3);
  await path(page, wave(0.35, 0.1, 0.15, 0.85, 20), 6);
  await setSize(page, 12);
  await setColor(page, '#2a9d8f');
  await path(page, wave(0.6, 0.1, 0.15, 0.85, 20), 6);
  await ring(page, options(page).getByRole('spinbutton', { name: 'Size', exact: true }));
  await shoot(page, 'pencil-tool');
});

test('eraser-background-eraser', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Background Eraser');
  await setSize(page, 160);
  await slider(page, 'Color tolerance', 60);
  await path(page, [[0.08, 0.12], [0.3, 0.14], [0.5, 0.12]], 16);
  await ring(page, options(page).getByRole('slider', { name: 'Color tolerance', exact: true }));
  await shoot(page, 'eraser-background-eraser');
});

test('mixer-brush-smear', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Mixer Brush');
  await setSize(page, 60);
  await slider(page, 'Wet', 80);
  await slider(page, 'Load', 80);
  await path(page, [[0.6, 0.3], [0.68, 0.5], [0.76, 0.66]], 20);
  await path(page, [[0.56, 0.62], [0.7, 0.5], [0.82, 0.38]], 20);
  await ring(page, options(page).getByRole('slider', { name: 'Wet', exact: true }));
  await shoot(page, 'mixer-brush-smear');
});

test('color-replace-sky', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Color Replace');
  await setColor(page, '#2fbf71');
  await setSize(page, 220);
  await slider(page, 'Color tolerance', 90);
  await options(page).getByRole('combobox', { name: 'Color Replace limits', exact: true }).selectOption({ label: 'Discontiguous' });
  await path(page, [[0.05, 0.08], [0.45, 0.1], [0.95, 0.08]], 20);
  await ring(page, options(page).getByRole('combobox', { name: 'Color Replace mode', exact: true }));
  await shoot(page, 'color-replace-sky');
});

test('gradient-radial', async ({ page }) => {
  await openEditor(page);
  await newWhite(page);
  await selectTool(page, 'Gradient');
  await setColor(page, '#ffb347');
  await setColor(page, '#3a1c71', 'Background color');
  await options(page).getByRole('combobox', { name: 'Gradient type', exact: true }).selectOption({ label: 'Radial' });
  await options(page).getByRole('combobox', { name: 'Gradient end', exact: true }).selectOption({ label: 'Background colour' });
  await dragOnCanvas(page, [0.5, 0.5], [0.95, 0.85]);
  await settled(page);
  await ring(page, options(page).getByRole('combobox', { name: 'Gradient type', exact: true }));
  await shoot(page, 'gradient-radial');
});

test('paint-bucket-fill', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Fill');
  await setColor(page, '#2a9d8f');
  await clickCanvas(page, [0.5, 0.62]);
  await settled(page);
  await ring(page, options(page).getByRole('checkbox', { name: 'Contiguous', exact: true }));
  await shoot(page, 'paint-bucket-fill');
});

test('paint-symmetry-radial', async ({ page }) => {
  await openEditor(page);
  await newWhite(page);
  await selectTool(page, 'Brush');
  await options(page).getByRole('combobox', { name: 'Paint symmetry', exact: true }).selectOption({ label: 'Mandala' });
  await setRange(options(page).getByRole('slider', { name: 'Symmetry segments', exact: true }), 6);
  await setColor(page, '#7b2cbf');
  await setSize(page, 10);
  await path(page, [[0.52, 0.45], [0.58, 0.3], [0.62, 0.2]], 12);
  await setColor(page, '#f77f00');
  await path(page, [[0.55, 0.5], [0.65, 0.42], [0.7, 0.5], [0.66, 0.6]], 12);
  await ring(page, options(page).getByRole('group', { name: 'Symmetry' }));
  await shoot(page, 'paint-symmetry-radial');
});

test('silk-strands-brush', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'city');
  await selectTool(page, 'Brush');
  await options(page).getByRole('combobox', { name: 'Saved brush preset', exact: true }).selectOption({ label: 'Silk smoke' });
  await setColor(page, '#9ad1ff');
  await path(page, [[0.1, 0.4], [0.3, 0.2], [0.5, 0.35], [0.7, 0.18], [0.9, 0.3]], 16);
  await ring(page, options(page).getByRole('group', { name: 'Silk strands options' }));
  await shoot(page, 'silk-strands-brush');
});

test('smudge-tool', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Smudge');
  await setSize(page, 50);
  await slider(page, 'Strength', 80);
  for (const x of [0.62, 0.66, 0.7, 0.74]) await path(page, [[x, 0.5], [x + 0.03, 0.3]], 14);
  await ring(page, options(page).getByRole('group', { name: 'Smudge options' }).getByRole('slider', { name: 'Strength', exact: true }));
  await shoot(page, 'smudge-tool');
});

test('history-brush-restore', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Brush');
  await setColor(page, '#888888');
  await setSize(page, 400);
  await path(page, [[0.05, 0.3], [0.95, 0.3]], 10);
  await path(page, [[0.05, 0.7], [0.95, 0.7]], 10);
  await selectTool(page, 'History Brush');
  await setSize(page, 140);
  await path(page, [[0.35, 0.2], [0.5, 0.5], [0.65, 0.8]], 16);
  await ring(page, options(page).getByRole('combobox', { name: 'History source', exact: true }));
  await shoot(page, 'history-brush-restore');
});

test('color-wells', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Eyedropper');
  await options(page).getByRole('combobox', { name: 'Sample size', exact: true }).selectOption({ label: '5 by 5 Average' });
  await clickCanvas(page, [0.68, 0.5]);
  await ring(page, options(page).getByRole('combobox', { name: 'Sample size', exact: true }));
  await page.getByLabel('Background color', { exact: true }).scrollIntoViewIfNeeded();
  await highlight(page.getByLabel('Drawing color', { exact: true }), page.getByLabel('Background color', { exact: true }));
  await shoot(page, 'color-wells');
});

test('pattern-stamp', async ({ page }) => {
  await openEditor(page);
  await newWhite(page);
  await selectTool(page, 'Pattern Stamp');
  await setColor(page, '#264653');
  await setColor(page, '#e9c46a', 'Background color');
  await setSize(page, 160);
  await options(page).getByRole('combobox', { name: 'Pattern source', exact: true }).selectOption({ label: 'Dots' });
  await path(page, wave(0.35, 0.08), 12);
  await options(page).getByRole('combobox', { name: 'Pattern source', exact: true }).selectOption({ label: 'Mesh' });
  await path(page, wave(0.7, -0.06), 12);
  await ring(page, options(page).getByRole('combobox', { name: 'Pattern source', exact: true }));
  await shoot(page, 'pattern-stamp');
});
