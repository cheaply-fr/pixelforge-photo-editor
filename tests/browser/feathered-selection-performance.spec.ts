import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

// Feathered selections on a large document render only the padded selection
// bounds (docs/selection-feather-contract.md, "Large documents"). A soft
// ellipse on a 2646 × 4096 canvas must feather, outline and mask promptly and
// keep the same Gaussian edge.

const W = 2646, H = 4096;
type Geometry = { x: number; y: number; w: number; h: number; feather: number; inverted: boolean };

type Project = {
  history: Array<{ w: number; h: number; layers: Array<{ mask?: string }>; selection?: Geometry & { mask?: string }; previousSelection?: Geometry }>;
  index: number;
  assets: Record<string, { url: string; w: number; h: number }>;
};

const settled = (page: Page) =>
  expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });

const prepare = async (page: Page) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Canvas Size…', exact: true }).click();
  await page.getByLabel('Width (px)').fill(String(W));
  await page.getByLabel('Height (px)').fill(String(H));
  await page.getByRole('button', { name: 'Apply canvas size', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveJSProperty('width', W);
  await settled(page);
};

const project = async (page: Page): Promise<Project> => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return (await downloadedProject((await (await pending).path())!)) as Project;
};

const drag = async (page: Page, start: [number, number], end: [number, number]) => {
  const canvas = page.getByTestId('editor-canvas');
  await canvas.scrollIntoViewIfNeeded();
  // Fractions of the canvas area that is actually on screen: at 2646 × 4096
  // the canvas can extend past the viewport.
  const rect = (await canvas.boundingBox())!, viewport = page.viewportSize()!;
  const left = Math.max(rect.x, 0), top = Math.max(rect.y, 0);
  const box = {
    x: left,
    y: top,
    width: Math.min(rect.x + rect.width, viewport.width) - left,
    height: Math.min(rect.y + rect.height, viewport.height) - top,
  };
  await page.mouse.move(box.x + box.width * start[0], box.y + box.height * start[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * end[0], box.y + box.height * end[1], { steps: 6 });
  await page.mouse.up();
  await settled(page);
};

/** Apply Select > Modify > Feather and return ms until the marching ants of the feathered selection show. */
const feather = async (page: Page, value: number) => {
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Feather…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Feather Selection' });
  await page.getByLabel('Selection feather radius (px)', { exact: true }).fill(String(value));
  const outline = page.getByTestId('selection-outline');
  const started = Date.now();
  await dialog.getByRole('button', { name: 'Apply feather', exact: true }).click();
  await expect(page.getByText(`Selection feather set to ${value} px`, { exact: true })).toBeVisible();
  await expect(outline).toBeVisible({ timeout: 60_000 });
  await settled(page);
  return Date.now() - started;
};

/** Alpha of the mask along its middle row and at the four corners. */
const maskProfile = (page: Page, asset: { url: string; w: number; h: number }, row: number) =>
  page.evaluate(async ({ asset, row }) => {
    const image = new Image();
    image.src = asset.url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = asset.w;
    canvas.height = asset.h;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const line = context.getImageData(0, row, asset.w, 1).data, alpha: number[] = [];
    for (let offset = 3; offset < line.length; offset += 4) alpha.push(line[offset]);
    const corner = (x: number, y: number) => context.getImageData(x, y, 1, 1).data[3];
    return {
      alpha,
      corners: [corner(0, 0), corner(asset.w - 1, 0), corner(0, asset.h - 1), corner(asset.w - 1, asset.h - 1)],
    };
  }, { asset, row });

test.beforeEach(async ({ page }) => prepare(page));

test('a feathered ellipse on a 2646 × 4096 document renders promptly with a soft Gaussian edge', async ({ page }) => {
  test.slow();
  await selectTool(page, 'Elliptical Marquee');
  const timings: Record<string, number> = {};
  let started = Date.now();
  await drag(page, [0.3, 0.3], [0.7, 0.7]);
  await expect(page.getByTestId('selection-outline')).toBeVisible({ timeout: 60_000 });
  timings.select = Date.now() - started;

  // Paint inside the soft selection: each stroke samples the feathered mask.
  const stroke = async () => {
    await selectTool(page, 'Brush');
    const begun = Date.now();
    await drag(page, [0.42, 0.49], [0.58, 0.51]);
    const elapsed = Date.now() - begun;
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Undo/ }).click();
    await settled(page);
    return elapsed;
  };
  // Below 16 px the exact fractional feather runs in script, so it gains most.
  timings.feather8 = await feather(page, 8);
  timings.stroke8 = await stroke();
  timings.feather40 = await feather(page, 40);
  timings.stroke40 = await stroke();
  started = Date.now();
  await page.getByRole('button', { name: 'Mask from selection', exact: true }).click();
  await settled(page);
  timings.mask40 = Date.now() - started;

  let saved = await project(page), frame = saved.history[saved.index];
  expect(frame.w).toBe(W);
  expect(frame.layers[0].mask).toBeTruthy();
  const geometry = frame.previousSelection!;
  expect(geometry).toMatchObject({ feather: 40, inverted: false });
  const row = Math.round(geometry.y + geometry.h / 2), centre = Math.round(geometry.x + geometry.w / 2),
    outside = Math.max(0, Math.round(geometry.x - 4 * 40));
  let { alpha, corners } = await maskProfile(page, saved.assets[frame.layers[0].mask!], row);
  expect(alpha).toHaveLength(W);
  expect(alpha[centre], JSON.stringify(geometry)).toBeGreaterThan(240);
  expect(corners).toEqual([0, 0, 0, 0]);
  // Gaussian ramp: far outside is clear, and the edge spans many pixels.
  expect(alpha[outside]).toBe(0);
  const soft = alpha.filter((value) => value > 0 && value < 255).length;
  expect(soft).toBeGreaterThan(2 * 2 * 40);
  // The ramp is monotonic from the left edge to the centre.
  for (let x = outside; x < centre; x += 1) expect(alpha[x + 1]).toBeGreaterThanOrEqual(alpha[x]);

  // Inverse keeps the soft edge and selects everything outside the bounds.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await settled(page);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Inverse/ }).click();
  await expect(page.getByTestId('selection-outline')).toBeVisible({ timeout: 60_000 });
  timings.feather200 = await feather(page, 200);
  started = Date.now();
  await page.getByRole('button', { name: 'Mask from selection', exact: true }).click();
  await settled(page);
  timings.mask200Inverted = Date.now() - started;
  saved = await project(page);
  frame = saved.history[saved.index];
  expect(frame.previousSelection).toMatchObject({ feather: 200, inverted: true });
  ({ alpha, corners } = await maskProfile(page, saved.assets[frame.layers[0].mask!], row));
  expect(corners).toEqual([255, 255, 255, 255]);
  expect(alpha[0]).toBe(255);
  expect(alpha[centre]).toBeLessThan(255);
  for (let x = 0; x < centre; x += 1) expect(alpha[x + 1]).toBeLessThanOrEqual(alpha[x]);

  console.log(`feathered selection timings (${test.info().project.name}): ${JSON.stringify(timings)}`);
  // Before bounded rendering each step re-blurred the whole 10.8 MP canvas;
  // the bounds are generous so slower CI runners stay green.
  for (const [step, ms] of Object.entries(timings)) expect(ms, step).toBeLessThan(6_000);
});

test('repeated feathered Adds store a resolved mask and leave earlier edges unchanged', async ({ page }) => {
  test.slow();
  await selectTool(page, 'Rectangular Marquee');
  await page.getByTestId('marquee-options').getByLabel('Feather (new selections)', { exact: true }).fill('20');
  await drag(page, [0.1, 0.1], [0.3, 0.3]);
  await expect(page.getByTestId('selection-outline')).toBeVisible({ timeout: 60_000 });
  let saved = await project(page);
  const first = saved.history[saved.index].selection!;
  expect(first).toMatchObject({ feather: 20, inverted: false });
  const row = Math.round(first.y + first.h / 2), until = Math.round(first.x + first.w / 2);

  await page.getByLabel('Selection mode', { exact: true }).selectOption('add');
  const edges: number[][] = [];
  let previousMask: string | undefined;
  for (const [start, end] of [[[0.6, 0.6], [0.8, 0.8]], [[0.6, 0.1], [0.8, 0.3]]] as const) {
    await drag(page, [...start], [...end]);
    // Composition is asynchronous: wait for the history entry with the new mask.
    await expect.poll(async () => {
      saved = await project(page);
      const mask = saved.history[saved.index].selection?.mask;
      return Boolean(mask) && mask !== previousMask;
    }, { timeout: 60_000 }).toBe(true);
    const composed = saved.history[saved.index].selection!;
    previousMask = composed.mask;
    // Feather is already in the composed mask; keeping it re-feathered on every render.
    expect(composed).toMatchObject({ feather: 0, inverted: false });
    expect(composed.mask).toBeTruthy();
    edges.push((await maskProfile(page, saved.assets[composed.mask!], row)).alpha.slice(0, until));
  }
  // The first rectangle's soft left edge is the same after the second Add.
  expect(edges[0].some((value) => value > 0 && value < 255)).toBe(true);
  expect(edges[1]).toEqual(edges[0]);
});
