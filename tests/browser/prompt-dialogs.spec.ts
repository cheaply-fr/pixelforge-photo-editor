import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';
import {
  answerPrompt,
  cancelPrompt,
  expectPromptRejects,
  fillPrompt,
  forbidNativePrompt,
  nativePromptCalls,
  promptDialog,
} from './prompt-dialog';

// Every former window.prompt is an in-app form dialog (src/PromptDialog.tsx):
// labelled fields, selects for fixed choices, inline number validation,
// Enter submits, Escape/Cancel change nothing. Runs on desktop and mobile.

type ProjectLayer = {
  id: string;
  name: string;
  kind: string;
  vectorMask?: { path: unknown };
  matting?: { mode: string; amount: number };
  warp?: { style: string; bend: number; vertical: number };
  contentAwareMoves?: Array<{ dx: number; dy: number }>;
};
type Project = {
  index: number;
  history: Array<{ active: string; layers: ProjectLayer[] }>;
  settings: { customPatternPresets?: Array<{ label: string }> };
};

const footer = (page: Page) => page.locator('footer');
const canvas = (page: Page) => page.getByTestId('editor-canvas');
const settled = (page: Page) => expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });

async function project(page: Page): Promise<Project> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return (await downloadedProject((await (await pending).path())!)) as unknown as Project;
}
const activeLayer = (value: Project) => {
  const frame = value.history[value.index];
  return frame.layers.find((layer) => layer.id === frame.active)!;
};

async function menu(page: Page, top: string, entry: string | RegExp) {
  await page.getByRole('button', { name: top, exact: true }).click();
  const item = page.getByRole('menuitem', typeof entry === 'string' ? { name: entry, exact: true } : { name: entry });
  await expect(item).toBeEnabled();
  await item.click();
}

test.beforeEach(async ({ page }) => {
  // Any native prompt would throw and be counted; no flow below may use one.
  await forbidNativePrompt(page);
  page.on('dialog', (dialog) => {
    throw new Error(`Unexpected native ${dialog.type()} dialog: ${dialog.message()}`);
  });
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

test.afterEach(async ({ page }) => {
  expect(await nativePromptCalls(page)).toBe(0);
});

test('layer rename from the Layers panel uses a labelled dialog; Escape and Enter work and focus returns', async ({ page }) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  const openRename = async (name: string) => {
    await page.getByRole('button', { name: `Layer options for ${name}`, exact: true }).click();
    await page.getByRole('menu', { name: `Layer options for ${name}` }).getByRole('menuitem', { name: 'Rename…', exact: true }).click();
  };
  await openRename('Paint 1');
  const dialog = promptDialog(page, 'Rename layer');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  const field = dialog.getByLabel('Layer name', { exact: true });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('Paint 1');
  // Escape cancels without renaming.
  await field.fill('Ignored');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select layer Paint 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select layer Ignored', exact: true })).toHaveCount(0);
  // Enter submits; focus goes back to the layer row, not the page body.
  await openRename('Paint 1');
  await expect(field).toBeFocused();
  await field.fill('Sky');
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select layer Sky', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement !== document.body && document.activeElement !== null)).toBe(true);
  expect(activeLayer(await project(page)).name).toBe('Sky');
});

test('Warp Text picks the style from a list and validates bend inline', async ({ page }) => {
  await selectTool(page, 'Horizontal Type');
  await canvas(page).click({ position: { x: 120, y: 160 } });
  await page.getByLabel('Edit layer text', { exact: true }).fill('Prompt free');
  await menu(page, 'Type', 'Warp Text…');
  const dialog = promptDialog(page, 'Warp Text');
  const style = dialog.getByLabel('Warp style', { exact: true });
  await expect(style).toHaveJSProperty('tagName', 'SELECT');
  await expect(style.locator('option')).toHaveText(['None', 'Arc', 'Bulge', 'Flag']);
  await expectPromptRejects(page, 'Warp Text', { 'Warp style': 'bulge', Bend: '150' }, 'Enter a number from -100 to 100.');
  await expect(dialog.getByLabel('Bend', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  // Enter does not submit while invalid.
  await dialog.getByLabel('Bend', { exact: true }).press('Enter');
  await expect(dialog).toBeVisible();
  await answerPrompt(page, 'Warp Text', { Bend: '-40', 'Vertical distortion': '15,5' });
  await settled(page);
  expect(activeLayer(await project(page)).warp).toMatchObject({ style: 'bulge', bend: -40, vertical: 15.5 });
});

test('Fade after a live filter takes its opacity from the dialog; Cancel leaves the filter', async ({ page }) => {
  await menu(page, 'Filter', 'Gaussian Blur…');
  await settled(page);
  const before = await project(page);
  await menu(page, 'Edit', /^Fade/);
  await expect(promptDialog(page, 'Fade Gaussian blur').getByLabel('Fade opacity', { exact: true })).toHaveValue('50');
  await cancelPrompt(page, 'Fade Gaussian blur');
  expect((await project(page)).index).toBe(before.index);
  await menu(page, 'Edit', /^Fade/);
  await expectPromptRejects(page, 'Fade Gaussian blur', { 'Fade opacity': 'half' }, 'Enter a number from 0 to 100.');
  await answerPrompt(page, 'Fade Gaussian blur', { 'Fade opacity': '30' });
  await expect(footer(page)).toContainText('Gaussian blur faded to 30%');
  expect((await project(page)).index).toBe(before.index + 1);
});

test('Content-Aware Move asks for both offsets in one dialog', async ({ page }) => {
  await selectTool(page, 'Select');
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.45, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByText('Rectangular selection created', { exact: true })).toBeVisible();
  await menu(page, 'Edit', 'Content-Aware Move…');
  const dialog = await fillPrompt(page, 'Content-Aware Move', {});
  await expect(dialog.getByLabel('Move horizontally', { exact: true })).toHaveValue('24');
  await expect(dialog.getByLabel('Move vertically', { exact: true })).toHaveValue('0');
  await expectPromptRejects(page, 'Content-Aware Move', { 'Move vertically': '5000' }, 'Enter a number from -4096 to 4096.');
  await answerPrompt(page, 'Content-Aware Move', { 'Move horizontally': '-12', 'Move vertically': '8' });
  await expect(page.getByText('Content-Aware Move applied locally; undo restores the original pixels', { exact: true })).toBeVisible();
  expect(activeLayer(await project(page)).contentAwareMoves).toMatchObject([{ dx: -12, dy: 8 }]);
});

test('Cookie Cutter chooses its shape from a list; Escape creates no mask', async ({ page }) => {
  await menu(page, 'Edit', 'Cookie Cutter Mask…');
  const shape = promptDialog(page, 'Cookie Cutter Mask').getByLabel('Shape', { exact: true });
  await expect(shape).toBeFocused();
  await expect(shape.locator('option')).toHaveText(['Rectangle', 'Ellipse', 'Triangle', 'Star', 'Hexagon']);
  await expect(shape).toHaveValue('ellipse');
  await page.keyboard.press('Escape');
  await expect(promptDialog(page, 'Cookie Cutter Mask')).toHaveCount(0);
  expect(activeLayer(await project(page)).vectorMask).toBeUndefined();
  await menu(page, 'Edit', 'Cookie Cutter Mask…');
  await shape.selectOption('hexagon');
  // Enter on the select submits.
  await shape.press('Enter');
  await expect(page.getByText(/Cookie Cutter hexagon mask created/)).toBeVisible();
  expect(activeLayer(await project(page)).vectorMask).toBeTruthy();
});

test('Matting picks the matte colour from a list and bounds the amount', async ({ page }) => {
  await menu(page, 'Layer', 'Matting…');
  const dialog = promptDialog(page, 'Matting');
  await expect(dialog.getByLabel('Matte colour', { exact: true }).locator('option')).toHaveText(['White', 'Black']);
  await expectPromptRejects(page, 'Matting', { 'Matte colour': 'black', Amount: '-1' }, 'Enter a number from 0 to 100.');
  await answerPrompt(page, 'Matting', { Amount: '60' });
  await expect(page.getByText('Black matte removal applied nondestructively', { exact: true })).toBeVisible();
  expect(activeLayer(await project(page)).matting).toEqual({ mode: 'black', amount: 60 });
});

test('a preset name is required and saved from the dialog', async ({ page }) => {
  await selectTool(page, 'Pattern Stamp');
  await menu(page, 'Edit', 'Define Pattern…');
  const dialog = promptDialog(page, 'Name this pattern preset');
  const name = dialog.getByLabel('Preset name', { exact: true });
  await expect(name).toHaveValue('Custom pattern');
  await expectPromptRejects(page, 'Name this pattern preset', { 'Preset name': '  ' }, 'Preset name cannot be empty.');
  await name.fill('Grid tile');
  await name.press('Enter');
  await expect(footer(page)).toContainText('Pattern preset “Grid tile” saved on this device');
  expect((await project(page)).settings.customPatternPresets?.map((preset) => preset.label)).toEqual(['Grid tile']);
});

test('Apply Image: Cancel and Escape leave history unchanged', async ({ page }) => {
  const before = await project(page);
  await menu(page, 'Image', 'Apply Image…');
  await cancelPrompt(page, 'Apply Image');
  await menu(page, 'Image', 'Apply Image…');
  await expect(promptDialog(page, 'Apply Image')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(promptDialog(page, 'Apply Image')).toHaveCount(0);
  expect((await project(page)).index).toBe(before.index);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Undo/ })).toBeDisabled();
});

test('the dialog fits a 375×812 phone screen with reachable actions', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await menu(page, 'Image', 'Calculations…');
  const dialog = promptDialog(page, 'Calculations');
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(812);
  for (const label of ['Blend mode', 'Opacity']) {
    const control = (await dialog.getByLabel(label, { exact: true }).boundingBox())!;
    expect(control.x).toBeGreaterThanOrEqual(box.x);
    expect(control.x + control.width).toBeLessThanOrEqual(box.x + box.width);
    expect(control.height).toBeGreaterThanOrEqual(36);
  }
  const submit = dialog.getByRole('button', { name: 'Apply', exact: true });
  await expect(submit).toBeInViewport();
  expect((await submit.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await answerPrompt(page, 'Calculations', { 'Blend mode': 'difference', Opacity: '25' });
  await expect(footer(page)).toContainText('Calculations applied difference at 25%');
});
