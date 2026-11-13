import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';

/*
 * Edit > Fill… Pattern contents (docs/edit-fill-contract.md): a repeating
 * Pattern Stamp pattern, coloured from the foreground/background wells, fills
 * only the selection and is one undoable history step. Runs on desktop and
 * mobile (touch) projects.
 */

const WHITE = [255, 255, 255, 255];
const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];
const canvas = (page: Page) => page.getByTestId('editor-canvas');
const footer = (page: Page) => page.locator('footer');
const settled = (page: Page) =>
  expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });

async function newDocument(page: Page, width: number, height: number) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('New document width (px)').fill(String(width));
  await dialog.getByLabel('New document height (px)').fill(String(height));
  await dialog.getByLabel('Background contents').selectOption('white');
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(canvas(page)).toHaveJSProperty('width', width);
  await settled(page);
}

async function setColor(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).evaluate((input: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** Rendered RGBA at document pixel coordinates (the canvas is document-sized). */
async function pixels(page: Page, points: Array<[number, number]>) {
  await settled(page);
  return canvas(page).evaluate(
    (element: HTMLCanvasElement, list) =>
      list.map(([x, y]) => Array.from(element.getContext('2d')!.getImageData(x, y, 1, 1).data)),
    points,
  );
}

async function menu(page: Page, name: string, item: string | RegExp) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', typeof item === 'string' ? { name: item, exact: true } : { name: item }).click();
}

/** A rectangular marquee drag in document coordinates (mouse or touch pointer). */
async function marquee(page: Page, kind: string, x0: number, y0: number, x1: number, y1: number) {
  await selectTool(page, 'Select');
  await canvas(page).scrollIntoViewIfNeeded();
  await canvas(page).evaluate(
    (element: HTMLCanvasElement, { kind, path }) => {
      element.setPointerCapture = () => undefined;
      const rect = element.getBoundingClientRect();
      path.forEach(([x, y], index) => {
        const type = index === 0 ? 'pointerdown' : index === path.length - 1 ? 'pointerup' : 'pointermove';
        element.dispatchEvent(new PointerEvent(type, {
          pointerId: 41,
          pointerType: kind,
          isPrimary: true,
          bubbles: true,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          pressure: type === 'pointerup' ? 0 : 0.5,
          clientX: rect.left + ((x + 0.5) / element.width) * rect.width,
          clientY: rect.top + ((y + 0.5) / element.height) * rect.height,
        }));
      });
    },
    { kind, path: [[x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2], [x1, y1], [x1, y1]] },
  );
  await expect(footer(page)).toContainText(/selection created/i);
}

async function undo(page: Page) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).first().click();
}

const same = (a: number[], b: number[]) => a.every((value, index) => Math.abs(value - b[index]) <= 2);

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

test('Edit > Fill… Pattern fills a mesh inside the selection only and undoes in one step', async ({ page }, testInfo) => {
  const kind = testInfo.project.name === 'mobile' ? 'touch' : 'mouse';
  await newDocument(page, 200, 100);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await setColor(page, 'Drawing color', '#ff0000');
  await setColor(page, 'Background color', '#0000ff');
  await marquee(page, kind, 40, 20, 120, 80);

  await menu(page, 'Edit', /^Fill…/);
  const dialog = page.getByRole('dialog', { name: 'Fill' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Fill the selection');
  await dialog.getByLabel('Fill contents').selectOption('pattern');
  // The Pattern menu offers the Pattern Stamp patterns, including the new mesh.
  const patternSelect = dialog.getByLabel('Fill pattern', { exact: true });
  await expect(patternSelect.locator('option')).toHaveText(['Checker', 'Stripes', 'Dots', 'Grid', 'Diagonal', 'Mesh']);
  await patternSelect.selectOption('mesh');
  const tile = dialog.getByLabel('Fill pattern tile size (px)');
  // Tile sizes outside the Pattern Stamp range are refused, not clamped.
  await tile.fill('3');
  await expect(dialog.getByRole('button', { name: 'Fill', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('alert')).toContainText('tile size from 4 to 128');
  await tile.fill('16');
  await expect(dialog.getByRole('button', { name: 'Fill', exact: true })).toBeEnabled();
  await expect(dialog.getByLabel('Transparent background (lines only)')).toBeChecked();
  await expect(dialog.getByTestId('edit-fill-pattern-preview')).toBeVisible();
  await expect(dialog).toContainText('Foreground #ff0000 on transparent');
  // The dialog fits the viewport on both desktop and the phone profile.
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await dialog.getByRole('button', { name: 'Fill', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(footer(page)).toContainText('Selection filled');

  // Mesh lines (16 px tile from the layer origin) are red inside the
  // selection; the diamond gaps stay transparent so the white page shows.
  // (48,48) and (64,48) lie on the lattice lines; (56,48) and (48,40) are gaps.
  const inside = await pixels(page, [[48, 48], [64, 48], [56, 48], [48, 40]]);
  expect(same(inside[0], RED)).toBe(true);
  expect(same(inside[1], RED)).toBe(true);
  expect(same(inside[2], WHITE)).toBe(true);
  expect(same(inside[3], WHITE)).toBe(true);
  // Outside the selection nothing changes, even on lattice positions.
  const outside = await pixels(page, [[16, 16], [32, 32], [144, 48], [160, 64], [96, 96], [32, 90]]);
  for (const pixel of outside) expect(pixel).toEqual(WHITE);

  // Opaque background: gaps take the background colour (Pattern Stamp colours).
  await menu(page, 'Edit', /^Fill…/);
  await dialog.getByLabel('Fill contents').selectOption('pattern');
  await dialog.getByLabel('Fill pattern', { exact: true }).selectOption('mesh');
  await dialog.getByLabel('Fill pattern tile size (px)').fill('16');
  await dialog.getByLabel('Transparent background (lines only)').uncheck();
  await expect(dialog).toContainText('Foreground #ff0000 on #0000ff');
  await dialog.getByRole('button', { name: 'Fill', exact: true }).click();
  await expect(footer(page)).toContainText('Selection filled');
  const [line, gap, out] = await pixels(page, [[48, 48], [56, 48], [144, 48]]);
  expect(same(line, RED)).toBe(true);
  expect(same(gap, BLUE)).toBe(true);
  expect(out).toEqual(WHITE);

  // Each pattern fill is one history step.
  await undo(page);
  const [lineBack, gapBack] = await pixels(page, [[48, 48], [56, 48]]);
  expect(same(lineBack, RED)).toBe(true);
  expect(same(gapBack, WHITE)).toBe(true);
  await undo(page);
  const cleared = await pixels(page, [[48, 48], [64, 48], [56, 48], [144, 48]]);
  for (const pixel of cleared) expect(pixel).toEqual(WHITE);
});

test('a Fill pattern respects a feathered selection edge', async ({ page }, testInfo) => {
  const kind = testInfo.project.name === 'mobile' ? 'touch' : 'mouse';
  await newDocument(page, 200, 100);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await setColor(page, 'Drawing color', '#ff0000');
  await setColor(page, 'Background color', '#0000ff');
  await selectTool(page, 'Select');
  const feather = page.getByTestId('marquee-options').getByLabel('Feather (new selections)', { exact: true });
  await feather.fill('8');
  await marquee(page, kind, 40, 20, 160, 80);

  await menu(page, 'Edit', /^Fill…/);
  const dialog = page.getByRole('dialog', { name: 'Fill' });
  await dialog.getByLabel('Fill contents').selectOption('pattern');
  await dialog.getByLabel('Fill pattern', { exact: true }).selectOption('checker');
  await dialog.getByLabel('Fill pattern tile size (px)').fill('8');
  await dialog.getByLabel('Transparent background (lines only)').uncheck();
  await dialog.getByRole('button', { name: 'Fill', exact: true }).click();
  await expect(footer(page)).toContainText('Selection filled');

  // Deep inside: the full opaque checker (red at (96,48), blue at (100,48)).
  // At the feathered edge the pattern is partially blended over white; well
  // outside nothing changes.
  const [red, blue, edge, outside] = await pixels(page, [[96, 48], [100, 48], [40, 48], [8, 48]]);
  expect(same(red, RED)).toBe(true);
  expect(same(blue, BLUE)).toBe(true);
  expect(edge).not.toEqual(WHITE);
  expect(same(edge, RED) || same(edge, BLUE)).toBe(false);
  expect(outside).toEqual(WHITE);
});
