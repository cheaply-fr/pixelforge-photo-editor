import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

// Shortcut audit 2026-11-14 (docs/keyboard-shortcuts.md): every key shown in
// the toolbar and the menus does what it says, on desktop and mobile.

const ready = (page: Page) => expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
const toolButton = (page: Page, label: string) => page.getByRole('button', { name: `${label} tool`, exact: true });
const footer = (page: Page) => page.locator('footer');

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await ready(page);
});

async function menu(page: Page, name: string, item: string | RegExp) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', typeof item === 'string' ? { name: item, exact: true } : { name: item }).click();
}

async function project(page: Page) {
  const pending = page.waitForEvent('download');
  await menu(page, 'File', 'Download project file');
  return downloadedProject((await (await pending).path())!);
}

async function expectTool(page: Page, label: string) {
  // A family's inactive variants are not on the toolbar, so check the slot.
  await expect(toolButton(page, label)).toHaveAttribute('aria-pressed', 'true');
}

test('V, H, Z and T select Move, Hand, Zoom and Horizontal Type as the toolbar shows', async ({ page }) => {
  await page.keyboard.press('b');
  await expectTool(page, 'Brush');
  await page.keyboard.press('h');
  await expectTool(page, 'Hand');
  await expect(footer(page)).toContainText('Hand tool selected');
  await page.keyboard.press('b');
  await page.keyboard.press('v');
  await expectTool(page, 'Move');
  await page.keyboard.press('z');
  await expectTool(page, 'Zoom');
  await page.keyboard.press('t');
  await expectTool(page, 'Horizontal Type');
  await page.keyboard.press('t');
  await expectTool(page, 'Vertical Type');
  // The toolbar advertises exactly these keys.
  await expect(toolButton(page, 'Move')).toHaveAttribute('title', /\(V\)/);
  await expect(toolButton(page, 'Hand')).toHaveAttribute('title', /\(H\)/);
  await expect(toolButton(page, 'Zoom')).toHaveAttribute('title', /\(Z\)/);
});

test('R selects Rotate View and Shift+R reaches Smudge, Blur and Sharpen from any tool', async ({ page }) => {
  await page.keyboard.press('b');
  await page.keyboard.press('Shift+R');
  await expectTool(page, 'Smudge');
  await expect(toolButton(page, 'Smudge')).toHaveAttribute('title', /\(Shift\+R\)/);
  await page.keyboard.press('Shift+R');
  await expectTool(page, 'Blur');
  await page.keyboard.press('Shift+R');
  await expectTool(page, 'Sharpen');
  await page.keyboard.press('r');
  await expectTool(page, 'Rotate View');
  await page.keyboard.press('e');
  await expectTool(page, 'Eraser');
  // The last used retouch tool comes back.
  await page.keyboard.press('Shift+R');
  await expectTool(page, 'Sharpen');
});

test('Ctrl+F opens Search commands but Ctrl+Shift+F runs Fade…', async ({ page }) => {
  await page.keyboard.press('Control+f');
  const search = page.getByRole('dialog', { name: /Search commands/i });
  await expect(search).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toBeHidden();

  // A raster edit to fade: Edit > Fill… with the foreground colour.
  await menu(page, 'Edit', /^Fill…/);
  await page.getByRole('dialog', { name: 'Fill' }).getByRole('button', { name: 'Fill', exact: true }).click();
  await expect(footer(page)).toContainText('Layer filled', { timeout: 10000 });
  let prompted = false;
  page.once('dialog', (dialog) => { prompted = dialog.message().includes('Fade'); void dialog.accept('50'); });
  await page.keyboard.press('Control+Shift+F');
  await expect(search).toBeHidden();
  // Fade is a prompt today; accept a Fade dialog too if it becomes one.
  await expect.poll(async () =>
    prompted || await page.getByRole('dialog', { name: /Fade/ }).isVisible() || (await footer(page).textContent())?.includes('Fade applied'),
  ).toBeTruthy();
});

test('Ctrl+Alt+Shift+F focuses Find Layers instead of opening Search commands', async ({ page }) => {
  await page.keyboard.press('Control+Alt+Shift+F');
  await expect(page.locator('#find-layers')).toBeFocused();
  await expect(page.getByRole('dialog', { name: /Search commands/i })).toHaveCount(0);
});

test('Ctrl+, hides and shows the active layer like Layer > Hide Layers', async ({ page }) => {
  const visible = async () => {
    const saved = await project(page);
    const frame = saved.history[saved.index];
    return frame.layers.find((layer: { id: string }) => layer.id === frame.active)?.visible;
  };
  expect(await visible()).toBe(true);
  await page.keyboard.press('Control+,');
  await expect.poll(visible).toBe(false);
  await page.keyboard.press('Control+,');
  await expect.poll(visible).toBe(true);
});

test('Ctrl+Alt+Z toggles between the current and previous state instead of undoing again', async ({ page }) => {
  const canvas = page.getByTestId('editor-canvas');
  const width = () => canvas.getAttribute('width');
  const start = await width();
  await menu(page, 'Image', 'Rotate right');
  const rotated = await width();
  expect(rotated).not.toBe(start);
  await menu(page, 'Image', 'Rotate right');
  await expect(canvas).toHaveAttribute('width', start!);
  // Three toggles: back to one rotation, forward to two, back to one.
  await page.keyboard.press('Control+Alt+z');
  await expect(canvas).toHaveAttribute('width', rotated!);
  await expect(footer(page)).toContainText('Toggled the last editable state');
  await page.keyboard.press('Control+Alt+z');
  await expect(canvas).toHaveAttribute('width', start!);
  await page.keyboard.press('Control+Alt+z');
  await expect(canvas).toHaveAttribute('width', rotated!);
  // Plain Ctrl+Z is still Undo (to the unrotated document).
  await page.keyboard.press('Control+z');
  await expect(canvas).toHaveAttribute('width', start!);
  await expect(footer(page)).toContainText('Undone');
});

test('the Keyboard Shortcuts list is a readable table and includes Search commands', async ({ page }) => {
  await menu(page, 'Edit', 'Keyboard Shortcuts…');
  const dialog = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
  await dialog.getByLabel('Filter keyboard shortcuts').fill('layer');
  const list = dialog.getByRole('table', { name: 'Keyboard shortcuts list' });
  await expect(list).toBeVisible();
  await expect(list.getByRole('columnheader')).toHaveText(['Command', 'Menu', 'Shortcut']);
  const row = list.getByRole('row', { name: /Copy Layer/ });
  await expect(row.getByRole('rowheader')).toHaveText('Copy Layer');
  await expect(row.getByRole('cell').first()).toHaveText('Edit');
  await expect(row.locator('kbd')).toHaveText('Ctrl+C');
  // The three columns sit side by side with space between them.
  const [label, menuCell, key] = await Promise.all([
    row.getByRole('rowheader').boundingBox(),
    row.getByRole('cell').first().boundingBox(),
    row.locator('kbd').boundingBox(),
  ]);
  expect(menuCell!.x).toBeGreaterThanOrEqual(label!.x + label!.width - 1);
  expect(key!.x).toBeGreaterThan(menuCell!.x + 8);
  const dialogBox = await dialog.boundingBox();
  expect(key!.x + key!.width).toBeLessThanOrEqual(dialogBox!.x + dialogBox!.width);
  await dialog.getByLabel('Filter keyboard shortcuts').fill('search');
  await expect(list.getByRole('row', { name: /Search commands/ }).locator('kbd')).toHaveText('Ctrl+F');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
});

test('Find and Replace Text shows real text boxes and Check Spelling knows common words', async ({ page }) => {
  await menu(page, 'Type', 'Paste Lorem Ipsum');
  await menu(page, 'Edit', 'Find and Replace Text…');
  const replace = page.getByRole('dialog', { name: 'Find and Replace Text' });
  for (const name of ['Find text', 'Replace text']) {
    const input = replace.getByLabel(name, { exact: true });
    const style = await input.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { border: computed.borderTopWidth, background: computed.backgroundColor, height: element.getBoundingClientRect().height };
    });
    expect(style.border).toBe('1px');
    expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(style.height).toBeGreaterThanOrEqual(30);
  }
  const find = await replace.getByLabel('Find text', { exact: true }).boundingBox();
  const box = await replace.boundingBox();
  expect(find!.width).toBeGreaterThan(box!.width * 0.6);
  await replace.getByLabel('Find text').fill('Lorem');
  await replace.getByLabel('Replace text').fill('Teh golden hour');
  await replace.getByRole('button', { name: 'Replace all', exact: true }).click();
  await menu(page, 'Edit', 'Check Spelling…');
  const dialog = page.getByRole('dialog', { name: 'Check Spelling' });
  const hints = dialog.getByLabel('Spelling hints');
  await expect(hints).toHaveAttribute('aria-busy', 'false');
  await expect(hints.locator('code')).toHaveText(['teh']);
  await expect(dialog).toContainText('about 3,700 common English words');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
});

for (const tool of ['Rounded Rectangle', 'Custom Shape']) {
  test(`${tool} has the Tool presets button and saves a preset`, async ({ page }) => {
    await selectTool(page, tool);
    const presets = page.getByTestId('tool-presets');
    const trigger = presets.getByRole('button', { name: /^Tool presets/ });
    await expect(trigger).toBeVisible();
    await expect(page.getByTestId('tool-preset-status')).toContainText(tool);
    await trigger.click();
    await presets.getByLabel('New tool preset name', { exact: true }).fill(`${tool} look`);
    await presets.getByRole('button', { name: 'Save preset', exact: true }).click();
    await expect(footer(page)).toContainText(`Tool preset “${tool} look” saved on this device`);
  });
}

test('Rounded Rectangle presets restore the corner radius', async ({ page }) => {
  await selectTool(page, 'Rounded Rectangle');
  const radius = page.getByLabel('Corner radius', { exact: true });
  await radius.fill('120');
  const presets = page.getByTestId('tool-presets');
  await presets.getByRole('button', { name: /^Tool presets/ }).click();
  await presets.getByLabel('New tool preset name', { exact: true }).fill('Pill');
  await presets.getByRole('button', { name: 'Save preset', exact: true }).click();
  await radius.fill('10');
  await expect(page.getByTestId('tool-preset-modified')).toBeVisible();
  await presets.getByRole('button', { name: /^Apply Pill \(/ }).click();
  await expect(radius).toHaveValue('120');
});
