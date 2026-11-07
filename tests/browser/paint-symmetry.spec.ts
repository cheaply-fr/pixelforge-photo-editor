import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';

// Paint Symmetry repeats every Brush/Pencil/Eraser dab through mirror or
// rotational copies about an editable centre, committed as one undo step.

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  // A fresh transparent 1200 × 800 document with an empty paint layer on top.
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
});

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const settled = (page: Page) => expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
const footer = (page: Page) => page.locator('footer');
const RED = [255, 0, 0, 255];
const TRANSPARENT = [0, 0, 0, 0];

async function setColor(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).evaluate((input: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function setRange(page: Page, label: string, value: number) {
  await page.getByLabel(label, { exact: true }).evaluate((input: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(next));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** Client point for an image pixel (the canvas is scrolled back into view on phones). */
async function at(page: Page, x: number, y: number) {
  await canvas(page).scrollIntoViewIfNeeded();
  return canvas(page).evaluate((element: HTMLCanvasElement, point) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + (point.x / element.width) * rect.width, y: rect.top + (point.y / element.height) * rect.height };
  }, { x, y });
}

const pixel = (page: Page, x: number, y: number) =>
  canvas(page).evaluate((element: HTMLCanvasElement, point) =>
    Array.from(element.getContext('2d')!.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data), { x, y });

/** A cheap fingerprint of every canvas pixel. */
const canvasHash = (page: Page) =>
  canvas(page).evaluate((element: HTMLCanvasElement) => {
    const data = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    let hash = 2166136261;
    for (let index = 0; index < data.length; index += 1) hash = Math.imul(hash ^ data[index], 16777619) >>> 0;
    return hash;
  });

async function brush(page: Page, tool: 'Brush' | 'Pencil' | 'Eraser' = 'Brush', size = 20) {
  await selectTool(page, tool);
  await page.getByLabel('Size', { exact: true }).fill(String(size));
  const hardness = page.getByLabel('Hardness', { exact: true });
  if (tool !== 'Pencil' && await hardness.count()) await setRange(page, 'Hardness', 100);
  if (tool !== 'Eraser') await setColor(page, 'Drawing color', '#ff0000');
}

async function symmetry(page: Page, mode: string) {
  await page.getByLabel('Paint symmetry', { exact: true }).selectOption(mode);
}

/** Straight stroke between two image points; optionally sample the live preview before release. */
async function stroke(
  page: Page,
  from: [number, number],
  to: [number, number],
  preview?: Array<[number, number]>,
) {
  const a = await at(page, ...from), b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  let live: number[][] = [];
  if (preview) {
    await settled(page);
    live = await Promise.all(preview.map(([x, y]) => pixel(page, x, y)));
  }
  await page.mouse.up();
  await settled(page);
  await expect(footer(page)).toContainText('Paint layer updated');
  return live;
}

async function editMenu(page: Page, item: RegExp) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
  await settled(page);
}

/** Image point at `radius` from (cx, cy), `degrees` clockwise from +x. */
const polar = (cx: number, cy: number, radius: number, degrees: number): [number, number] => [
  cx + radius * Math.cos((degrees * Math.PI) / 180),
  cy + radius * Math.sin((degrees * Math.PI) / 180),
];

test('radial 8 paints eight rotated copies of one stroke, live and committed, as one undo step', async ({ page }) => {
  await brush(page);
  await symmetry(page, 'radial');
  await expect(page.getByLabel('Symmetry segments value', { exact: true })).toHaveValue('8');
  await expect(page.getByTestId('paint-symmetry-summary')).toHaveText('8 copies per dab');
  const overlay = page.getByTestId('paint-symmetry-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay.getByTestId('paint-symmetry-line')).toHaveCount(8);

  const copies = Array.from({ length: 8 }, (_, k) => polar(600, 400, 275, 45 * k));
  const gaps = Array.from({ length: 8 }, (_, k) => polar(600, 400, 275, 45 * k + 22.5));
  const live = await stroke(page, [850, 400], [900, 400], [copies[3], copies[6]]);
  expect(live[0]).toEqual(RED);
  expect(live[1]).toEqual(RED);
  for (const [k, [x, y]] of copies.entries()) expect(await pixel(page, x, y), `copy ${k}`).toEqual(RED);
  for (const [k, [x, y]] of gaps.entries()) expect(await pixel(page, x, y), `gap ${k}`).toEqual(TRANSPARENT);
  // The rotated copies keep the stroke's radial direction (ends at 250 and 300 px).
  for (const k of [2, 5]) {
    expect(await pixel(page, ...polar(600, 400, 255, 45 * k))).toEqual(RED);
    expect(await pixel(page, ...polar(600, 400, 230, 45 * k))).toEqual(TRANSPARENT);
  }

  await editMenu(page, /^Undo/);
  for (const [x, y] of copies) expect(await pixel(page, x, y)).toEqual(TRANSPARENT);
  await editMenu(page, /^Redo/);
  for (const [x, y] of copies) expect(await pixel(page, x, y)).toEqual(RED);
});

test('vertical, horizontal and dual axis mirror strokes across the centre', async ({ page }) => {
  await brush(page);
  await symmetry(page, 'vertical');
  await expect(page.getByTestId('paint-symmetry-summary')).toHaveText('2 copies per dab');
  await stroke(page, [800, 200], [900, 200]);
  expect(await pixel(page, 850, 200)).toEqual(RED);
  expect(await pixel(page, 350, 200)).toEqual(RED);
  expect(await pixel(page, 850, 600)).toEqual(TRANSPARENT);
  expect(await pixel(page, 350, 600)).toEqual(TRANSPARENT);

  await symmetry(page, 'horizontal');
  await stroke(page, [200, 150], [200, 250]);
  expect(await pixel(page, 200, 200)).toEqual(RED);
  expect(await pixel(page, 200, 600)).toEqual(RED);
  expect(await pixel(page, 1000, 200)).toEqual(TRANSPARENT);

  await symmetry(page, 'dual');
  await expect(page.getByTestId('paint-symmetry-overlay').getByTestId('paint-symmetry-line')).toHaveCount(2);
  await stroke(page, [950, 700], [1050, 700]);
  for (const [x, y] of [[1000, 700], [200, 700], [1000, 100], [200, 100]])
    expect(await pixel(page, x, y), `${x},${y}`).toEqual(RED);
});

test('the centre handle drags and nudges the symmetry centre; the eraser follows it', async ({ page }) => {
  // Paint a full-width horizontal band first, then erase symmetrically.
  await brush(page, 'Brush', 60);
  await stroke(page, [20, 300], [1180, 300]);
  expect(await pixel(page, 100, 300)).toEqual(RED);

  await brush(page, 'Eraser', 30);
  await symmetry(page, 'vertical');
  const handle = page.getByTestId('paint-symmetry-handle');
  await expect(handle).toHaveAttribute('data-center-x', '600');
  await expect(handle).toHaveAttribute('data-center-y', '400');
  await canvas(page).scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  const target = await at(page, 400, 400);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await page.mouse.up();
  const dragged = Number(await handle.getAttribute('data-center-x'));
  expect(Math.abs(dragged - 400)).toBeLessThanOrEqual(3);
  // Dragging the handle did not paint or erase anything.
  expect(await pixel(page, 400, 300)).toEqual(RED);
  // Keyboard: Shift+Arrow moves ten pixels.
  await handle.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(handle).toHaveAttribute('data-center-x', String(dragged + 10));
  await expect(page.getByLabel('Symmetry center X', { exact: true })).toHaveValue(String(dragged + 10));
  // Exact entry through the numeric field.
  await page.getByLabel('Symmetry center X', { exact: true }).fill('400');
  await expect(handle).toHaveAttribute('data-center-x', '400');

  await stroke(page, [600, 260], [600, 340]);
  expect(await pixel(page, 600, 300)).toEqual(TRANSPARENT);
  expect(await pixel(page, 200, 300)).toEqual(TRANSPARENT);
  // The old canvas-centre mirror position is untouched.
  expect(await pixel(page, 900, 300)).toEqual(RED);
  expect(await pixel(page, 100, 300)).toEqual(RED);

  await page.getByRole('button', { name: 'Reset symmetry center', exact: true }).click();
  await expect(handle).toHaveAttribute('data-center-x', '600');
});

test('symmetry copies stay confined to the active selection', async ({ page }) => {
  await selectTool(page, 'Select');
  const a = await at(page, 700, 200), b = await at(page, 1100, 600);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect(footer(page)).toContainText(/selection/i);

  await brush(page);
  await symmetry(page, 'radial');
  await page.getByLabel('Symmetry segments value', { exact: true }).fill('4');
  await expect(page.getByTestId('paint-symmetry-summary')).toHaveText('4 copies per dab');
  const outside: Array<[number, number]> = [[325, 400], [600, 675], [600, 125]];
  const live = await stroke(page, [850, 400], [900, 400], [[875, 400], ...outside]);
  expect(live[0]).toEqual(RED);
  for (const sample of live.slice(1)) expect(sample).toEqual(TRANSPARENT);
  expect(await pixel(page, 875, 400)).toEqual(RED);
  for (const [x, y] of outside) expect(await pixel(page, x, y), `${x},${y}`).toEqual(TRANSPARENT);
});

test('mandala and pencil: mirrored and rotated copies; guides can be hidden', async ({ page }) => {
  await brush(page, 'Pencil', 12);
  await symmetry(page, 'mandala');
  await page.getByLabel('Symmetry segments value', { exact: true }).fill('3');
  await expect(page.getByTestId('paint-symmetry-summary')).toHaveText('6 copies per dab');
  await expect(page.getByTestId('paint-symmetry-line')).toHaveCount(6);
  // A short radial-ish stroke at 20°: mirrors land at −20° + 120k, rotations at 20° + 120k.
  await stroke(page, polar(600, 400, 200, 20), polar(600, 400, 260, 20));
  for (const base of [20, -20])
    for (let k = 0; k < 3; k += 1)
      expect(await pixel(page, ...polar(600, 400, 230, base + 120 * k)), `${base}+${120 * k}`).toEqual(RED);
  expect(await pixel(page, ...polar(600, 400, 230, 60))).toEqual(TRANSPARENT);

  await page.getByLabel('Show symmetry guides', { exact: true }).uncheck();
  await expect(page.getByTestId('paint-symmetry-overlay')).toHaveCount(0);
});

test('turning symmetry back off paints exactly the same pixels as before', async ({ page }) => {
  await brush(page);
  await stroke(page, [700, 250], [950, 330]);
  const plain = await canvasHash(page);
  // No copy at the radial/mirror position of the stroke's midpoint.
  expect(await pixel(page, 1200 - 825, 800 - 290)).toEqual(TRANSPARENT);
  await editMenu(page, /^Undo/);
  await symmetry(page, 'radial');
  await symmetry(page, 'off');
  await expect(page.getByTestId('paint-symmetry-overlay')).toHaveCount(0);
  await stroke(page, [700, 250], [950, 330]);
  expect(await canvasHash(page)).toBe(plain);
});

test('symmetry settings survive a reload', async ({ page }) => {
  await brush(page);
  await symmetry(page, 'radial');
  await page.getByLabel('Symmetry segments value', { exact: true }).fill('6');
  await setRange(page, 'Symmetry rotation', 15);
  await page.getByLabel('Symmetry center X', { exact: true }).fill('500');
  await page.getByLabel('Symmetry center Y', { exact: true }).fill('300');
  await stroke(page, [800, 300], [850, 300]);
  await expect(page.getByText('Saved on this device')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Paint symmetry', { exact: true })).toHaveValue('radial');
  await expect(page.getByLabel('Symmetry segments value', { exact: true })).toHaveValue('6');
  await expect(page.getByLabel('Symmetry rotation', { exact: true })).toHaveValue('15');
  await expect(page.getByLabel('Symmetry center X', { exact: true })).toHaveValue('500');
  await expect(page.getByTestId('paint-symmetry-handle')).toHaveAttribute('data-center-y', '300');
  // The reloaded stroke kept its six copies (300 px from the moved centre).
  await settled(page);
  for (let k = 0; k < 6; k += 1) expect(await pixel(page, ...polar(500, 300, 325, 60 * k)), `copy ${k}`).toEqual(RED);
});
