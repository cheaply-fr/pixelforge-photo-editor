import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

type ProjectLayer = {
  id: string;
  name: string;
  kind: string;
  clippingTo?: string;
  smartFilters?: unknown[];
  opacity: number;
};
type Project = { history: Array<{ layers: ProjectLayer[] }>; index: number };

async function project(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const out = (await downloadedProject((await (await pending).path())!)) as Project;
  return out.history[out.index];
}

const settled = (page: Page) =>
  expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');

async function menu(page: Page, name: string, item: string | RegExp) {
  await page.getByRole('button', { name, exact: true }).click();
  await page
    .getByRole('menuitem', typeof item === 'string' ? { name: item, exact: true } : { name: item })
    .click();
}

const row = (page: Page, name: string) =>
  page.getByRole('button', { name: `Select layer ${name}`, exact: true });

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );
});

/** A closed square path covering the middle of the canvas: the clipping base. */
async function addClosedBase(page: Page) {
  await selectTool(page, 'Pen');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  for (const [x, y] of [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.75, 0.75],
    [0.25, 0.75],
    [0.25, 0.25],
  ])
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await expect(page.locator('footer')).toContainText('Editable path layer added', {
    timeout: 10000,
  });
}

/** Rename the active layer through the Layers panel name field. */
async function rename(page: Page, name: string) {
  const field = page.getByLabel('Layer name', { exact: true });
  await field.fill(name);
  await expect(row(page, name)).toBeVisible();
}

/** Bottom to top: Background, Figure (path base), Figure shade (clipped to Figure). */
async function clippingGroup(page: Page) {
  await addClosedBase(page);
  await rename(page, 'Figure');
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await rename(page, 'Figure shade');
  await page.getByRole('button', { name: 'Create clipping mask', exact: true }).click();
  await expect(page.getByText(/Clipping mask created/)).toBeVisible();
  await settled(page);
}

const sample = (page: Page) =>
  page.getByTestId('editor-canvas').evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext('2d')!;
    const at = (x: number, y: number) =>
      Array.from(
        context.getImageData(Math.round(element.width * x), Math.round(element.height * y), 1, 1)
          .data,
      );
    return { outside: at(0.08, 0.5), inside: at(0.5, 0.5) };
  });

test('Rasterize keeps the clipping mask of a clipped layer with a Clouds + Emboss filter stack', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await clippingGroup(page);
  const before = await sample(page);
  // Clouds then Emboss, each converted into the Smart Filter stack.
  await menu(page, 'Filter', 'Clouds');
  await settled(page);
  await menu(page, 'Filter', 'Convert for Smart Filters');
  await expect(page.getByText(/Smart Filter stack now contains 1 effect/)).toBeVisible();
  await menu(page, 'Filter', 'Emboss…');
  await settled(page);
  await menu(page, 'Filter', 'Convert for Smart Filters');
  await expect(page.getByText(/Smart Filter stack now contains 2 effects/)).toBeVisible();
  await settled(page);
  const filtered = await sample(page);
  // The clipped texture only shows inside the base.
  expect(filtered.outside).toEqual(before.outside);
  expect(filtered.inside).not.toEqual(before.inside);
  const stacked = (await project(page)).layers.at(-1)!;
  expect(stacked.smartFilters).toHaveLength(2);

  await menu(page, 'Layer', 'Rasterize');
  await expect(page.getByText(/^Layer rasterized/)).toBeVisible();
  await settled(page);

  await expect(page.getByRole('button', { name: 'Release clipping mask', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Create clipping mask', exact: true })).toBeDisabled();
  await expect(row(page, 'Figure shade')).toHaveAccessibleDescription('Clipped to Figure');
  const rasterized = await sample(page);
  expect(rasterized.outside).toEqual(before.outside);
  expect(rasterized.inside).toEqual(filtered.inside);
  const frame = await project(page);
  const [figure, shade] = frame.layers.slice(-2);
  expect(shade).toMatchObject({ name: 'Figure shade', kind: 'raster', clippingTo: figure.id });
  expect(shade.smartFilters ?? []).toHaveLength(0);

  // Undo restores the editable filter stack with the clipping link.
  await menu(page, 'Edit', /^Undo/);
  await settled(page);
  const undone = (await project(page)).layers.at(-1)!;
  expect(undone.smartFilters).toHaveLength(2);
  expect(undone.clippingTo).toBe(figure.id);

  // Reload keeps the rasterized clipping relationship.
  await menu(page, 'Edit', /^Redo/);
  await settled(page);
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await settled(page);
  expect((await project(page)).layers.at(-1)!.clippingTo).toBe(figure.id);
  expect((await sample(page)).outside).toEqual(before.outside);
});

/** Clip the active layer to the layer below unless it was added clipped already. */
async function clipIfNeeded(page: Page) {
  const create = page.getByRole('button', { name: 'Create clipping mask', exact: true });
  const release = page.getByRole('button', { name: 'Release clipping mask', exact: true });
  await expect(release).toBeVisible();
  if (await create.isEnabled()) {
    await create.click();
    await expect(page.getByText(/Clipping mask created/)).toBeVisible();
  }
  await expect(release).toBeEnabled();
}

/** Release the active layer's clipping if it was added inside a group. */
async function unclipIfNeeded(page: Page) {
  const create = page.getByRole('button', { name: 'Create clipping mask', exact: true });
  const release = page.getByRole('button', { name: 'Release clipping mask', exact: true });
  await expect(release).toBeVisible();
  if (await release.isEnabled()) await release.click();
  await expect(create).toBeEnabled();
}

test('Layers panel indents clipped rows with an accessible "Clipped to" description', async ({
  page,
}) => {
  await clippingGroup(page);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await rename(page, 'Highlight');
  await clipIfNeeded(page);

  const shade = row(page, 'Figure shade'),
    highlight = row(page, 'Highlight'),
    figure = row(page, 'Figure');
  // Accessible names are unchanged; the group base is the description.
  await expect(shade).toHaveAccessibleDescription('Clipped to Figure');
  await expect(highlight).toHaveAccessibleDescription('Clipped to Figure');
  await expect(figure).toHaveAccessibleDescription('');
  await expect(shade).toHaveAttribute('data-clipped', 'true');
  await expect(figure).not.toHaveAttribute('data-clipped', 'true');
  await expect(shade.locator('.layer-clip-glyph')).toHaveText('↳');
  await expect(shade.locator('.layer-clip-glyph')).toHaveAttribute('aria-hidden', 'true');

  await shade.scrollIntoViewIfNeeded();
  const [shadeBox, figureBox] = [(await shade.boundingBox())!, (await figure.boundingBox())!];
  expect(shadeBox.x).toBeGreaterThan(figureBox.x + 8);
  // Indentation never overflows the panel (compact mobile layout included).
  expect(shadeBox.x + shadeBox.width).toBeLessThanOrEqual(figureBox.x + figureBox.width + 1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Releasing removes the indicator; undo restores it.
  await highlight.click();
  await page.getByRole('button', { name: 'Release clipping mask', exact: true }).click();
  await expect(highlight).not.toHaveAttribute('data-clipped', 'true');
  await expect(highlight).toHaveAccessibleDescription('');
  await menu(page, 'Edit', /^Undo/);
  await expect(highlight).toHaveAccessibleDescription('Clipped to Figure');
});

test('Send Backward / Bring Forward move an outside layer past the whole clipping group', async ({
  page,
}) => {
  await clippingGroup(page);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await rename(page, 'X');
  // X must sit outside the group. A new layer added above a clipped layer
  // may join the group, so release X if it did.
  await unclipIfNeeded(page);
  const names = async () => (await project(page)).layers.map((layer) => layer.name);
  const clipped = async () => {
    const layers = (await project(page)).layers;
    return layers.find((layer) => layer.name === 'Figure shade')!.clippingTo ===
      layers.find((layer) => layer.name === 'Figure')!.id;
  };
  const start = await names();
  expect(start.slice(-3)).toEqual(['Figure', 'Figure shade', 'X']);

  await menu(page, 'Layer', 'Send Backward');
  await expect(page.locator('footer')).toContainText('Send Backward applied');
  await expect(page.locator('footer')).not.toContainText('released');
  expect((await names()).slice(-3)).toEqual(['X', 'Figure', 'Figure shade']);
  expect(await clipped()).toBe(true);
  await expect(row(page, 'Figure shade')).toHaveAccessibleDescription('Clipped to Figure');

  await menu(page, 'Layer', 'Bring Forward');
  await expect(page.locator('footer')).toContainText('Bring Forward applied');
  expect(await names()).toEqual(start);
  expect(await clipped()).toBe(true);

  // Panel Lower / Raise buttons step past the whole group too.
  await page.getByRole('button', { name: 'Lower layer', exact: true }).click();
  await expect.poll(async () => (await names()).slice(-3)).toEqual(['X', 'Figure', 'Figure shade']);
  expect(await clipped()).toBe(true);
  await page.getByRole('button', { name: 'Raise layer', exact: true }).click();
  await expect.poll(names).toEqual(start);
  expect(await clipped()).toBe(true);

  // Send to Back / Bring to Front never release the group either.
  await menu(page, 'Layer', 'Send to Back');
  await expect(page.locator('footer')).toContainText('Send to Back applied');
  await expect(page.locator('footer')).not.toContainText('released');
  expect((await names())[0]).toBe('X');
  expect(await clipped()).toBe(true);

  // Undo restores the exact order and links.
  await menu(page, 'Edit', /^Undo/);
  await expect.poll(names).toEqual(start);
  expect(await clipped()).toBe(true);
});

test('Merge Layers of a base and its first clipped layer keeps the rest of the group clipped', async ({
  page,
}) => {
  await clippingGroup(page);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await rename(page, 'Highlight');
  await clipIfNeeded(page);
  await row(page, 'Figure shade').click();
  await menu(page, 'Layer', 'Merge Layers');
  await expect(page.locator('footer')).toContainText('Layers merged');
  const layers = (await project(page)).layers;
  const merged = layers.at(-2)!, highlight = layers.at(-1)!;
  expect(merged.name).toBe('Figure + Figure shade');
  expect(highlight).toMatchObject({ name: 'Highlight', clippingTo: merged.id });
  await expect(row(page, 'Highlight')).toHaveAccessibleDescription('Clipped to Figure + Figure shade');
  await menu(page, 'Edit', /^Undo/);
  await expect(row(page, 'Highlight')).toHaveAccessibleDescription('Clipped to Figure');
});

test('arranging a clipping base moves its clipped layers with it', async ({ page }) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await rename(page, 'Y');
  await clippingGroup(page);
  await row(page, 'Figure').click();
  const names = async () => (await project(page)).layers.map((layer) => layer.name);
  const start = await names();
  expect(start.slice(-3)).toEqual(['Y', 'Figure', 'Figure shade']);
  await menu(page, 'Layer', 'Send Backward');
  await expect(page.locator('footer')).toContainText('Send Backward applied');
  await expect(page.locator('footer')).not.toContainText('released');
  expect((await names()).slice(-3)).toEqual(['Figure', 'Figure shade', 'Y']);
  await expect(row(page, 'Figure shade')).toHaveAccessibleDescription('Clipped to Figure');
  await menu(page, 'Edit', /^Undo/);
  await expect.poll(names).toEqual(start);
});
