import { expect, test, type Page } from '@playwright/test';
import { clickCanvas, dragOnCanvas, highlight, menu, openEditor, openSample, selectTool, shoot } from './helpers';

// Type category screenshots (help/articles: add-text, edit-text-on-canvas,
// character-and-paragraph, font-library-and-glyphs, vertical-type-and-type-masks,
// text-on-path-and-warp, type-styles, find-replace-and-spellcheck).

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const settle = (page: Page) => expect(canvas(page)).toHaveAttribute('data-rendering', 'false');

/** Choose a type tool and set the size and colour used for new type. */
async function typeTool(page: Page, tool = 'Horizontal Type', size = '150', colour = '#ffffff') {
  await selectTool(page, tool);
  const sizeField = page.getByRole('spinbutton', { name: 'Type font size', exact: true });
  await sizeField.fill(size);
  await sizeField.press('Enter');
  await page.getByRole('textbox', { name: 'Type colour', exact: true }).fill(colour);
}

/** Add committed point type at a canvas fraction. */
async function addType(page: Page, text: string, at: [number, number], options: { tool?: string; size?: string; colour?: string } = {}) {
  await typeTool(page, options.tool, options.size, options.colour);
  await clickCanvas(page, at);
  await expect(page.getByTestId('type-editor')).toHaveAttribute('data-editing', 'true');
  await page.keyboard.type(text);
  await page.keyboard.press('Control+Enter');
  await settle(page);
}

test('type-editing-on-canvas', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await typeTool(page);
  await clickCanvas(page, [0.1, 0.32]);
  await page.keyboard.type('Golden hour');
  // Select "hour" to show that the Character panel edits the selected characters.
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('Shift+ArrowLeft');
  await settle(page);
  await highlight(page.getByRole('button', { name: 'Commit type', exact: true }), page.getByRole('button', { name: 'Cancel type editing', exact: true }));
  await shoot(page, 'type-editing-on-canvas');
});

test('type-paragraph-box', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await typeTool(page, 'Horizontal Type', '64');
  await dragOnCanvas(page, [0.08, 0.12], [0.5, 0.55]);
  await page.getByLabel('Type layer text editor', { exact: true }).fill('Paragraph type wraps inside its box. Drag a side handle to rewrap the lines.');
  await settle(page);
  await shoot(page, 'type-paragraph-box', canvas(page));
});

test('type-character-panel', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await typeTool(page);
  await clickCanvas(page, [0.1, 0.32]);
  await page.keyboard.type('Golden hour');
  await page.keyboard.press('Control+a');
  const group = page.getByRole('group').filter({ has: page.getByRole('combobox', { name: 'Character font style', exact: true }) }).first();
  await shoot(page, 'type-character-panel', group);
});

test('type-paragraph-panel', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await typeTool(page, 'Horizontal Type', '64');
  await dragOnCanvas(page, [0.08, 0.12], [0.5, 0.55]);
  await page.getByLabel('Type layer text editor', { exact: true }).fill('A paragraph of type.');
  await page.getByRole('button', { name: 'Paragraph panel', exact: true }).click();
  const group = page.getByRole('group').filter({ has: page.getByRole('spinbutton', { name: 'Indent left', exact: true }) }).first();
  await expect(group).toBeVisible();
  await shoot(page, 'type-paragraph-panel', group);
});

test('type-opentype-controls', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await addType(page, 'Office', [0.1, 0.32]);
  const group = page.getByRole('group', { name: 'OpenType', exact: true });
  await group.scrollIntoViewIfNeeded();
  await shoot(page, 'type-opentype-controls', group);
});

test('type-font-picker', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Horizontal Type');
  await page.getByRole('button', { name: 'Browse typefaces' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Text tool font' });
  await dialog.getByRole('searchbox', { name: 'Search fonts' }).fill('script');
  await page.waitForTimeout(1500);
  await shoot(page, 'type-font-picker', dialog);
});

test('type-glyphs-panel', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await addType(page, 'Sunset', [0.1, 0.32]);
  await menu(page, 'Type', 'Glyphs, Icons & Symbols…');
  const dialog = page.getByRole('dialog', { name: 'Glyphs, icons & symbols' });
  await dialog.getByRole('searchbox', { name: 'Search glyphs' }).fill('sun');
  await expect(dialog.getByText('Loading glyphs…')).toHaveCount(0);
  await page.waitForTimeout(1500);
  await shoot(page, 'type-glyphs-panel', dialog);
});

test('type-vertical', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await addType(page, 'DUSK', [0.12, 0.12], { tool: 'Vertical Type', size: '120' });
  await shoot(page, 'type-vertical', canvas(page));
});

test('type-mask-selection', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await typeTool(page, 'Horizontal Type Mask', '220');
  await clickCanvas(page, [0.08, 0.45]);
  await page.keyboard.type('DUSK');
  await page.keyboard.press('Control+Enter');
  await settle(page);
  await page.waitForTimeout(600);
  await shoot(page, 'type-mask-selection', canvas(page));
});

test('type-warp-arc', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await addType(page, 'Golden hour', [0.12, 0.35]);
  const answers = ['arc', '60', '0'];
  page.on('dialog', (dialog) => void dialog.accept(answers.shift()));
  await menu(page, 'Type', 'Warp Text…');
  await settle(page);
  await page.waitForTimeout(400);
  await shoot(page, 'type-warp-arc', canvas(page));
});

test('type-on-path', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await selectTool(page, 'Freeform Pen');
  await page.getByRole('combobox', { name: 'Pen mode', exact: true }).selectOption({ label: 'Path (work path, no fill)' });
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 30; i += 1) {
    const t = i / 30;
    await page.mouse.move(box.x + box.width * (0.1 + 0.8 * t), box.y + box.height * (0.6 - 0.35 * Math.sin(Math.PI * t)));
  }
  await page.mouse.up();
  await settle(page);
  await addType(page, 'Follow the curve of the hills', [0.1, 0.85], { size: '70' });
  page.on('dialog', (dialog) => void (dialog.type() === 'confirm' ? dialog.dismiss() : dialog.accept(dialog.defaultValue())));
  await menu(page, 'Type', 'Text on Path…');
  await settle(page);
  await page.waitForTimeout(400);
  await shoot(page, 'type-on-path', canvas(page));
});

test('type-presets', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await addType(page, 'Poster', [0.1, 0.32]);
  await selectTool(page, 'Horizontal Type');
  const group = page.locator('details.type-panel').filter({ hasText: 'Type presets' });
  await group.locator('summary').click();
  await group.scrollIntoViewIfNeeded();
  await page.getByRole('textbox', { name: 'Type preset name', exact: true }).fill('Poster title');
  await group.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(300);
  await shoot(page, 'type-presets', group);
});

test('find-replace-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await addType(page, 'Summer sale', [0.1, 0.32]);
  await menu(page, 'Edit', 'Find and Replace Text…');
  const dialog = page.getByRole('dialog', { name: 'Find and Replace Text' });
  await dialog.getByRole('textbox', { name: 'Find text' }).fill('Summer');
  await dialog.getByRole('textbox', { name: 'Replace text' }).fill('Winter');
  await shoot(page, 'find-replace-dialog', dialog);
});

test('spellcheck-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await addType(page, 'Teh golden hour', [0.1, 0.32]);
  await menu(page, 'Edit', 'Check Spelling…');
  await shoot(page, 'spellcheck-dialog', page.getByRole('dialog', { name: 'Check Spelling' }));
});

test('type-editing-mobile @mobile', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape', { w: 1200, h: 900 });
  await typeTool(page, 'Horizontal Type', '140');
  await clickCanvas(page, [0.15, 0.3]);
  await page.keyboard.type('Dusk');
  await settle(page);
  await shoot(page, 'type-editing-mobile');
});
