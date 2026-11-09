import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';
import { openPanel } from './sidebar-panels';

// Tool presets (docs/tool-presets-contract.md): device-local, per-tool option
// snapshots with Reset Tool / Reset All Tools, on desktop and mobile.

const ready = async (page: Page) => expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
const footer = (page: Page) => page.locator('footer');
const presetsPanel = (page: Page) => page.getByTestId('tool-presets');
const trigger = (page: Page) => presetsPanel(page).getByRole('button', { name: /^Tool presets/ });
const status = (page: Page) => page.getByTestId('tool-preset-status');
const modified = (page: Page) => page.getByTestId('tool-preset-modified');
const applyButton = (page: Page, name: string) =>
  presetsPanel(page).getByRole('button', { name: new RegExp(`^Apply ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(`) });

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await ready(page);
});

async function setSlider(page: Page, label: string, value: string) {
  const slider = page.getByLabel(label, { exact: true });
  await slider.fill(value);
  await expect(slider).toHaveValue(value);
}

async function openPresets(page: Page) {
  if ((await trigger(page).getAttribute('aria-expanded')) !== 'true') await trigger(page).click();
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
}

async function savePreset(page: Page, name: string, options: { includeColor?: boolean } = {}) {
  await openPresets(page);
  await presetsPanel(page).getByLabel('New tool preset name', { exact: true }).fill(name);
  if (options.includeColor) await presetsPanel(page).getByLabel('Include colour', { exact: true }).check();
  await presetsPanel(page).getByRole('button', { name: 'Save preset', exact: true }).click();
  await expect(footer(page)).toContainText(`Tool preset “${name}” saved on this device`);
}

const historyPosition = async (page: Page) => {
  // The History timeline lives behind the sidebar's More panels strip.
  await openPanel(page, 'History');
  return page.getByLabel('History position', { exact: true }).textContent();
};

test('save a Brush preset, change options, apply it back, then Reset Tool', async ({ page }) => {
  await selectTool(page, 'Brush');
  await expect(status(page)).toContainText('Brush · No preset applied');
  await setSlider(page, 'Hardness', '40');
  await setSlider(page, 'Opacity', '55');
  await setSlider(page, 'Smoothing', '30');
  const history = await historyPosition(page);
  await savePreset(page, 'Soft ink');
  await expect(status(page)).toContainText('Brush · Soft ink');
  await expect(modified(page)).toHaveCount(0);

  // Changing an option marks the preset modified; applying restores it.
  await setSlider(page, 'Hardness', '90');
  await setSlider(page, 'Smoothing', '5');
  await expect(modified(page)).toBeVisible();
  await expect(status(page)).toContainText('Soft ink (modified)');
  await applyButton(page, 'Soft ink').click();
  await expect(footer(page)).toContainText('Tool preset “Soft ink” applied to Brush');
  await expect(page.getByLabel('Hardness', { exact: true })).toHaveValue('40');
  await expect(page.getByLabel('Opacity', { exact: true })).toHaveValue('55');
  await expect(page.getByLabel('Smoothing', { exact: true })).toHaveValue('30');
  await expect(modified(page)).toHaveCount(0);
  // Applying a preset never adds document history.
  expect(await historyPosition(page)).toBe(history);

  // Reset Tool asks first; dismissing keeps the options.
  page.once('dialog', (dialog) => dialog.dismiss());
  await presetsPanel(page).getByRole('button', { name: 'Reset Tool', exact: true }).click();
  await expect(page.getByLabel('Hardness', { exact: true })).toHaveValue('40');
  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('Reset Brush options');
    void dialog.accept();
  });
  await presetsPanel(page).getByRole('button', { name: 'Reset Tool', exact: true }).click();
  await expect(footer(page)).toContainText('Brush options reset to defaults');
  await expect(page.getByLabel('Hardness', { exact: true })).toHaveValue('100');
  await expect(page.getByLabel('Opacity', { exact: true })).toHaveValue('100');
  await expect(page.getByLabel('Smoothing', { exact: true })).toHaveValue('0');
  await expect(status(page)).toContainText('Brush · No preset applied');
  expect(await historyPosition(page)).toBe(history);
});

test('Reset All Tools confirms, then resets every tool’s options', async ({ page }) => {
  await selectTool(page, 'Brush');
  await setSlider(page, 'Hardness', '30');
  await selectTool(page, 'Gradient');
  await setSlider(page, 'Dither', '45');
  await selectTool(page, 'Dodge');
  await setSlider(page, 'Exposure', '80');
  await openPresets(page);
  page.once('dialog', (dialog) => dialog.dismiss());
  await presetsPanel(page).getByRole('button', { name: 'Reset All Tools', exact: true }).click();
  await expect(page.getByLabel('Exposure', { exact: true })).toHaveValue('80');
  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('every tool');
    void dialog.accept();
  });
  await presetsPanel(page).getByRole('button', { name: 'Reset All Tools', exact: true }).click();
  await expect(footer(page)).toContainText('All tool options reset to defaults');
  await expect(page.getByLabel('Exposure', { exact: true })).toHaveValue('50');
  await selectTool(page, 'Gradient');
  await expect(page.getByLabel('Dither', { exact: true })).toHaveValue('0');
  await selectTool(page, 'Brush');
  await expect(page.getByLabel('Hardness', { exact: true })).toHaveValue('100');
});

test('presets survive reload and other tools’ presets switch tools from the all-tools view', async ({ page }) => {
  await selectTool(page, 'Eraser');
  await setSlider(page, 'Hardness', '20');
  await savePreset(page, 'Feather erase');
  await selectTool(page, 'Brush');
  await setSlider(page, 'Hardness', '70');
  await savePreset(page, 'Firm brush');
  const stored = await page.evaluate(() => window.localStorage.getItem('pixelforge.tool-presets.v1'));
  expect(JSON.parse(stored!).presets.map((preset: { label: string }) => preset.label)).toEqual(['Feather erase', 'Firm brush']);

  await page.reload();
  await ready(page);
  await selectTool(page, 'Brush');
  await openPresets(page);
  // Only the current tool's presets by default.
  await expect(applyButton(page, 'Firm brush')).toBeVisible();
  await expect(applyButton(page, 'Feather erase')).toHaveCount(0);
  await presetsPanel(page).getByLabel('Show presets for all tools', { exact: true }).check();
  await expect(applyButton(page, 'Feather erase')).toBeVisible();
  await applyButton(page, 'Feather erase').click();
  await expect(footer(page)).toContainText('Tool preset “Feather erase” applied to Eraser');
  await expect(status(page)).toContainText('Eraser · Feather erase');
  await expect(page.getByLabel('Hardness', { exact: true })).toHaveValue('20');

  // Search filters by preset and tool name.
  await openPresets(page);
  const search = presetsPanel(page).getByLabel('Search tool presets', { exact: true });
  await search.fill('firm');
  await expect(applyButton(page, 'Firm brush')).toBeVisible();
  await expect(applyButton(page, 'Feather erase')).toHaveCount(0);
  await search.fill('nothing like this');
  await expect(page.getByTestId('tool-presets-empty')).toContainText('No presets match');
});

test('rename, duplicate, reorder, update and delete presets', async ({ page }) => {
  await selectTool(page, 'Brush');
  await setSlider(page, 'Hardness', '10');
  await savePreset(page, 'First');
  await setSlider(page, 'Hardness', '60');
  await savePreset(page, 'Second');
  const panel = presetsPanel(page);
  const names = () => panel.locator('.tool-presets-name').allTextContents();
  expect(await names()).toEqual(['First', 'Second']);

  // Rename inline.
  await applyButton(page, 'First').click();
  await panel.getByRole('button', { name: 'Rename preset', exact: true }).click();
  await panel.getByLabel('New preset name', { exact: true }).fill('Base wash');
  await panel.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(footer(page)).toContainText('Tool preset renamed to “Base wash”');
  expect(await names()).toEqual(['Base wash', 'Second']);

  // Duplicate lands after the original.
  await applyButton(page, 'Base wash').click();
  await panel.getByRole('button', { name: 'Duplicate preset', exact: true }).click();
  await expect.poll(names).toEqual(['Base wash', 'Base wash copy', 'Second']);

  // Move with buttons and with Alt+Arrow keys.
  await applyButton(page, 'Second').click();
  await panel.getByRole('button', { name: 'Move preset up', exact: true }).click();
  await expect.poll(names).toEqual(['Base wash', 'Second', 'Base wash copy']);
  await applyButton(page, 'Second').focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(names).toEqual(['Second', 'Base wash', 'Base wash copy']);
  await expect(panel.getByRole('button', { name: 'Move preset up', exact: true })).toBeDisabled();

  // Update from current options clears the modified badge.
  await applyButton(page, 'Base wash copy').click();
  await expect(page.getByLabel('Hardness', { exact: true })).toHaveValue('10');
  await setSlider(page, 'Hardness', '33');
  await expect(modified(page)).toBeVisible();
  await panel.getByRole('button', { name: 'Update preset from current options', exact: true }).click();
  await expect(footer(page)).toContainText('Tool preset “Base wash copy” updated from the current options');
  await expect(modified(page)).toHaveCount(0);
  await setSlider(page, 'Hardness', '90');
  await applyButton(page, 'Base wash copy').click();
  await expect(page.getByLabel('Hardness', { exact: true })).toHaveValue('33');

  // Delete asks first.
  page.once('dialog', (dialog) => dialog.dismiss());
  await panel.getByRole('button', { name: 'Delete preset', exact: true }).click();
  expect(await names()).toHaveLength(3);
  page.once('dialog', (dialog) => dialog.accept());
  await panel.getByRole('button', { name: 'Delete preset', exact: true }).click();
  await expect(footer(page)).toContainText('Tool preset “Base wash copy” deleted');
  await expect.poll(names).toEqual(['Second', 'Base wash']);
  await expect(status(page)).toContainText('Brush · No preset applied');
});

test('drag and drop reorders presets', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Touch reordering uses the Move buttons, covered above');
  await selectTool(page, 'Brush');
  for (const name of ['One', 'Two', 'Three']) await savePreset(page, name);
  const panel = presetsPanel(page);
  await panel.locator('li[data-preset-id]').nth(2).dragTo(panel.locator('li[data-preset-id]').nth(0));
  await expect.poll(() => panel.locator('.tool-presets-name').allTextContents()).toEqual(['Three', 'One', 'Two']);
});

test('export and import a preset file, rejecting invalid files', async ({ page }) => {
  await selectTool(page, 'Brush');
  await setSlider(page, 'Hardness', '25');
  await savePreset(page, 'Portable', { includeColor: true });
  const pending = page.waitForEvent('download');
  await presetsPanel(page).getByRole('button', { name: 'Export', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('pixelforge-tool-presets.json');
  const text = await readFile((await download.path())!, 'utf8');
  const exported = JSON.parse(text);
  expect(exported.format).toBe('pixelforge-tool-presets');
  expect(exported.presets).toHaveLength(1);
  expect(exported.presets[0].settings.hardness).toBe(25);
  expect(exported.presets[0].settings.color).toMatch(/^#[0-9a-f]{6}$/);

  const input = presetsPanel(page).getByLabel('Import tool presets file', { exact: true });
  await input.setInputFiles({ name: 'presets.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(footer(page)).toContainText('Imported 1 tool preset');
  await expect(presetsPanel(page).locator('.tool-presets-name')).toHaveText(['Portable', 'Portable']);

  await input.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(footer(page)).toContainText('The file is not a PixelForge tool preset export');
  const withInvalid = JSON.stringify({ ...exported, presets: [{ ...exported.presets[0], settings: { hardness: 900 } }] });
  await input.setInputFiles({ name: 'mixed.json', mimeType: 'application/json', buffer: Buffer.from(withInvalid) });
  await expect(footer(page)).toContainText('Imported 0 tool presets; 1 invalid skipped');
  await expect(presetsPanel(page).locator('.tool-presets-name')).toHaveCount(2);
});

test('tool presets are keyboard operable and fit the layout', async ({ page }) => {
  await selectTool(page, 'Smudge');
  await expect(status(page)).toContainText('Smudge · No preset applied');
  await trigger(page).focus();
  await page.keyboard.press('Enter');
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
  const name = presetsPanel(page).getByLabel('New tool preset name', { exact: true });
  await name.focus();
  // Typing in the panel must not trigger tool shortcuts (B would select Brush).
  await page.keyboard.type('Big blend');
  await page.keyboard.press('Enter');
  await expect(footer(page)).toContainText('Tool preset “Big blend” saved on this device');
  await expect(status(page)).toContainText('Smudge · Big blend');
  // Colour is not a Smudge option, so the include-colour option is disabled.
  await expect(presetsPanel(page).getByLabel('Include colour', { exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger(page)).toBeFocused();

  await openPresets(page);
  const viewport = page.viewportSize()!;
  const box = (await presetsPanel(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const label of ['Reset Tool', 'Reset All Tools', 'Export', 'Import…']) {
    const button = (await presetsPanel(page).getByRole('button', { name: label, exact: true }).boundingBox())!;
    expect(button.x + button.width).toBeLessThanOrEqual(box.x + box.width + 1);
    expect(button.height).toBeGreaterThanOrEqual(32);
  }
});

test('tools without options show no presets control', async ({ page }) => {
  await selectTool(page, 'Eyedropper');
  await expect(presetsPanel(page)).toHaveCount(0);
  await selectTool(page, 'Horizontal Type');
  await expect(status(page)).toContainText('Text · No preset applied');
  await selectTool(page, 'Select');
  await expect(status(page)).toContainText('Rectangular Marquee · No preset applied');
});
