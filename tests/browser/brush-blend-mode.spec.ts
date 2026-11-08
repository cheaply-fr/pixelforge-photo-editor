import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';

// Brush/Pencil Mode (blend mode) on a small 400×200 document painted straight
// onto its opaque Background layer, read back from the composited editor
// canvas (desktop and mobile projects).

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const settled = (page: Page) => expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
const modeSelect = (page: Page) => page.getByLabel('Brush mode', { exact: true });
const librarySelect = (page: Page) => page.getByLabel('Saved brush preset', { exact: true });

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

async function newDocument(page: Page, background: 'white' | 'black') {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('New document width (px)').fill('400');
  await dialog.getByLabel('New document height (px)').fill('200');
  await dialog.getByLabel('Background contents').selectOption(background);
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(canvas(page)).toHaveJSProperty('width', 400);
  await settled(page);
}

async function setColor(page: Page, value: string) {
  await page.getByLabel('Drawing color', { exact: true }).evaluate((input: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function at(page: Page, x: number, y: number) {
  return canvas(page).evaluate((element: HTMLCanvasElement, point) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + (point.x / element.width) * rect.width, y: rect.top + (point.y / element.height) * rect.height };
  }, { x, y });
}

const area = (page: Page, x: number, y: number, width: number, height: number) =>
  canvas(page).evaluate((element: HTMLCanvasElement, rect) =>
    Array.from(element.getContext('2d')!.getImageData(rect.x, rect.y, rect.width, rect.height).data),
  { x, y, width, height });
const rgb = async (page: Page, x: number, y: number) => (await area(page, x, y, 1, 1)).slice(0, 3);

async function mouseStroke(page: Page, from: [number, number], to: [number, number]) {
  await canvas(page).scrollIntoViewIfNeeded();
  const a = await at(page, ...from), b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 14 });
  await page.mouse.up();
  await expect(page.locator('footer')).toContainText('Paint layer updated', { timeout: 10000 });
  await settled(page);
}

async function setSlider(page: Page, label: string, value: string) {
  const slider = page.getByLabel(label, { exact: true });
  await slider.fill(value);
  await expect(slider).toHaveValue(value);
}

async function setupBrush(page: Page, tool: 'Brush' | 'Pencil', color: string, size = '16') {
  await selectTool(page, tool);
  await setColor(page, color);
  await page.getByLabel('Size', { exact: true }).fill(size);
  await page.getByLabel('Size', { exact: true }).press('Enter');
  if (tool === 'Brush') await setSlider(page, 'Hardness', '100');
  // Dense spacing: every pixel of the stroke core is covered by many dabs.
  await setSlider(page, 'Spacing', '5');
}

const near = (actual: number[], expected: number[], tolerance = 1) =>
  actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);

test('Mode is offered for Brush and Pencil only, defaults to Normal and lists Canvas-native modes', async ({ page }) => {
  await selectTool(page, 'Brush');
  const select = modeSelect(page);
  await expect(select).toBeVisible();
  await expect(select).toHaveValue('source-over');
  await expect(select.locator('option:checked')).toHaveText('Normal');
  const options = await select.locator('option').allTextContents();
  expect(options).toEqual(expect.arrayContaining(['Normal', 'Multiply', 'Screen', 'Overlay', 'Darken', 'Lighten', 'Color', 'Luminosity']));
  expect(options).toHaveLength(16);
  expect(options).not.toContain('Linear Burn');
  expect(options).not.toContain('Linear Dodge (Add)');
  await expect(select.locator('optgroup')).toHaveCount(6);
  // Keyboard reachable and compact: no horizontal page overflow.
  await select.focus();
  await expect(select).toBeFocused();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const box = (await select.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);

  await select.selectOption('multiply');
  await selectTool(page, 'Pencil');
  await expect(modeSelect(page)).toHaveValue('multiply');
  await selectTool(page, 'Eraser');
  await expect(modeSelect(page)).toHaveCount(0);
  await selectTool(page, 'Brush');
  await expect(modeSelect(page)).toHaveValue('multiply');
});

test('a Multiply stroke multiplies once against the layer, never against its own overlapping dabs', async ({ page }) => {
  await newDocument(page, 'white');
  await setupBrush(page, 'Brush', '#ff0000');
  await mouseStroke(page, [200, 20], [200, 180]);
  expect(await rgb(page, 200, 100)).toEqual([255, 0, 0]);

  await setColor(page, '#808080');
  await modeSelect(page).selectOption('multiply');
  await mouseStroke(page, [30, 100], [370, 100]);
  // Over white: exactly one coat of grey despite ~20 overlapping dabs per pixel.
  expect(near(await rgb(page, 100, 100), [128, 128, 128])).toBe(true);
  expect(near(await rgb(page, 300, 100), [128, 128, 128])).toBe(true);
  // Over the red stroke: red × grey.
  expect(near(await rgb(page, 200, 100), [128, 0, 0])).toBe(true);
  // Outside the stroke the layer is untouched.
  expect(await rgb(page, 100, 30)).toEqual([255, 255, 255]);
  expect(await rgb(page, 200, 30)).toEqual([255, 0, 0]);

  // One undo step restores the stroke-start pixels.
  await page.keyboard.press('ControlOrMeta+z');
  await settled(page);
  expect(await rgb(page, 100, 100)).toEqual([255, 255, 255]);
  expect(await rgb(page, 200, 100)).toEqual([255, 0, 0]);
});

test('Normal strokes keep compounding opacity exactly as before', async ({ page }) => {
  await newDocument(page, 'white');
  await setupBrush(page, 'Brush', '#000000');
  await setSlider(page, 'Opacity', '50');
  await expect(modeSelect(page)).toHaveValue('source-over');
  await mouseStroke(page, [30, 100], [370, 100]);
  // Legacy behaviour: overlapping 50% dabs build up towards full black.
  const core = await rgb(page, 200, 100);
  expect(core[0]).toBeLessThan(20);
});

test('Pencil Darken and Brush Screen paint the documented results', async ({ page }) => {
  await newDocument(page, 'black');
  // A white Normal band first, then Darken grey across it.
  await setupBrush(page, 'Pencil', '#ffffff');
  await mouseStroke(page, [200, 20], [200, 180]);
  expect(await rgb(page, 200, 100)).toEqual([255, 255, 255]);
  await setColor(page, '#808080');
  await modeSelect(page).selectOption('darken');
  await mouseStroke(page, [30, 60], [370, 60]);
  expect(await rgb(page, 100, 60)).toEqual([0, 0, 0]);
  expect(near(await rgb(page, 200, 60), [128, 128, 128])).toBe(true);

  await selectTool(page, 'Brush');
  await setSlider(page, 'Hardness', '100');
  await setColor(page, '#0000ff');
  await modeSelect(page).selectOption('screen');
  await mouseStroke(page, [30, 140], [370, 140]);
  // Screen blue over black = blue; over white = white.
  expect(await rgb(page, 100, 140)).toEqual([0, 0, 255]);
  expect(await rgb(page, 200, 140)).toEqual([255, 255, 255]);
});

test('the live preview of a blend-mode stroke matches the committed result', async ({ page }) => {
  await newDocument(page, 'white');
  await setupBrush(page, 'Brush', '#ff0000');
  await mouseStroke(page, [200, 20], [200, 180]);
  await setColor(page, '#3366cc');
  await modeSelect(page).selectOption('difference');
  await canvas(page).scrollIntoViewIfNeeded();
  const a = await at(page, 30, 100), b = await at(page, 370, 100);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 14 });
  // The preview has painted the far end of the stroke before release.
  await expect.poll(async () => (await rgb(page, 360, 100)).join(','), { timeout: 10000 }).not.toBe('255,255,255');
  await settled(page);
  const preview = await area(page, 0, 80, 400, 40);
  await page.mouse.up();
  await expect(page.locator('footer')).toContainText('Paint layer updated', { timeout: 10000 });
  await settled(page);
  const committed = await area(page, 0, 80, 400, 40);
  let worst = 0;
  for (let index = 0; index < committed.length; index += 1)
    worst = Math.max(worst, Math.abs(committed[index] - preview[index]));
  expect(worst).toBeLessThanOrEqual(1);
  // Difference: |white − #3366cc| and |red − #3366cc|.
  expect(near(await rgb(page, 100, 100), [204, 153, 51])).toBe(true);
  expect(near(await rgb(page, 200, 100), [204, 102, 204])).toBe(true);
});

test('presets store and restore the mode; old presets load as Normal and unknown modes are dropped', async ({ page }) => {
  await page.evaluate(() => {
    const base = {
      size: 30, hardness: 50, spacing: 25, angle: 0, roundness: 100, flipX: false, flipY: false,
      pressureSize: false, pressureOpacity: false, pressureCurve: 'linear', brushSmoothing: 0, brushScatter: 0,
      brushTexture: 0, brushDual: 0, secondaryBrushPreset: 'none', brushBristle: 0, brushWetEdges: 0,
      brushBuildUp: 0, brushFlow: 100,
    };
    window.localStorage.setItem('pixelforge.brush-presets.v1', JSON.stringify({
      version: 1,
      presets: [
        { ...base, id: '00000000-0000-4000-8000-000000000001', label: 'Old preset' },
        { ...base, id: '00000000-0000-4000-8000-000000000002', label: 'Broken mode', brushBlendMode: 'plus-darker' },
      ],
    }));
  });
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Brush');
  await expect(librarySelect(page).locator('option', { hasText: 'Old preset' })).toHaveCount(1);
  await expect(librarySelect(page).locator('option', { hasText: 'Broken mode' })).toHaveCount(0);

  await modeSelect(page).selectOption('multiply');
  page.once('dialog', (dialog) => dialog.accept('Shade'));
  await page.getByRole('button', { name: 'Save brush preset', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Brush preset “Shade” saved on this device');
  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('pixelforge.brush-presets.v1') ?? 'null'));
  expect(stored.presets.find((preset: { label: string }) => preset.label === 'Shade').brushBlendMode).toBe('multiply');

  await librarySelect(page).selectOption({ label: 'Soft glow' });
  await expect(modeSelect(page)).toHaveValue('screen');
  await librarySelect(page).selectOption({ label: 'Smoke wisp' });
  await expect(modeSelect(page)).toHaveValue('source-over');
  await librarySelect(page).selectOption({ label: 'Shade' });
  await expect(modeSelect(page)).toHaveValue('multiply');
  await librarySelect(page).selectOption({ label: 'Old preset' });
  await expect(modeSelect(page)).toHaveValue('source-over');

  // The mode itself is a saved tool option, and the project carries both.
  await librarySelect(page).selectOption({ label: 'Shade' });
  await expect(modeSelect(page)).toHaveValue('multiply');
  await saved(page);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  expect(project.settings.brushBlendMode).toBe('multiply');
  const shade = project.settings.customBrushPresets.find((preset: { label: string }) => preset.label === 'Shade');
  expect(shade.brushBlendMode).toBe('multiply');

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Brush');
  await expect(modeSelect(page)).toHaveValue('multiply');
});

test('a blend-mode stroke stays confined to the selection and repeats through Paint Symmetry', async ({ page }) => {
  await newDocument(page, 'white');
  // Selection: the left half of the canvas.
  await selectTool(page, 'Select');
  await canvas(page).scrollIntoViewIfNeeded();
  const a = await at(page, 0, 0), b = await at(page, 200, 200);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('footer')).toContainText(/selection/i);
  await setupBrush(page, 'Brush', '#808080');
  await modeSelect(page).selectOption('multiply');
  await mouseStroke(page, [30, 60], [370, 60]);
  expect(near(await rgb(page, 100, 60), [128, 128, 128])).toBe(true);
  expect(await rgb(page, 300, 60)).toEqual([255, 255, 255]);
  await page.keyboard.press('ControlOrMeta+d');
  await settled(page);

  // Vertical mirror: the copy multiplies once as well, and the centre stays white.
  await page.getByLabel('Paint symmetry', { exact: true }).selectOption('vertical');
  await mouseStroke(page, [40, 140], [120, 140]);
  expect(near(await rgb(page, 80, 140), [128, 128, 128])).toBe(true);
  expect(near(await rgb(page, 320, 140), [128, 128, 128])).toBe(true);
  expect(await rgb(page, 200, 140)).toEqual([255, 255, 255]);
});
