import { test, expect, type Page } from '@playwright/test';

type Node = { x: number; y: number };
type Path = {
  nodes: Node[];
  closed: boolean;
  fill: boolean;
  stroke: boolean;
  strokeWidth: number;
  fillColor: string;
  strokeColor: string;
};
type Project = {
  version: number;
  history: Array<{ w: number; h: number; layers: Array<Record<string, unknown>>; active: string; selectedLayerIds?: string[] }>;
  assets: Record<string, unknown>;
  index: number;
  name: string;
  settings: Record<string, unknown>;
};

const square = (x: number, y: number, size: number): Path => ({
  nodes: [{ x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }],
  closed: true,
  fill: true,
  stroke: true,
  strokeWidth: 2,
  fillColor: '#ff5f3b',
  strokeColor: '#ff5f3b',
});

const openSquare = (x: number, y: number, size: number): Path => ({
  ...square(x, y, size),
  closed: false,
});

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
  return JSON.parse(await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8')) as Project;
};

const upload = async (page: Page, value: Project) => {
  await page.getByTestId('project-input').setInputFiles({
    name: 'boolean-shapes.pixelforge', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)),
  });
  await expect(page.locator('footer')).toContainText('Project opened with editable layers and history');
};

const withOperands = async (page: Page, second: Path = square(260, 180, 280)) => {
  const value = await project(page);
  const frame = value.history[value.index];
  const source = frame.layers[0];
  const { kind: _kind, asset: _asset, ...common } = source;
  const first = { ...common, id: crypto.randomUUID(), name: 'Shape A', kind: 'path', path: square(120, 180, 280) };
  const other = { ...common, id: crypto.randomUUID(), name: 'Shape B', kind: 'path', path: second };
  frame.layers = [source, first, other];
  frame.active = other.id;
  frame.selectedLayerIds = [first.id, other.id];
  await upload(page, value);
};

test.beforeEach(async ({ page }) => openEditor(page));

test('Layer Combine Shapes performs a nondestructive union and round-trips compound paths', async ({ page }) => {
  await withOperands(page);
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Combine Shapes → Union', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Shapes combined (union)');
  let value = await project(page);
  let frame = value.history[value.index];
  const combined = frame.layers.find((layer) => layer.kind === 'path') as { path: Path & { contours?: Array<{ nodes: Node[]; closed: boolean }> } };
  expect(combined.path.closed).toBe(true);
  expect(combined.path.contours?.length ?? 1).toBe(1);
  expect(frame.layers.filter((layer) => layer.kind === 'path')).toHaveLength(1);
  await page.reload();
  value = await project(page);
  frame = value.history[value.index];
  expect((frame.layers.find((layer) => layer.kind === 'path') as typeof combined).path).toEqual(combined.path);
});

test('Subtract, intersect and exclude commands retain bounded vector geometry', async ({ page }) => {
  for (const [label, expectedContours] of [
    ['Combine Shapes → Subtract Front Shape', 1],
    ['Combine Shapes → Intersect', 1],
    ['Combine Shapes → Exclude Overlapping Shapes', 2],
  ] as const) {
    await withOperands(page);
    await page.getByRole('button', { name: 'Layer', exact: true }).click();
    await page.getByRole('menuitem', { name: label, exact: true }).click();
    await expect(page.locator('footer')).toContainText('Shapes combined');
    const value = await project(page);
    const layer = value.history[value.index].layers.find((candidate) => candidate.kind === 'path') as { path: Path & { contours?: unknown[] } };
    expect(layer.path.contours?.length ?? 1).toBe(expectedContours);
  }
});

test('Combine Shapes disables open path operands and leaves the draft unchanged', async ({ page }) => {
  await withOperands(page, openSquare(260, 180, 280));
  const before = await project(page);
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Combine Shapes → Union', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  expect(await project(page)).toEqual(before);
});
