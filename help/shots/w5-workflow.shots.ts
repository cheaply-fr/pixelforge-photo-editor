import { expect, test, type Page } from '@playwright/test';
import { clickCanvas, dragOnCanvas, highlight, menu, openEditor, openPanel, openSample, selectTool, shoot } from './helpers';

// Workflow screenshots (help/articles: history-panel, actions, keyboard-shortcuts,
// command-search, customise-menus-and-toolbar, tool-presets,
// color-settings-and-preferences, audio-notes).

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const settle = (page: Page) => expect(canvas(page)).toHaveAttribute('data-rendering', 'false');

test('history-panel', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Rectangle');
  await dragOnCanvas(page, [0.1, 0.1], [0.3, 0.3]);
  await settle(page);
  await selectTool(page, 'Ellipse');
  await dragOnCanvas(page, [0.6, 0.15], [0.8, 0.4]);
  await settle(page);
  await menu(page, 'Filter', 'Warm');
  await settle(page);
  await openPanel(page, 'History');
  await shoot(page, 'history-panel', page.locator('#sidebar-open-panel'));
});

test('actions-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await menu(page, 'Edit', 'Action recipes…');
  const dialog = page.getByTestId('actions-dialog');
  await dialog.getByLabel('Recipe name').fill('Warm web finish');
  await page.getByTestId('start-action-recording').click();
  await page.getByRole('button', { name: 'Close action recipes' }).click();
  await menu(page, 'Filter', 'Warm');
  await settle(page);
  await menu(page, 'Filter', 'Sharpen');
  await settle(page);
  await menu(page, 'Edit', 'Action recipes…');
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(dialog.getByText('2 steps', { exact: true })).toBeVisible();
  await shoot(page, 'actions-dialog', dialog);
});

test('keyboard-shortcuts-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await menu(page, 'Edit', 'Keyboard Shortcuts…');
  const dialog = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
  await dialog.getByLabel('Filter keyboard shortcuts').fill('layer');
  await shoot(page, 'keyboard-shortcuts-dialog', dialog);
});

test('command-search', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await clickCanvas(page, [0.5, 0.5]);
  await page.keyboard.press('Control+f');
  const dialog = page.getByRole('dialog', { name: 'Search commands' });
  await dialog.getByRole('textbox', { name: 'Search commands' }).fill('gauss');
  await shoot(page, 'command-search', dialog);
});

test('toolbar-settings', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await menu(page, 'Edit', 'Toolbar…');
  const dialog = page.getByRole('dialog', { name: 'Toolbar' });
  await shoot(page, 'toolbar-settings', dialog);
});

test('menus-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await menu(page, 'Edit', 'Menus…');
  await shoot(page, 'menus-dialog', page.getByRole('dialog', { name: 'Menus' }));
});

test('tool-presets-panel', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Brush');
  const region = page.locator('section[aria-label="Tool presets"]');
  await page.getByRole('button', { name: /^Tool presets/ }).click();
  await page.getByRole('textbox', { name: 'New tool preset name', exact: true }).fill('Soft sketch');
  await page.getByRole('button', { name: 'Save preset', exact: true }).click();
  await page.getByRole('textbox', { name: 'New tool preset name', exact: true }).fill('Hard ink');
  await page.getByRole('button', { name: 'Save preset', exact: true }).click();
  await page.waitForTimeout(300);
  await shoot(page, 'tool-presets-panel', region);
});

test('color-settings-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await menu(page, 'Edit', 'Color Settings…');
  await shoot(page, 'color-settings-dialog', page.getByRole('dialog', { name: 'Color Settings' }));
});

test('audio-annotation-panel', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Audio Annotation');
  await clickCanvas(page, [0.45, 0.4]);
  await page.waitForTimeout(500);
  await highlight(page.getByRole('button', { name: 'Record', exact: true }));
  await shoot(page, 'audio-annotation-panel');
});
