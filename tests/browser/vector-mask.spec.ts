import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

type Node = { x: number; y: number };
type Path = { nodes: Node[]; closed: boolean; fill: boolean; stroke: boolean; strokeWidth: number; fillColor: string; strokeColor: string; fillRule?: 'nonzero' | 'evenodd'; contours?: Array<{ nodes: Node[]; closed: boolean }> };
type VectorMask = { path: Path; enabled: boolean; inverted: boolean };
type Layer = { id: string; kind: string; asset?: string; matrix: number[]; vectorMask?: VectorMask; locked?: boolean; visible?: boolean };
type Project = { history: Array<{ w: number; h: number; active: string; layers: Layer[] }>; index: number; assets: Record<string, { url: string; w: number; h: number }> };

const saved = (page: Page) => expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
const project = async (page: Page): Promise<Project> => {
  await saved(page);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as Project;
};
const upload = async (page: Page, value: Project) => page.getByTestId('project-input').setInputFiles({
  name: 'vector-mask.pixelforge', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)),
});
const open = async (page: Page) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await saved(page);
};
const localToCanvas = (page: Page, frame: { w: number; h: number }, matrix: number[], x: number, y: number) => page.getByTestId('editor-canvas').boundingBox().then((box) => {
  const [a, b, c, d, e, f] = matrix;
  return { x: box!.x + box!.width * (a * x + c * y + e) / frame.w, y: box!.y + box!.height * (b * x + d * y + f) / frame.h };
});
const alphaAt = (page: Page, x: number, y: number) => page.getByTestId('editor-canvas').evaluate((element, point) => {
  const canvas = element as HTMLCanvasElement;
  return canvas.getContext('2d')!.getImageData(
    Math.max(0, Math.min(canvas.width - 1, Math.round(point.x))),
    Math.max(0, Math.min(canvas.height - 1, Math.round(point.y))),
    1,
    1,
  ).data[3];
}, { x, y });

test.beforeEach(async ({ page }) => open(page));

test('creates a compound vector mask, clips pixels, toggles, undoes, and round-trips', async ({ page }) => {
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Create Vector Mask', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Vector mask created');
  let value = await project(page);
  const frame = value.history[value.index], layer = frame.layers.find((item) => item.id === frame.active)!;
  expect(layer.vectorMask).toBeDefined();
  const asset = value.assets[layer.asset!];
  const outer: Node[] = [{ x: 0, y: 0 }, { x: asset.w, y: 0 }, { x: asset.w, y: asset.h }, { x: 0, y: asset.h }];
  const inner: Node[] = [{ x: asset.w * .25, y: asset.h * .25 }, { x: asset.w * .75, y: asset.h * .25 }, { x: asset.w * .75, y: asset.h * .75 }, { x: asset.w * .25, y: asset.h * .75 }];
  layer.matrix = [.8, .08, -.05, .8, frame.w * .08, frame.h * .06];
  layer.vectorMask!.path = { ...layer.vectorMask!.path, nodes: outer, contours: [{ nodes: outer, closed: true }, { nodes: inner, closed: true }], closed: true, fillRule: 'evenodd' };
  await upload(page, value);
  await expect(page.locator('footer')).toContainText('Project opened with editable layers and history');
  const framePoint = (x: number, y: number) => ({ x: layer.matrix[0] * x + layer.matrix[2] * y + layer.matrix[4], y: layer.matrix[1] * x + layer.matrix[3] * y + layer.matrix[5] });
  const center = framePoint(asset.w * .5, asset.h * .5), corner = framePoint(asset.w * .1, asset.h * .1);
  await expect.poll(() => alphaAt(page, center.x, center.y)).toBe(0);
  await expect.poll(() => alphaAt(page, corner.x, corner.y)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Invert vector mask', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Vector mask inverted');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  await expect.poll(() => alphaAt(page, center.x, center.y)).toBeGreaterThan(0);
  await expect.poll(() => alphaAt(page, corner.x, corner.y)).toBe(0);
  await page.getByRole('button', { name: 'Disable vector mask', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Vector mask disabled');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  await expect.poll(() => alphaAt(page, center.x, center.y)).toBeGreaterThan(0);
  await expect.poll(() => alphaAt(page, corner.x, corner.y)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByRole('button', { name: 'Disable vector mask', exact: true })).toBeVisible();
  await page.reload();
  value = await project(page);
  expect(value.history[value.index].layers.find((item) => item.id === layer.id)?.vectorMask).toMatchObject({ enabled: true, inverted: true, path: layer.vectorMask!.path });
  expect(value.assets[layer.asset!]).toEqual(asset);
  await page.getByRole('button', { name: 'Remove vector mask', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Vector mask removed');
  await expect.poll(() => alphaAt(page, center.x, center.y)).toBeGreaterThan(0);
  await expect.poll(() => alphaAt(page, corner.x, corner.y)).toBeGreaterThan(0);
  value = await project(page);
  expect(value.history[value.index].layers.find((item) => item.id === layer.id)?.vectorMask).toBeUndefined();
  expect(value.assets[layer.asset!]).toEqual(asset);
});

test('Direct Selection edits vector-mask nodes and malformed, locked, and hidden inputs are guarded', async ({ page }) => {
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Create Vector Mask', exact: true }).click();
  let value = await project(page);
  const frame = value.history[value.index], layer = frame.layers.find((item) => item.id === frame.active)!;
  const asset = value.assets[layer.asset!];
  const inset: Node[] = [{ x: asset.w * .2, y: asset.h * .2 }, { x: asset.w * .8, y: asset.h * .2 }, { x: asset.w * .8, y: asset.h * .8 }, { x: asset.w * .2, y: asset.h * .8 }];
  layer.vectorMask!.path = { ...layer.vectorMask!.path, nodes: inset, closed: true };
  await upload(page, value);
  await expect(page.locator('footer')).toContainText('Project opened with editable layers and history');
  value = await project(page);
  const node = layer.vectorMask!.path.nodes[1], moved = { x: node.x + 40, y: node.y + 20 };
  const start = await localToCanvas(page, frame, layer.matrix, node.x, node.y), end = await localToCanvas(page, frame, layer.matrix, moved.x, moved.y);
  await selectTool(page, 'Direct Selection');
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 3 }); await page.mouse.up();
  await expect(page.locator('footer')).toContainText('Vector mask node moved');
  value = await project(page);
  const edited = value.history[value.index].layers.find((item) => item.id === layer.id)!;
  expect(edited.vectorMask!.path.nodes[1].x).toBeCloseTo(moved.x, 0);

  const malformed = structuredClone(value); malformed.history[malformed.index].layers.find((item) => item.id === layer.id)!.vectorMask!.path.nodes = [];
  await upload(page, malformed); await expect(page.locator('footer')).toContainText('Invalid layer document');
  expect((await project(page)).history[(await project(page)).index].layers.find((item) => item.id === layer.id)!.vectorMask).toEqual(edited.vectorMask);

  const guarded = structuredClone(value); const guardedLayer = guarded.history[guarded.index].layers.find((item) => item.id === layer.id)!; guardedLayer.vectorMask = undefined; guardedLayer.locked = true;
  await upload(page, guarded); await expect(page.getByRole('button', { name: 'Create vector mask', exact: true })).toBeDisabled();
  guardedLayer.locked = false; guardedLayer.visible = false; await upload(page, guarded); await expect(page.getByRole('button', { name: 'Create vector mask', exact: true })).toBeDisabled();
});

test('compound vector masks produce identical worker and main-thread pixels', async ({ page }) => {
  await page.getByRole('button', { name: 'Create vector mask', exact: true }).click();
  const value = await project(page), frame = value.history[value.index], layer = frame.layers.find((item) => item.id === frame.active)!;
  const asset = value.assets[layer.asset!];
  const outer: Node[] = [{ x: 0, y: 0 }, { x: asset.w, y: 0 }, { x: asset.w, y: asset.h }, { x: 0, y: asset.h }];
  const inner: Node[] = [{ x: asset.w * .25, y: asset.h * .25 }, { x: asset.w * .75, y: asset.h * .25 }, { x: asset.w * .75, y: asset.h * .75 }, { x: asset.w * .25, y: asset.h * .75 }];
  layer.matrix = [.8, .08, -.05, .8, frame.w * .08, frame.h * .06];
  layer.vectorMask!.path = { ...layer.vectorMask!.path, nodes: outer, contours: [{ nodes: outer, closed: true }, { nodes: inner, closed: true }], closed: true, fillRule: 'evenodd' };
  await upload(page, value);
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  await saved(page);
  const main = await page.getByTestId('editor-canvas').evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  await page.addInitScript(() => {
    (window as Window & { __PIXELFORGE_FORCE_WORKER__?: boolean; __vectorMaskWorkerRenders?: number }).__PIXELFORGE_FORCE_WORKER__ = true;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        const original = this.postMessage.bind(this);
        this.postMessage = ((message: unknown, transfer?: Transferable[]) => {
          if (message && typeof message === 'object' && (message as { kind?: unknown }).kind === 'render') {
            const state = window as Window & { __vectorMaskWorkerRenders?: number };
            state.__vectorMaskWorkerRenders = (state.__vectorMaskWorkerRenders || 0) + 1;
          }
          return original(message, transfer as Transferable[]);
        }) as typeof this.postMessage;
      }
    } as typeof Worker;
  });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => page.evaluate(() => (window as Window & { __vectorMaskWorkerRenders?: number }).__vectorMaskWorkerRenders || 0)).toBeGreaterThan(0);
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  expect(await page.getByTestId('editor-canvas').evaluate((element) => (element as HTMLCanvasElement).toDataURL())).toBe(main);
});
