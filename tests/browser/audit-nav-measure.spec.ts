import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';

// Audit fixes I-03 Eyedropper, I-04 Color Sampler, I-05 Ruler, I-06 Note,
// I-07 Audio Annotation header, I-08 Count and B-07 Quick Mask label.
// Contract: docs/navigation-tool-options-contract.md.

type Measurement = { id: string; kind: string; [key: string]: unknown };
type Layer = { id: string; matrix: number[] };

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const canvasBox = async (page: Page) => {
  const canvas = page.getByTestId('editor-canvas');
  await canvas.scrollIntoViewIfNeeded();
  return (await canvas.boundingBox())!;
};
/** Client point for an image-pixel position. */
const toClient = async (page: Page, x: number, y: number) => {
  const box = await canvasBox(page);
  const size = await page.getByTestId('editor-canvas').evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height }));
  return { x: box.x + ((x + 0.5) / size.w) * box.width, y: box.y + ((y + 0.5) / size.h) * box.height };
};
const imageSize = (page: Page) =>
  page.getByTestId('editor-canvas').evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height }));
const pixelAverage = (page: Page, x: number, y: number, size: number) =>
  page.getByTestId('editor-canvas').evaluate(
    (c: HTMLCanvasElement, [px, py, edge]) => {
      const half = Math.floor(edge / 2);
      const data = c.getContext('2d')!.getImageData(px - half, py - half, edge, edge).data;
      let r = 0, g = 0, b = 0, a = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i] * data[i + 3];
        g += data[i + 1] * data[i + 3];
        b += data[i + 2] * data[i + 3];
        a += data[i + 3];
      }
      const hex = (v: number) => Math.round(v / a).toString(16).padStart(2, '0');
      return `#${hex(r)}${hex(g)}${hex(b)}`;
    },
    [x, y, size],
  );
async function project(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return (await downloadedProject((await download.path())!)) as {
    history: Array<{ measurements?: Measurement[]; layers: Layer[]; active: string }>;
    index: number;
  };
}
const undo = async (page: Page) => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
};

test('Eyedropper: sample size averages, Sample source and Alt-click background', async ({ page }) => {
  await selectTool(page, 'Eyedropper');
  const options = page.getByTestId('eyedropper-options');
  await expect(options.getByRole('combobox', { name: 'Sample size' })).toHaveValue('1');
  await expect(options.getByRole('combobox', { name: 'Eyedropper sample' })).toHaveValue('all');
  const { w, h } = await imageSize(page);
  // Pick a point on an edge-rich area: the centre row, a third across.
  const x = Math.floor(w / 3), y = Math.floor(h / 2);
  const point = await toClient(page, x, y);
  await page.mouse.click(point.x, point.y);
  await expect(page.getByLabel('Drawing color')).toHaveValue(await pixelAverage(page, x, y, 1));

  await options.getByRole('combobox', { name: 'Sample size' }).selectOption('11');
  const averaged = await pixelAverage(page, x, y, 11);
  const again = await toClient(page, x, y);
  await page.mouse.click(again.x, again.y);
  await expect(page.getByText('Color sampled from image (11 × 11 average)')).toBeVisible();
  await expect(page.getByLabel('Drawing color')).toHaveValue(averaged);

  // Alt-click sets the background colour and leaves the foreground alone.
  await options.getByRole('combobox', { name: 'Sample size' }).selectOption('1');
  const fx = Math.floor(w * 0.8), fy = Math.floor(h * 0.2);
  const alt = await toClient(page, fx, fy);
  await page.keyboard.down('Alt');
  await page.mouse.click(alt.x, alt.y);
  await page.keyboard.up('Alt');
  await expect(page.getByLabel('Background color')).toHaveValue(await pixelAverage(page, fx, fy, 1));
  await expect(page.getByLabel('Drawing color')).toHaveValue(averaged);

  // Current Layer samples the active layer's own pixels.
  await options.getByRole('combobox', { name: 'Eyedropper sample' }).selectOption('current');
  const current = await toClient(page, x, y);
  await page.mouse.click(current.x, current.y);
  await expect(page.getByText(/^Color sampled from current layer|^Sample: Current Layer needs a raster layer/)).toBeVisible();
});

test('Color Sampler lists every sampler with live values, deletes one and clears all (undoable)', async ({ page }) => {
  await selectTool(page, 'Color Sampler');
  const { w, h } = await imageSize(page);
  for (const [fx, fy] of [[0.25, 0.3], [0.7, 0.6], [0.5, 0.8]]) {
    const at = await toClient(page, Math.floor(w * fx), Math.floor(h * fy));
    await page.mouse.click(at.x, at.y);
  }
  const rows = page.getByTestId('color-sampler-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText(/R \d+ G \d+ B \d+ · #[0-9A-F]{6} · α \d+/);
  const expected = (await pixelAverage(page, Math.floor(w * 0.25), Math.floor(h * 0.3), 1)).toUpperCase();
  await expect(rows.first()).toContainText(expected);
  await page.getByRole('button', { name: 'Delete color sampler 2' }).click();
  await expect(rows).toHaveCount(2);
  await page.getByTestId('color-sampler-options').getByRole('button', { name: 'Clear All' }).click();
  await expect(rows).toHaveCount(0);
  await undo(page);
  await expect(rows).toHaveCount(2);
});

test('Ruler readout uses the Photoshop angle; Straighten Layer levels it in one undo step', async ({ page }) => {
  await selectTool(page, 'Ruler');
  const { w, h } = await imageSize(page);
  const start = await toClient(page, Math.floor(w * 0.2), Math.floor(h * 0.6));
  const end = await toClient(page, Math.floor(w * 0.6), Math.floor(h * 0.4));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
  const readout = page.getByTestId('ruler-readout');
  // Rising to the right reads positive (Photoshop convention).
  await expect(readout).toContainText(/Angle\s*\d+\.\d°/);
  await expect(readout).not.toContainText('Angle-');
  await expect(readout).toContainText(/Δy\s*-\d/);
  await expect(page.getByText(/^Ruler: [\d.]+ px · \d/)).toBeVisible();
  const before = await project(page);
  const layerBefore = before.history[before.index].layers.find((layer) => layer.id === before.history[before.index].active)!;
  await page.getByTestId('ruler-options').getByRole('button', { name: 'Straighten Layer' }).click();
  await expect(page.getByText(/^Layer straightened: rotated clockwise/)).toBeVisible();
  const after = await project(page);
  const frame = after.history[after.index];
  const layer = frame.layers.find((item) => item.id === frame.active)!;
  expect(layer.matrix).not.toEqual(layerBefore.matrix);
  expect(Math.abs(layer.matrix[1])).toBeGreaterThan(0.1);
  expect(frame.measurements?.filter((item) => item.kind === 'ruler') ?? []).toHaveLength(0);
  await undo(page);
  await expect(readout).toContainText(/Angle\s*\d+\.\d°/);
  await page.getByTestId('ruler-options').getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(readout).toContainText('—');
});

test('Note uses an in-app editor: add, open, edit, recolor, move and delete', async ({ page }) => {
  page.on('dialog', () => {
    throw new Error('Note must not open a native dialog');
  });
  await selectTool(page, 'Note');
  await expect(page.locator('[data-sidebar-section="tool-options"]')).toHaveAttribute('aria-label', 'Note options');
  const { w, h } = await imageSize(page);
  const at = await toClient(page, Math.floor(w * 0.3), Math.floor(h * 0.3));
  await page.mouse.click(at.x, at.y);
  const editor = page.getByTestId('note-editor');
  await expect(editor).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Note text' })).toBeFocused();
  await page.getByRole('textbox', { name: 'Note text' }).fill('Check the horizon');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Note added to the draft')).toBeVisible();
  const marker = page.getByTestId('note-marker');
  await expect(marker).toHaveCount(1);

  // Click the note: it opens with its text; edit and recolor it.
  const reopen = await toClient(page, Math.floor(w * 0.3), Math.floor(h * 0.3));
  await page.mouse.click(reopen.x, reopen.y);
  await expect(page.getByRole('textbox', { name: 'Note text' })).toHaveValue('Check the horizon');
  await page.getByRole('textbox', { name: 'Note text' }).fill('Horizon tilts left');
  await editor.getByLabel('Note marker color').fill('#22aaff');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Note updated')).toBeVisible();
  await expect(marker).toContainText('Horizon tilts left');
  await expect(marker.locator('circle')).toHaveAttribute('style', /34, 170, 255|#22aaff/i);

  // Drag the note to a new spot.
  const from = await toClient(page, Math.floor(w * 0.3), Math.floor(h * 0.3));
  const to = await toClient(page, Math.floor(w * 0.6), Math.floor(h * 0.5));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByText('Note moved')).toBeVisible();
  await expect(editor).toHaveCount(0);
  const moved = Number(await marker.getAttribute('data-x'));
  expect(Math.abs(moved - Math.floor(w * 0.6))).toBeLessThanOrEqual(Math.max(3, w / 100));

  // Open it at its new place and delete it; undo brings it back.
  const open = await toClient(page, Math.floor(w * 0.6), Math.floor(h * 0.5));
  await page.mouse.click(open.x, open.y);
  await editor.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Note deleted')).toBeVisible();
  await expect(marker).toHaveCount(0);
  await undo(page);
  await expect(marker).toHaveCount(1);
  const saved = await project(page);
  expect(saved.history[saved.index].measurements).toMatchObject([
    { kind: 'note', text: 'Horizon tilts left', color: '#22aaff' },
  ]);

  // Escape cancels a new note without adding anything.
  const blank = await toClient(page, Math.floor(w * 0.15), Math.floor(h * 0.8));
  await page.mouse.click(blank.x, blank.y);
  await page.getByRole('textbox', { name: 'Note text' }).press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(marker).toHaveCount(1);
});

test('Count groups carry a name and colour, label size applies and Clear count is undoable', async ({ page }) => {
  await selectTool(page, 'Count');
  const options = page.getByTestId('count-options');
  const { w, h } = await imageSize(page);
  const place = async (fx: number, fy: number) => {
    const at = await toClient(page, Math.floor(w * fx), Math.floor(h * fy));
    await page.mouse.click(at.x, at.y);
  };
  await place(0.2, 0.2);
  await place(0.3, 0.2);
  await expect(page.getByText('Count marker 2 added to Count 1')).toBeVisible();
  const name = options.getByRole('combobox', { name: 'Count group name' });
  await name.fill('Trees');
  await name.press('Enter');
  await options.getByLabel('Count group color').fill('#00aa44');
  await place(0.5, 0.5);
  await expect(page.getByText('Count marker 1 added to Trees')).toBeVisible();
  const groups = options.getByRole('list', { name: 'Count groups' });
  await expect(groups.getByRole('listitem')).toHaveCount(2);
  await expect(groups).toContainText('Count 12');
  await expect(groups).toContainText('Trees1');
  await expect(page.locator('.measurement-count[data-group="Trees"] circle')).toHaveAttribute('style', /0, 170, 68|#00aa44/i);

  const radius = () => page.locator('.measurement-count circle').first().getAttribute('r');
  const before = Number(await radius());
  await options.getByRole('slider', { name: 'Label size' }).fill('30');
  await expect.poll(async () => Number(await radius())).toBeGreaterThan(before);

  await options.getByRole('button', { name: 'Clear count' }).click();
  await expect(page.getByText('Count cleared for Trees')).toBeVisible();
  await expect(page.locator('.measurement-count')).toHaveCount(2);
  await undo(page);
  await expect(page.locator('.measurement-count')).toHaveCount(3);
  const saved = await project(page);
  expect(saved.history[saved.index].measurements).toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: 'count', group: 'Trees', color: '#00aa44', index: 1 })]),
  );
});

test('Audio Annotation options are titled with the tool name and Quick Mask label is compact', async ({ page }) => {
  await selectTool(page, 'Audio Annotation');
  const section = page.locator('[data-sidebar-section="tool-options"]');
  await expect(section).toHaveAttribute('aria-label', 'Audio Annotation options');
  await expect(section.getByRole('button', { name: 'Audio Annotation options' })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Size', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Quick Mask mode' }).first().click();
  const label = page.locator('.quick-mask-panel label').filter({ hasText: 'Reveal selection while painting' });
  await expect(label).toBeVisible();
  const fontSize = await label.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  expect(fontSize).toBeLessThanOrEqual(12);
});
