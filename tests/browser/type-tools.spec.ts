import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

// Contract: docs/type-tools-contract.md. Runs on the desktop and mobile
// projects; every assertion reads the exported project or rendered pixels.

type Layer = Record<string, unknown> & { kind?: string; text?: string; orientation?: string };
type Project = {
  history: Array<{ layers: Layer[]; selection?: { mask?: string } }>;
  index: number;
  assets: Record<string, { url: string; w: number; h: number }>;
};
type Bounds = { x: number; y: number; width: number; height: number };

const TYPE_LABELS = ['Text', 'Vertical Type', 'Horizontal Type Mask', 'Vertical Type Mask'];
const FLYOUT_LABELS = ['Horizontal Type', 'Vertical Type', 'Horizontal Type Mask', 'Vertical Type Mask'];

const prepare = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
};

const project = async (page: Page): Promise<Project> => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as Project;
};

const newTransparent = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
};

const clickCanvas = async (page: Page) => {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  // Element-relative clicks scroll the mobile canvas before dispatching input.
  await canvas.click({ position: { x: box.width * 0.2, y: box.height * 0.2 }, force: true });
};

const settle = async (page: Page) => {
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
};

/** Opaque-pixel bounds of the rendered document canvas. */
const canvasBounds = async (page: Page): Promise<Bounds> =>
  page.getByTestId('editor-canvas').evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
    for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
      if (data[(y * canvas.width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    return right < 0 ? { x: 0, y: 0, width: 0, height: 0 } : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  });

/** Selected pixel count, bounds and a content hash for a selection mask asset. */
const maskStats = async (page: Page, asset: { url: string; w: number; h: number }) =>
  page.evaluate(async ({ asset }) => {
    const image = new Image();
    image.src = asset.url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = asset.w;
    canvas.height = asset.h;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, asset.w, asset.h).data;
    let count = 0, left = asset.w, top = asset.h, right = -1, bottom = -1;
    for (let y = 0; y < asset.h; y += 1) for (let x = 0; x < asset.w; x += 1) {
      if (data[(y * asset.w + x) * 4 + 3] === 0) continue;
      count += 1;
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    return {
      count,
      hash: data.reduce((sum, value, offset) => (sum + value * (offset + 1)) % 1000000007, 0),
      bounds: right < 0 ? { x: 0, y: 0, width: 0, height: 0 } : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 },
    };
  }, { asset });

const frameOf = (value: Project) => value.history[value.index];
const textLayers = (value: Project) => frameOf(value).layers.filter((layer) => layer.kind === 'text');

const undo = async (page: Page) => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
};

const typeMaskEntry = (page: Page) => page.getByRole('dialog', { name: /Type Mask$/ });

/** Click with the selected mask tool and commit `content` through the entry. */
const commitMask = async (page: Page, content: string, title: string) => {
  await clickCanvas(page);
  const dialog = typeMaskEntry(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await dialog.getByLabel('Type mask text', { exact: true }).fill(content);
  await dialog.getByRole('button', { name: 'Create selection', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`${title} selection created`, { exact: true })).toBeVisible();
  await settle(page);
};

// Each test downloads several project snapshots and decodes mask assets.
test.describe.configure({ timeout: 120_000 });
test.beforeEach(async ({ page }) => prepare(page));

test('T family shares one toolbar slot, an icon flyout and T / Shift+T cycling', async ({ page }) => {
  const palette = page.getByTestId('tool-palette');
  const text = palette.getByRole('button', { name: 'Text tool', exact: true });
  await expect(text.locator('.tool-subtool-arrow')).toHaveCount(1);
  await expect(text).toHaveAttribute('title', /\(T\).*press and hold/i);
  await text.focus();
  await page.keyboard.press('ArrowDown');
  const flyout = page.locator('[role="menu"]:visible');
  const items = flyout.getByRole('menuitem');
  await expect(items).toHaveCount(4);
  await expect(items.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')))).resolves.toEqual(FLYOUT_LABELS);
  const drawings = new Set<string>();
  for (const item of await items.all()) {
    await expect(item.locator('svg')).toHaveCount(1);
    await expect(item.locator('kbd')).toHaveText('T');
    drawings.add(await item.locator('svg').innerHTML());
  }
  expect(drawings.size).toBe(4);
  await flyout.getByRole('menuitem', { name: 'Vertical Type Mask', exact: true }).click();
  const masked = palette.getByRole('button', { name: 'Vertical Type Mask tool', exact: true });
  await expect(masked).toHaveAttribute('aria-pressed', 'true');
  // One slot: the chosen variant replaces the representative.
  for (const label of ['Text', 'Vertical Type', 'Horizontal Type Mask'])
    await expect(palette.getByRole('button', { name: `${label} tool`, exact: true })).toHaveCount(0);
  // The remembered variant survives reload.
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(palette.getByRole('button', { name: 'Vertical Type Mask tool', exact: true })).toBeVisible();

  await page.keyboard.press('t');
  await expect(palette.getByRole('button', { name: 'Text tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  for (const label of TYPE_LABELS.slice(1)) {
    await page.keyboard.press('t');
    await expect(palette.getByRole('button', { name: `${label} tool`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  await page.keyboard.press('t');
  await expect(palette.getByRole('button', { name: 'Text tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Shift+T');
  await expect(palette.getByRole('button', { name: 'Vertical Type Mask tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Shift+T');
  await expect(palette.getByRole('button', { name: 'Horizontal Type Mask tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // Every type variant opens the Text settings section.
  await expect(page.getByLabel('Text content', { exact: true })).toBeVisible();
});

test('Vertical Type creates an editable vertical text layer that renders taller than wide', async ({ page }) => {
  await newTransparent(page);
  await selectTool(page, 'Vertical Type');
  await page.getByLabel('Text content', { exact: true }).fill('ABCD');
  await clickCanvas(page);
  await expect(page.getByText('Editable vertical text layer added', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Text orientation', { exact: true })).toHaveValue('vertical');
  await settle(page);
  const rendered = await canvasBounds(page);
  expect(rendered.height).toBeGreaterThan(rendered.width * 2);

  let exported = await project(page);
  expect(textLayers(exported)).toHaveLength(1);
  expect(textLayers(exported)[0]).toMatchObject({ kind: 'text', text: 'ABCD', orientation: 'vertical' });
  // Placed at the clicked point (20% of the 1200×800 document), not the origin.
  const [, , , , tx, ty] = textLayers(exported)[0].matrix as number[];
  expect(Math.abs(tx - 240)).toBeLessThanOrEqual(4);
  expect(Math.abs(ty - 160)).toBeLessThanOrEqual(4);
  expect(Math.abs(rendered.x - tx)).toBeLessThanOrEqual(4);

  // The Horizontal Type tool still creates horizontal text for comparison.
  await undo(page);
  await settle(page);
  exported = await project(page);
  expect(textLayers(exported)).toHaveLength(0);
  await selectTool(page, 'Text');
  await clickCanvas(page);
  await expect(page.getByLabel('Text orientation', { exact: true })).toHaveValue('horizontal');
  await settle(page);
  const horizontal = await canvasBounds(page);
  expect(horizontal.width).toBeGreaterThan(horizontal.height);
});

test('Horizontal Type Mask turns typed text into a glyph selection without adding a layer', async ({ page }) => {
  await newTransparent(page);
  const before = await project(page);
  const layerIds = frameOf(before).layers.map((layer) => layer.id);
  expect(frameOf(before).selection).toBeUndefined();

  await selectTool(page, 'Horizontal Type Mask');
  await expect(page.getByLabel('Text content', { exact: true })).toBeVisible();
  await commitMask(page, 'ABCD', 'Horizontal Type Mask');
  let exported = await project(page);
  expect(frameOf(exported).layers.map((layer) => layer.id)).toEqual(layerIds);
  expect(textLayers(exported)).toHaveLength(0);
  const mask = frameOf(exported).selection?.mask;
  expect(mask).toBeTruthy();
  const horizontal = await maskStats(page, exported.assets[mask!]);
  expect(horizontal.count).toBeGreaterThan(50);
  expect(horizontal.bounds.width).toBeGreaterThan(horizontal.bounds.height);

  // Undo removes only the selection.
  await undo(page);
  await settle(page);
  exported = await project(page);
  expect(frameOf(exported).selection).toBeUndefined();
  expect(frameOf(exported).layers.map((layer) => layer.id)).toEqual(layerIds);

  // The selection matches the glyphs the Text tool renders at the same point
  // with the same font settings.
  await selectTool(page, 'Text');
  await page.getByLabel('Text content', { exact: true }).fill('ABCD');
  await clickCanvas(page);
  await settle(page);
  const glyphs = await canvasBounds(page);
  for (const key of ['x', 'y', 'width', 'height'] as const)
    expect(Math.abs(horizontal.bounds[key] - glyphs[key])).toBeLessThanOrEqual(2);
});

test('Vertical Type Mask selects a tall column, honours selection modes and cancel keeps the selection', async ({ page }) => {
  await newTransparent(page);
  await selectTool(page, 'Vertical Type Mask');
  await commitMask(page, 'ABCD', 'Vertical Type Mask');
  let exported = await project(page);
  expect(textLayers(exported)).toHaveLength(0);
  const vertical = await maskStats(page, exported.assets[frameOf(exported).selection!.mask!]);
  expect(vertical.count).toBeGreaterThan(50);
  expect(vertical.bounds.height).toBeGreaterThan(vertical.bounds.width * 2);
  const historyLength = exported.history.length;

  // Cancel (button and Escape) leaves the selection and history untouched.
  await clickCanvas(page);
  await expect(typeMaskEntry(page)).toBeVisible();
  await typeMaskEntry(page).getByLabel('Type mask text', { exact: true }).fill('ZZZZ');
  await typeMaskEntry(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(typeMaskEntry(page)).toBeHidden();
  await expect(page.getByText('Type Mask cancelled; selection unchanged', { exact: true })).toBeVisible();
  await clickCanvas(page);
  await expect(typeMaskEntry(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(typeMaskEntry(page)).toBeHidden();
  exported = await project(page);
  expect(exported.history).toHaveLength(historyLength);
  expect((await maskStats(page, exported.assets[frameOf(exported).selection!.mask!])).hash).toBe(vertical.hash);

  // Blank text cannot be committed.
  await clickCanvas(page);
  await typeMaskEntry(page).getByLabel('Type mask text', { exact: true }).fill('   ');
  await expect(typeMaskEntry(page).getByRole('button', { name: 'Create selection', exact: true })).toBeDisabled();
  await expect(typeMaskEntry(page).getByRole('alert')).toHaveText('Type some text for the mask');
  await typeMaskEntry(page).getByRole('button', { name: 'Cancel', exact: true }).click();

  // Subtract the same glyphs with Ctrl+Enter commit: nothing remains selected
  // from the column except antialiasing residue.
  await page.getByLabel('Selection mode', { exact: true }).selectOption('subtract');
  await clickCanvas(page);
  await typeMaskEntry(page).getByLabel('Type mask text', { exact: true }).fill('AB');
  await page.keyboard.press('Control+Enter');
  await expect(typeMaskEntry(page)).toBeHidden();
  await settle(page);
  exported = await project(page);
  const subtracted = await maskStats(page, exported.assets[frameOf(exported).selection!.mask!]);
  expect(subtracted.count).toBeLessThan(vertical.count);
  expect(subtracted.count).toBeGreaterThan(0);
  expect(textLayers(exported)).toHaveLength(0);

  await undo(page);
  await settle(page);
  exported = await project(page);
  expect((await maskStats(page, exported.assets[frameOf(exported).selection!.mask!])).hash).toBe(vertical.hash);
});
