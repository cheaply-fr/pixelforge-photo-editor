import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

type PathLayer = {
  kind: 'path';
  path: {
    nodes: Array<{
      x: number;
      y: number;
      inHandle?: { x: number; y: number };
      outHandle?: { x: number; y: number };
    }>;
    closed: boolean;
    fill: boolean;
    stroke: boolean;
    strokeWidth: number;
    fillColor: string;
    strokeColor: string;
  };
  matrix: number[];
  locked?: boolean;
};
type Project = {
  history: Array<{ layers: Array<PathLayer & { id: string }> }>;
  index: number;
};

const openEditor = async (page: Page) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
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

const canvasPoint = async (page: Page, x: number, y: number) => {
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  return { x: box.x + box.width * x, y: box.y + box.height * y };
};

const clickCanvas = async (page: Page, x: number, y: number) => {
  const point = await canvasPoint(page, x, y);
  await page.mouse.click(point.x, point.y);
};

const closeTriangle = async (page: Page) => {
  await selectTool(page, 'Pen');
  await clickCanvas(page, 0.25, 0.25);
  await clickCanvas(page, 0.75, 0.25);
  await clickCanvas(page, 0.5, 0.75);
  await clickCanvas(page, 0.25, 0.25);
  await expect(page.locator('footer')).toContainText('Editable path layer added', { timeout: 10000 });
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
};

const activePath = (value: Project): PathLayer => {
  const frame = value.history[value.index];
  return frame.layers.find((layer) => layer.kind === 'path')!;
};

test.beforeEach(async ({ page }) => openEditor(page));

test('Pen P creates a filled editable path and round-trips through reload and project export', async ({ page }) => {
  await page.keyboard.press('p');
  await expect(page.getByRole('button', { name: 'Pen tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await closeTriangle(page);
  const created = await project(page);
  const path = activePath(created);
  expect(path.path.nodes).toHaveLength(3);
  expect(path.path.closed).toBe(true);
  expect(path.path.fill).toBe(true);
  expect(path.path.stroke).toBe(true);
  await page.reload();
  const reloaded = activePath(await project(page));
  expect(reloaded.path).toEqual(path.path);
  expect(reloaded.matrix).toEqual(path.matrix);
});

test('Pen Shift and Alt drags persist cubic handles and render the curve', async ({ page }) => {
  await selectTool(page, 'Pen');
  const first = await canvasPoint(page, 0.2, 0.25);
  await page.mouse.click(first.x, first.y);
  const second = await canvasPoint(page, 0.78, 0.25);
  await page.keyboard.down('Shift');
  await page.mouse.move(second.x, second.y);
  await page.mouse.down();
  await page.mouse.move(second.x, (await canvasPoint(page, 0.78, 0.45)).y, { steps: 3 });
  await page.keyboard.down('Alt');
  await page.mouse.move((await canvasPoint(page, 0.68, 0.32)).x, (await canvasPoint(page, 0.68, 0.32)).y, { steps: 2 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await page.keyboard.up('Shift');
  await clickCanvas(page, 0.5, 0.75);
  await clickCanvas(page, 0.2, 0.25);
  await expect(page.locator('footer')).toContainText('Editable path layer added', { timeout: 10000 });
  const path = activePath(await project(page));
  expect(path.path.nodes.some((node) => node.outHandle)).toBe(true);
  expect(path.path.nodes.some((node) => node.inHandle)).toBe(true);
  await page.reload();
  expect(activePath(await project(page)).path).toEqual(path.path);
});

test('Path Closed, Fill and Stroke controls change pixels and survive undo, redo and reload', async ({ page }) => {
  await closeTriangle(page);
  const panel = page.getByRole('region', { name: 'Layers', exact: true });
  const closed = panel.getByLabel('Closed path', { exact: true });
  const fill = panel.getByLabel('Fill', { exact: true });
  const stroke = panel.getByLabel('Stroke', { exact: true });
  const samplePixel = async () => {
    await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
    return page.getByTestId('editor-canvas').evaluate((element, point) => {
      const canvas = element as HTMLCanvasElement;
      return Array.from(canvas.getContext('2d')!.getImageData(Math.floor(point.x * canvas.width), Math.floor(point.y * canvas.height), 1, 1).data);
    }, { x: 0.5, y: 0.42 });
  };
  await page.getByLabel('Path fill color', { exact: true }).fill('#00ff00');
  await page.getByLabel('Path stroke color', { exact: true }).fill('#ff0000');
  await page.getByLabel('Path stroke width', { exact: true }).fill('12');
  await page.getByLabel('Path stroke width', { exact: true }).press('Enter');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  const filledPixel = await samplePixel();
  expect(filledPixel[1]).toBeGreaterThan(filledPixel[0]);
  expect(activePath(await project(page)).path).toMatchObject({
    closed: true, fill: true, stroke: true,
    fillColor: '#00ff00', strokeColor: '#ff0000', strokeWidth: 12,
  });
  await fill.uncheck();
  expect(await samplePixel()).not.toEqual(filledPixel);
  expect(activePath(await project(page)).path.fill).toBe(false);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(fill).toBeChecked();
  expect(await samplePixel()).toEqual(filledPixel);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await expect(fill).not.toBeChecked();
  await fill.check();
  await stroke.uncheck();
  await expect(stroke).not.toBeChecked();
  expect(await samplePixel()).toEqual(filledPixel);
  await stroke.check();
  await closed.uncheck();
  expect(await samplePixel()).not.toEqual(filledPixel);
  expect(activePath(await project(page)).path.closed).toBe(false);
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  await page.reload();
  const reloaded = activePath(await project(page));
  expect(reloaded.path).toMatchObject({
    closed: false, fill: true, stroke: true,
    fillColor: '#00ff00', strokeColor: '#ff0000', strokeWidth: 12,
  });
  await expect(page.getByRole('region', { name: 'Layers', exact: true }).getByLabel('Closed path', { exact: true })).not.toBeChecked();
  expect(await samplePixel()).not.toEqual(filledPixel);
});

test('Direct Selection A moves a path node with undo/redo and rejects locked paths', async ({ page }) => {
  await closeTriangle(page);
  const before = await project(page);
  const pathBefore = activePath(before);
  await page.keyboard.press('a');
  await expect(page.getByRole('button', { name: 'Direct Selection tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const start = await canvasPoint(page, 0.25, 0.25);
  const end = await canvasPoint(page, 0.18, 0.18);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 3 });
  await page.mouse.up();
  await expect(page.locator('footer')).toContainText('Path node moved', { timeout: 10000 });
  const moved = await project(page);
  expect(moved.history.length).toBeGreaterThan(before.history.length);
  expect(activePath(moved).path.nodes[0]).not.toEqual(pathBefore.path.nodes[0]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  expect(activePath(await project(page)).path.nodes[0]).toEqual(pathBefore.path.nodes[0]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  expect(activePath(await project(page)).path.nodes[0]).not.toEqual(pathBefore.path.nodes[0]);
  await page.getByLabel('Lock layer', { exact: true }).check();
  const lockedBefore = await project(page);
  await page.mouse.move(end.x, end.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y, { steps: 2 });
  await page.mouse.up();
  await expect(page.locator('footer')).toContainText('visible, unlocked path layer');
  expect((await project(page)).history.length).toBe(lockedBefore.history.length);
});

test('Escape and touch cancellation leave an open Pen gesture out of history on desktop and mobile', async ({ page }) => {
  const before = await project(page);
  await selectTool(page, 'Pen');
  await clickCanvas(page, 0.2, 0.2);
  await clickCanvas(page, 0.7, 0.2);
  await page.keyboard.press('Escape');
  await expect(page.locator('footer')).toContainText('Pen path cancelled');
  expect((await project(page)).history.length).toBe(before.history.length);
  const point = await canvasPoint(page, 0.2, 0.2);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', { pointerId: 240, pointerType: 'touch', pressure: 0.6, clientX: point.x, clientY: point.y, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointercancel', { pointerId: 240, pointerType: 'touch', pressure: 0, clientX: point.x, clientY: point.y, buttons: 0, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Pen path cancelled');
  expect((await project(page)).history.length).toBe(before.history.length);
});
