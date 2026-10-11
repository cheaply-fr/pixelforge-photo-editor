import { expect, test, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

const modifier: 'Meta' | 'Control' = process.platform === 'darwin' ? 'Meta' : 'Control';

async function project(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as {
    history: Array<{ layers: Array<{ name: string; groupId?: string }> }>;
    index: number;
  };
}

async function drawShape(page: Page, x: number, y: number) {
  await selectTool(page, 'Shape');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * (x + 0.08), box.y + box.height * (y + 0.06), { steps: 3 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

test('grouping non-adjacent layers keeps a contiguous ordered block', async ({ page }) => {
  await drawShape(page, 0.08, 0.1);
  await drawShape(page, 0.3, 0.2);
  await drawShape(page, 0.55, 0.3);
  await page.getByRole('button', { name: 'Select layer Shape 1', exact: true }).click();
  await page.getByRole('button', { name: 'Select layer Shape 3', exact: true }).click({ modifiers: [modifier] });
  await page.getByRole('button', { name: 'Group active layer', exact: true }).click();
  const saved = await project(page);
  const frame = saved.history[saved.index];
  expect(frame.layers.map((layer) => layer.name)).toEqual([
    'Background',
    'Shape 1',
    'Shape 3',
    'Shape 2',
  ]);
  const grouped = frame.layers.filter((layer) => layer.groupId);
  expect(grouped).toHaveLength(2);
  expect(new Set(grouped.map((layer) => layer.groupId)).size).toBe(1);
});
