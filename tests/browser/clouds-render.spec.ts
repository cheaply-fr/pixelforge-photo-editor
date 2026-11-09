import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { openPanel } from './sidebar-panels';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const settled = (page: Page, timeout = 15_000) =>
  expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false', { timeout });

async function menu(page: Page, name: string, item: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

async function setColor(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).evaluate((input: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** Summary of the composite canvas: coverage and colour range of a sample. */
const sample = (page: Page) =>
  page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let opaque = 0, n = 0, minR = 255, maxR = 0, maxB = 0;
    const colours = new Set<string>();
    for (let i = 0; i < data.length; i += 4 * 61) {
      n += 1;
      if (data[i + 3] === 255) opaque += 1;
      minR = Math.min(minR, data[i]);
      maxR = Math.max(maxR, data[i]);
      maxB = Math.max(maxB, data[i + 2]);
      colours.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    }
    return { opaqueShare: opaque / n, minR, maxR, maxB, colours: colours.size };
  });

async function project(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return (await downloadedProject((await (await pending).path())!)) as {
    history: Array<{ layers: Array<{ asset?: string; adjustments: { filterEffects?: Record<string, unknown> } }> }>;
    index: number;
  };
}

test('Render Clouds fills an empty layer from the drawing and background colours', async ({ page }) => {
  test.setTimeout(90_000);
  await menu(page, 'File', 'New transparent document');
  await settled(page);
  expect((await sample(page)).opaqueShare).toBe(0);

  await setColor(page, 'Drawing color', '#e08a30');
  await setColor(page, 'Background color', '#080c28');
  await menu(page, 'Filter', 'Clouds');
  await openPanel(page, 'Filters');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('clouds');
  await expect(page.getByLabel('Cloud foreground colour', { exact: true })).toHaveValue('#e08a30');
  await expect(page.getByLabel('Cloud background colour', { exact: true })).toHaveValue('#080c28');
  // A 1200×800 document defaults to 200 px clouds (a quarter of its height).
  await expect(page.getByLabel('Cloud size', { exact: true })).toHaveValue('200');
  await expect(page.getByLabel('Fill transparent pixels', { exact: true })).toBeChecked();
  await settled(page);
  await page.getByLabel('Effect amount', { exact: true }).fill('100');
  await settled(page);

  const filled = await sample(page);
  expect(filled.opaqueShare).toBe(1);
  // Colours span navy to orange, with real texture.
  expect(filled.minR).toBeLessThan(120);
  expect(filled.maxR).toBeGreaterThan(130);
  expect(filled.maxB).toBeLessThan(60);
  expect(filled.colours).toBeGreaterThan(40);

  const saved = await project(page);
  expect(saved.history[saved.index].layers.at(-1)!.adjustments.filterEffects).toMatchObject({
    type: 'clouds',
    amount: 100,
    cloudRender: { foreground: '#e08a30', background: '#080c28', scale: 200, fill: true },
  });

  // Turning fill off returns the empty layer to transparency; undo restores it.
  await page.getByLabel('Fill transparent pixels', { exact: true }).uncheck();
  await settled(page);
  expect((await sample(page)).opaqueShare).toBe(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByLabel('Fill transparent pixels', { exact: true })).toBeChecked();
  await settled(page);
  expect((await sample(page)).opaqueShare).toBe(1);
});

test('colour clouds controls persist through reload and project round trip', async ({ page }) => {
  test.setTimeout(90_000);
  await menu(page, 'File', 'New transparent document');
  await settled(page);
  await menu(page, 'Filter', 'Clouds');
  await setColor(page, 'Cloud foreground colour', '#3060ff');
  await setColor(page, 'Cloud background colour', '#000000');
  await openPanel(page, 'Filters');
  const size = page.getByLabel('Cloud size', { exact: true });
  await size.fill('1500');
  await expect(size).toHaveValue('1500');
  await page.getByLabel('Effect amount', { exact: true }).fill('100');
  await settled(page);
  const before = await sample(page);
  expect(before.maxB).toBeGreaterThan(150);
  expect(before.maxR).toBeLessThan(110);

  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await settled(page);
  await openPanel(page, 'Filters');
  await expect(page.getByLabel('Cloud foreground colour', { exact: true })).toHaveValue('#3060ff');
  await expect(page.getByLabel('Cloud size', { exact: true })).toHaveValue('1500');
  expect(await sample(page)).toEqual(before);
});

test('a large 2646×4096 canvas gets large clouds by default', async ({ page }) => {
  test.setTimeout(120_000);
  await menu(page, 'File', 'New transparent document');
  await menu(page, 'Image', 'Canvas Size…');
  await page.getByLabel('Width (px)').fill('2646');
  await page.getByLabel('Height (px)').fill('4096');
  await page.getByRole('button', { name: 'Apply canvas size', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveJSProperty('height', 4096);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await menu(page, 'Filter', 'Clouds');
  await openPanel(page, 'Filters');
  await expect(page.getByLabel('Cloud size', { exact: true })).toHaveValue('662');
  // 10.8 MP of colour clouds renders in about 3 s on a desktop CPU.
  await settled(page, 60_000);
  await page.getByLabel('Effect amount', { exact: true }).fill('100');
  await settled(page, 60_000);
  const large = await sample(page);
  expect(large.opaqueShare).toBe(1);
  expect(large.colours).toBeGreaterThan(40);
});
