import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { openPanel } from './sidebar-panels';
import { answerPrompt } from './prompt-dialog';

// Filter menu / Filter effects panel audit fixes (docs/filter-panel-controls-contract.md).

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

type Fixture = 'textured' | 'disc' | 'grid' | 'step';

async function importImage(page: Page, kind: Fixture, width: number, height: number) {
  const encoded = await page.evaluate(({ kind, width, height }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    const data = context.createImageData(width, height);
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        let rgb: [number, number, number];
        if (kind === 'disc') rgb = Math.hypot(x - (width - 1) / 2, y - (height - 1) / 2) <= 8 ? [255, 255, 255] : [0, 0, 0];
        else if (kind === 'grid') rgb = x % 16 < 2 || y % 16 < 2 ? [250, 250, 250] : [20, 40, 60];
        else if (kind === 'step') rgb = x < width / 2 ? [110, 110, 110] : [150, 150, 150];
        else rgb = [
          (x * 4 + (((x >> 3) + (y >> 3)) % 2) * 90) % 256,
          (y * 5 + (x % 7) * 20) % 256,
          ((x + y) * 3 + ((x * y) % 11) * 9) % 256,
        ];
        data.data.set([...rgb, 255], offset);
      }
    context.putImageData(data, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  }, { kind, width, height });
  await page.getByTestId('file-input').setInputFiles({
    name: `${kind}.png`,
    mimeType: 'image/png',
    buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
}

const pixels = (page: Page) =>
  page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) =>
    Array.from(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data),
  );
const pixel = (page: Page, x: number, y: number) =>
  page.getByTestId('editor-canvas').evaluate(
    (canvas: HTMLCanvasElement, point) => Array.from(canvas.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data),
    { x, y },
  );
const settled = (page: Page) => expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
const brightCount = (data: number[]) => {
  let count = 0;
  for (let offset = 0; offset < data.length; offset += 4) if (data[offset] > 128) count += 1;
  return count;
};
const readout = (page: Page, label: string) =>
  page.locator('label.slider', { has: page.locator('b', { hasText: new RegExp(`^${label}$`) }) }).locator('output');

async function menuCommand(page: Page, menu: string, name: string | RegExp) {
  await page.getByRole('button', { name: menu, exact: true }).click();
  const item = typeof name === 'string'
    ? page.getByRole('menuitem', { name, exact: true }).and(page.locator(':not([disabled])'))
    : page.getByRole('menuitem', { name });
  await item.click();
}

async function chooseInPanel(page: Page, type: string) {
  await openPanel(page, 'Filters');
  await page.getByLabel('Filter effect', { exact: true }).selectOption(type);
  await settled(page);
}

async function downloadProject(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return await downloadedProject((await (await pending).path())!) as {
    history: Array<{ active: string; layers: Array<{ id: string; adjustments: { filterEffects?: Record<string, unknown>; photoAdjustments?: Record<string, unknown> } }> }>;
    index: number;
  };
}

test('the Filter menu groups the Sharpen commands under their own heading', async ({ page }) => {
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const names = await page.getByRole('menu', { name: 'Filter menu' }).getByRole('menuitem').evaluateAll((items) =>
    items.map((item) => `${(item as HTMLButtonElement).disabled ? '#' : ''}${item.querySelector('span')?.textContent ?? ''}`),
  );
  const heading = names.indexOf('#Sharpen');
  expect(heading).toBeGreaterThan(names.indexOf('Flame…'));
  expect(names.indexOf('#Render')).toBeLessThan(names.indexOf('Flame…'));
  expect(names.slice(heading + 1, heading + 6)).toEqual(['Sharpen', 'Sharpen Edges', 'Sharpen More', 'Smart Sharpen…', 'Unsharp Mask…']);
  expect(names[heading + 6]).toBe('#Stylize');
});

test('each kept radius slider changes the canvas and reads in its real unit', async ({ page }) => {
  await importImage(page, 'textured', 64, 48);
  const cases: Array<[type: string, label: string, min: string, max: string, unit: RegExp]> = [
    ['twirl', 'Twirl radius', '8', '64', /^\d+% of shorter side$/],
    ['spherize', 'Spherize radius', '8', '64', /^\d+% of shorter side$/],
    ['pinch', 'Pinch radius', '8', '64', /^\d+% of shorter side$/],
    ['liquify', 'Liquify radius', '8', '64', /^\d+% of shorter side$/],
    ['polar-coordinates', 'Polar radius', '8', '64', /^\d+% of shorter side$/],
    ['lens-flare', 'Flare size', '8', '64', /^\d+% of shorter side$/],
    ['tree', 'Trunk length', '2', '15', /^\d+% of shorter side$/],
    ['emboss', 'Emboss depth', '1', '8', /^\d px$/],
    ['lens-correction', 'Correction radius', '8', '64', /^\d+% of half diagonal$/],
    ['adaptive-wide-angle', 'Correction radius', '8', '64', /^\d+% of half diagonal$/],
  ];
  for (const [type, label, min, max, unit] of cases) {
    await chooseInPanel(page, type);
    const slider = page.getByLabel(label, { exact: true });
    await slider.fill(min);
    await settled(page);
    const low = await pixels(page);
    await slider.fill(max);
    await settled(page);
    await expect.poll(() => pixels(page), { message: `${type} ${label}` }).not.toEqual(low);
    await expect(readout(page, label)).toHaveText(unit);
  }
  // Threshold and count readouts.
  await chooseInPanel(page, 'dust-scratches');
  await expect(readout(page, 'Outlier threshold')).toHaveText('12 / 255');
  await chooseInPanel(page, 'tree');
  await expect(readout(page, 'Branch count')).toHaveText(/^\d$/);
  await chooseInPanel(page, 'fibers');
  await expect(readout(page, 'Fiber variance')).toHaveText(/^\d+$/);
});

test('filters without a radius show no radius slider', async ({ page }) => {
  await importImage(page, 'textured', 64, 48);
  for (const type of ['average-blur', 'blur', 'despeckle', 'solarize', 'sharpen']) {
    await chooseInPanel(page, type);
    await expect(page.getByLabel('Effect amount', { exact: true })).toBeVisible();
    for (const label of ['Radius', 'Blur radius'])
      await expect(page.getByLabel(label, { exact: true }), `${type} ${label}`).toHaveCount(0);
  }
  // Path Blur's authored path replaces the centre sliders.
  await chooseInPanel(page, 'path-blur');
  await expect(page.getByLabel('Path direction', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Path center X', { exact: true })).toHaveCount(0);
});

test('Liquify Bloat enlarges the content under the radius', async ({ page }) => {
  await importImage(page, 'disc', 64, 48);
  const before = brightCount(await pixels(page));
  await menuCommand(page, 'Filter', 'Liquify…');
  await openPanel(page, 'Filters');
  await page.getByLabel('Liquify mode', { exact: true }).selectOption('bloat');
  await page.getByLabel('Effect amount', { exact: true }).fill('100');
  await settled(page);
  await expect.poll(async () => brightCount(await pixels(page))).toBeGreaterThan(before * 1.15);
});

test('Edit > Fade after a live filter sets that filter’s opacity', async ({ page }) => {
  await importImage(page, 'textured', 64, 48);
  const original = await pixels(page);
  await menuCommand(page, 'Filter', 'Gaussian Blur…');
  await settled(page);
  const blurred = await pixels(page);
  expect(blurred).not.toEqual(original);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Fade/ })).toBeEnabled();
  await page.getByRole('menuitem', { name: /^Fade/ }).click();
  await answerPrompt(page, 'Fade Gaussian blur', { 'Fade opacity': '0' });
  await expect(page.locator('footer')).toContainText('Gaussian blur faded to 0%');
  await settled(page);
  await expect.poll(() => pixels(page)).toEqual(original);
  // A second Fade has nothing new to fade.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Fade/ })).toBeDisabled();
  await page.keyboard.press('Escape');
  // The panel shows the stored fade and edits it.
  await openPanel(page, 'Filters');
  const fade = page.getByLabel('Faded to (Edit → Fade)', { exact: true });
  await expect(fade).toHaveValue('0');
  await fade.fill('50');
  await settled(page);
  const half = await pixels(page);
  for (let index = 0; index < half.length; index += 97)
    expect(Math.abs(half[index] - Math.round(original[index] * 0.5 + blurred[index] * 0.5))).toBeLessThanOrEqual(1);
  const project = await downloadProject(page);
  const frame = project.history[project.index];
  expect(frame.layers.find((layer) => layer.id === frame.active)!.adjustments.filterEffects).toMatchObject({ type: 'gaussian-blur', fade: 50 });
  await fade.fill('100');
  await settled(page);
  await expect(fade).toHaveCount(0);
  await expect.poll(() => pixels(page)).toEqual(blurred);
});

test('Lens Correction reaches the whole layer instead of a 64 px circle', async ({ page }) => {
  await importImage(page, 'grid', 320, 240);
  const before = await pixels(page);
  /** Changed pixels more than 70 px from the centre (outside the old 64 px cap). */
  const farChanges = (after: number[]) => {
    let count = 0;
    for (let y = 0; y < 240; y += 1) for (let x = 0; x < 320; x += 1) {
      if (Math.hypot(x - 159.5, y - 119.5) <= 70) continue;
      const offset = (y * 320 + x) * 4;
      if (after[offset] !== before[offset]) count += 1;
    }
    return count;
  };
  await menuCommand(page, 'Filter', 'Lens Correction…');
  await settled(page);
  await expect.poll(async () => farChanges(await pixels(page))).toBeGreaterThan(3000);
  await openPanel(page, 'Filters');
  await expect(readout(page, 'Correction radius')).toHaveText('100% of half diagonal');
});

test('Camera Raw Clarity adds midtone local contrast, not saturation', async ({ page }) => {
  await importImage(page, 'step', 40, 20);
  const left = await pixel(page, 19, 10), right = await pixel(page, 20, 10), far = await pixel(page, 2, 10);
  await menuCommand(page, 'Filter', 'Camera Raw Filter…');
  const dialog = page.getByRole('dialog', { name: 'Camera Raw Filter' });
  await dialog.getByLabel('Clarity', { exact: true }).fill('100');
  await dialog.getByRole('button', { name: 'Apply Camera Raw', exact: true }).click();
  await settled(page);
  await expect.poll(async () => (await pixel(page, 20, 10))[0] - (await pixel(page, 19, 10))[0]).toBeGreaterThan(right[0] - left[0] + 10);
  const farAfter = await pixel(page, 2, 10);
  expect(Math.abs(farAfter[0] - far[0])).toBeLessThanOrEqual(2);
  // Gray stays gray: no saturation is added.
  expect(farAfter[0]).toBe(farAfter[1]);
  expect((await pixel(page, 20, 10))[0]).toBe((await pixel(page, 20, 10))[2]);
});

test('Filter effects panel controls use the sidebar styles', async ({ page }, testInfo) => {
  await importImage(page, 'textured', 64, 48);
  await menuCommand(page, 'Filter', 'Lens Correction…');
  await openPanel(page, 'Filters');
  const panel = page.locator('.filter-effects-panel');
  const description = panel.locator('p', { hasText: 'Manual radial correction' });
  await expect(description).toHaveCSS('font-size', '11px');
  const direction = panel.locator('label', { hasText: 'Correction direction' });
  await expect(direction).toHaveCSS('font-size', '10px');
  await expect(direction.locator('select')).toHaveCSS('border-top-style', 'solid');
  const centre = panel.getByLabel('Filter center X in pixels', { exact: true });
  expect((await centre.boundingBox())!.height).toBeGreaterThanOrEqual(28);
  const stack = panel.getByRole('button', { name: /^Add filter to stack/ });
  await expect(stack).toHaveCSS('font-size', '10px');
  await expect(stack).toHaveCSS('border-top-style', 'solid');
  await panel.screenshot({ path: testInfo.outputPath('lens-correction-panel.png') });

  await page.getByLabel('Filter effect', { exact: true }).selectOption('gaussian-blur');
  const exact = panel.getByLabel('Blur radius in pixels', { exact: true });
  expect((await exact.boundingBox())!.height).toBeGreaterThanOrEqual(28);
  await expect(panel.locator('p', { hasText: 'This effect stays editable' })).toHaveCSS('font-size', '11px');

  await page.getByLabel('Filter effect', { exact: true }).selectOption('tree');
  await expect(panel.locator('p', { hasText: 'Bounded seeded recursive branch' })).toHaveCount(1);

  await page.getByLabel('Filter effect', { exact: true }).selectOption('light-rays');
  const fieldset = panel.getByTestId('light-rays-controls');
  for (const label of await fieldset.locator('label:not(.slider)').all())
    await expect(label).toHaveCSS('font-size', '10px');
  await expect(fieldset.locator('legend')).toHaveCSS('font-size', '11px');
  await fieldset.screenshot({ path: testInfo.outputPath('light-rays-panel.png') });

  await page.getByLabel('Filter effect', { exact: true }).selectOption('lens-flare');
  await expect(panel.locator('label', { hasText: 'Fill transparent pixels' })).toHaveCSS('font-size', '10px');
  await panel.screenshot({ path: testInfo.outputPath('lens-flare-panel.png') });
});

test('the selection-region buttons are styled sidebar buttons', async ({ page }, testInfo) => {
  await importImage(page, 'textured', 64, 48);
  await menuCommand(page, 'Select', /^All Ctrl\+A$/);
  await menuCommand(page, 'Filter', 'Gaussian Blur…');
  await openPanel(page, 'Filters');
  const note = page.getByTestId('filter-region');
  const whole = note.getByRole('button', { name: 'Whole layer', exact: true });
  await expect(whole).toBeVisible();
  await expect(whole).toHaveCSS('border-top-style', 'solid');
  await expect(whole).toHaveCSS('font-size', '10px');
  await expect(note).toHaveCSS('font-size', '11px');
  await page.locator('.filter-effects-panel').screenshot({ path: testInfo.outputPath('region-panel.png') });
});
