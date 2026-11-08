import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';

// A Brush stroke in a non-Normal Mode (#218) on a tiled (>= 1 MP) layer must
// reach the commit's dirty-rectangle tile hint (#221): the blend path writes
// the gesture buffer with putImageData, so it has to report those writes or
// the commit would keep the old tiles and drop the stroke.

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const settled = (page: Page) =>
  expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const rgb = (page: Page, x: number, y: number) =>
  canvas(page).evaluate((element: HTMLCanvasElement, point) =>
    Array.from(element.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data).slice(0, 3),
  { x, y });

async function at(page: Page, x: number, y: number) {
  return canvas(page).evaluate((element: HTMLCanvasElement, point) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + (point.x / element.width) * rect.width, y: rect.top + (point.y / element.height) * rect.height };
  }, { x, y });
}

test('a Multiply brush stroke on a tiled layer is committed, undone and reloaded intact', async ({ page }) => {
  test.setTimeout(120_000);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('New document width (px)').fill('1200');
  await dialog.getByLabel('New document height (px)').fill('1200');
  await dialog.getByLabel('Background contents').selectOption('white');
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(canvas(page)).toHaveJSProperty('width', 1200);
  await settled(page);

  await selectTool(page, 'Brush');
  await page.getByLabel('Drawing color', { exact: true }).evaluate((input: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '#ff0000');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.getByLabel('Size', { exact: true }).fill('60');
  await page.getByLabel('Size', { exact: true }).press('Enter');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Brush mode', { exact: true }).selectOption('multiply');

  await canvas(page).scrollIntoViewIfNeeded();
  const a = await at(page, 300, 600), b = await at(page, 900, 600);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 16 });
  await page.mouse.up();
  await expect(page.locator('footer')).toContainText('Paint layer updated', { timeout: 20_000 });
  await settled(page);
  expect(await rgb(page, 600, 600)).toEqual([255, 0, 0]);
  expect(await rgb(page, 600, 200)).toEqual([255, 255, 255]);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await settled(page);
  expect(await rgb(page, 600, 600)).toEqual([255, 255, 255]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await settled(page);
  expect(await rgb(page, 600, 600)).toEqual([255, 0, 0]);

  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device', {
    timeout: 30_000,
  });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await settled(page);
  expect(await rgb(page, 600, 600)).toEqual([255, 0, 0]);
  expect(await rgb(page, 600, 200)).toEqual([255, 255, 255]);
});
