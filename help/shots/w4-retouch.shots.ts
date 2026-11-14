import { expect, test, type Locator, type Page } from '@playwright/test';
import { clickCanvas, dragOnCanvas, highlight, openEditor, openSample, selectTool, shoot } from './helpers';

// Help Center screenshots for the Retouching category (W4).

async function settled(page: Page): Promise<void> {
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });
}

async function setRange(target: Locator, value: number): Promise<void> {
  await target.evaluate((element, next) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(next));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

const options = (page: Page) => page.getByTestId('tool-options-area');
const slider = (page: Page, label: string, value: number) => setRange(options(page).getByRole('slider', { name: label, exact: true }), value);

async function setSize(page: Page, px: number): Promise<void> {
  const field = options(page).getByRole('spinbutton', { name: 'Size', exact: true });
  await field.fill(String(px));
  await field.press('Tab');
}

async function path(page: Page, points: [number, number][], steps = 10): Promise<void> {
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  const at = ([x, y]: [number, number]) => [box.x + box.width * x, box.y + box.height * y] as const;
  await page.mouse.move(...at(points[0]));
  await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(...at(point), { steps });
  await page.mouse.up();
  await settled(page);
}

async function ring(target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  await highlight(target);
}

async function editCommand(page: Page, item: string): Promise<void> {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

test('spot-healing-tree', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Spot Healing');
  await setSize(page, 90);
  await path(page, [[0.083, 0.6], [0.083, 0.75]], 12);
  await ring(options(page).getByRole('combobox', { name: 'Spot Healing type', exact: true }));
  await shoot(page, 'spot-healing-tree');
});

test('healing-brush-source', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Healing');
  await setSize(page, 80);
  await page.keyboard.down('Alt');
  await clickCanvas(page, [0.03, 0.66]);
  await page.keyboard.up('Alt');
  await path(page, [[0.083, 0.6], [0.083, 0.75]], 12);
  await ring(options(page).getByRole('checkbox', { name: 'Clone aligned', exact: true }));
  await shoot(page, 'healing-brush-source');
});

test('patch-tool-tree', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Rectangular Marquee');
  await dragOnCanvas(page, [0.06, 0.58], [0.11, 0.76]);
  await selectTool(page, 'Patch');
  await dragOnCanvas(page, [0.085, 0.67], [0.03, 0.67], 16);
  await settled(page);
  await ring(options(page).getByRole('combobox', { name: 'Patch mode', exact: true }));
  await shoot(page, 'patch-tool-tree');
});

test('clone-stamp-sun', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Clone');
  await setSize(page, 220);
  await slider(page, 'Hardness', 40);
  await page.keyboard.down('Alt');
  await clickCanvas(page, [0.68, 0.5]);
  await page.keyboard.up('Alt');
  await path(page, [[0.25, 0.25], [0.3, 0.27]], 10);
  await ring(options(page).getByRole('combobox', { name: 'Clone sample', exact: true }));
  await shoot(page, 'clone-stamp-sun');
});

test('content-aware-fill-tree', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  // The fill searches up to half the brush Size for context, so set a large Size first.
  await selectTool(page, 'Brush');
  await setSize(page, 200);
  await selectTool(page, 'Rectangular Marquee');
  await dragOnCanvas(page, [0.05, 0.58], [0.115, 0.76]);
  await editCommand(page, 'Content-Aware Fill…');
  await expect(page.getByText(/Content-Aware Fill applied locally/)).toBeVisible();
  await settled(page);
  await shoot(page, 'content-aware-fill-tree');
});

test('dodge-burn-sponge', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Burn');
  await setSize(page, 260);
  await slider(page, 'Hardness', 0);
  await path(page, [[0.05, 0.85], [0.95, 0.85]], 14);
  await selectTool(page, 'Dodge');
  await setSize(page, 260);
  await slider(page, 'Hardness', 0);
  await path(page, [[0.15, 0.48], [0.45, 0.42]], 14);
  await ring(options(page).getByRole('combobox', { name: 'Tonal range', exact: true }));
  await shoot(page, 'dodge-burn-sponge');
});

test('blur-sharpen-tools', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'city');
  await selectTool(page, 'Blur');
  await setSize(page, 200);
  for (let i = 0; i < 4; i += 1) await path(page, [[0.08, 0.8], [0.45, 0.8]], 14);
  await ring(options(page).getByRole('slider', { name: 'Flow', exact: true }));
  await shoot(page, 'blur-sharpen-tools');
});

test('red-eye-tool', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'portrait');
  await selectTool(page, 'Brush');
  await page.getByLabel('Drawing color', { exact: true }).fill('#d41414');
  await setSize(page, 34);
  await clickCanvas(page, [0.47, 0.4]);
  await settled(page);
  await clickCanvas(page, [0.53, 0.4]);
  await settled(page);
  await selectTool(page, 'Red Eye');
  await setSize(page, 60);
  await clickCanvas(page, [0.53, 0.4]);
  await settled(page);
  await ring(options(page).getByRole('slider', { name: 'Red threshold', exact: true }));
  await shoot(page, 'red-eye-tool');
});

test('remove-background-result', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /^New white document/ }).click();
  await settled(page);
  await selectTool(page, 'Brush');
  await page.getByLabel('Drawing color', { exact: true }).fill('#e76f51');
  await setSize(page, 260);
  await path(page, [[0.35, 0.4], [0.5, 0.6], [0.65, 0.4]], 12);
  await page.getByLabel('Drawing color', { exact: true }).fill('#2a9d8f');
  await setSize(page, 120);
  await path(page, [[0.4, 0.25], [0.6, 0.25]], 12);
  await editCommand(page, 'Remove Background…');
  await expect(page.getByText(/Background removed/)).toBeVisible();
  await settled(page);
  await shoot(page, 'remove-background-result');
});

test('generative-fill-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Rectangular Marquee');
  await dragOnCanvas(page, [0.05, 0.58], [0.115, 0.76]);
  await editCommand(page, 'Generative Fill…');
  const dialog = page.getByRole('dialog', { name: 'Generative Fill' });
  await expect(dialog).toBeVisible();
  await shoot(page, 'generative-fill-dialog', dialog);
});
