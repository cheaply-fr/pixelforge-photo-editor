import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';

type Run = { length: number; style?: Record<string, unknown> };
type TextLayer = {
  id: string;
  kind: 'text';
  name: string;
  text: string;
  textMode?: 'point' | 'paragraph';
  boxWidth: number;
  boxHeight?: number;
  fontSize: number;
  matrix: number[];
  orientation?: string;
  antiAlias?: string;
  rich?: { version: number; runs: Run[] };
  paragraph?: { list: string; justify: string; indentLeft: number };
};
type Project = { history: Array<{ layers: Array<{ kind: string } & Partial<TextLayer>>; selection?: unknown }>; index: number };

const editor = (page: Page) => page.getByLabel('Type layer text editor', { exact: true });
const overlay = (page: Page) => page.getByTestId('type-editor');
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

const open = async (page: Page) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
};

const project = async (page: Page): Promise<Project> => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return await downloadedProject((await (await pending).path())!) as Project;
};
const textLayers = (saved: Project) =>
  saved.history[saved.index].layers.filter((layer) => layer.kind === 'text') as TextLayer[];

/** Overlay-relative point at a fraction of the canvas. */
const at = async (page: Page, fx: number, fy: number) => {
  const canvas = page.getByTestId('editor-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
};
const clickCanvas = async (page: Page, fx: number, fy: number) => {
  const p = await at(page, fx, fy);
  await page.mouse.click(p.x, p.y);
};
const dragCanvas = async (page: Page, from: [number, number], to: [number, number]) => {
  const a = await at(page, ...from), b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
};
const startType = async (page: Page, starter = '') => {
  await selectTool(page, 'Horizontal Type');
  await page.getByLabel('Text content', { exact: true }).fill(starter);
};
/** Ink bounds of the visible canvas (rendered text pixels). */
const ink = (page: Page) => page.getByTestId('editor-canvas').evaluate((node) => {
  const canvas = node as HTMLCanvasElement;
  const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width, top = canvas.height, right = -1, bottom = -1, count = 0;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    if (data[(y * canvas.width + x) * 4 + 3] < 128) continue;
    count++;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return { left, top, right, bottom, count };
});
const settle = async (page: Page) => expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');

test.beforeEach(async ({ page }) => open(page));

test('click creates point type: type, commit, undo/redo and reload as one step', async ({ page }) => {
  await startType(page, '');
  await clickCanvas(page, 0.2, 0.3);
  await expect(overlay(page)).toHaveAttribute('data-editing', 'true');
  await expect(overlay(page)).toHaveAttribute('data-mode', 'point');
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type('Hello');
  await page.keyboard.press('Enter');
  await page.keyboard.type('World');
  await expect(overlay(page)).toHaveAttribute('data-lines', '2');
  await settle(page);
  expect((await ink(page)).count).toBeGreaterThan(50);
  await page.keyboard.press(`${mod}+Enter`);
  // Committing hands the new type layer to the Move tool.
  await expect(page.getByRole('button', { name: 'Move tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.layer-row, [data-layer-id]').filter({ hasText: 'Hello World' }).first()).toBeVisible();
  let saved = await project(page);
  let layers = textLayers(saved);
  expect(layers).toHaveLength(1);
  expect(layers[0]).toMatchObject({ text: 'Hello\nWorld', textMode: 'point', name: 'Hello World' });

  // One undo removes the whole new type layer; redo restores it.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await settle(page);
  expect((await ink(page)).count).toBe(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await settle(page);
  expect((await ink(page)).count).toBeGreaterThan(50);

  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  saved = await project(page);
  layers = textLayers(saved);
  expect(layers[0].text).toBe('Hello\nWorld');
});

test('drag creates paragraph type that wraps, rewraps on resize and flags overflow', async ({ page }) => {
  await startType(page, '');
  await dragCanvas(page, [0.1, 0.1], [0.45, 0.6]);
  await expect(overlay(page)).toHaveAttribute('data-mode', 'paragraph');
  await editor(page).fill('The quick brown fox jumps over the lazy dog again and again');
  const wrapped = Number(await overlay(page).getAttribute('data-lines'));
  expect(wrapped).toBeGreaterThan(1);
  // Drag the east handle outward: the text rewraps into fewer lines.
  const handle = overlay(page).locator('[data-handle="e"]');
  const box = (await handle.boundingBox())!;
  const target = await at(page, 0.95, 0.35);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Number(await overlay(page).getAttribute('data-lines'))).toBeLessThan(wrapped);
  // Shrinking the bottom edge hides lines and shows the overflow marker.
  const south = overlay(page).locator('[data-handle="s"]');
  const sbox = (await south.boundingBox())!;
  const top = await at(page, 0.5, 0.115);
  await page.mouse.move(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sbox.x + sbox.width / 2, top.y, { steps: 6 });
  await page.mouse.up();
  await expect(overlay(page)).toHaveAttribute('data-overflow', 'true');
  await expect(page.getByTestId('type-overflow')).toBeVisible();
  await page.getByRole('button', { name: 'Commit type', exact: true }).click();
  const layer = textLayers(await project(page))[0];
  expect(layer.textMode).toBe('paragraph');
  expect(layer.fontSize).toBe(56);
  expect(layer.boxWidth).toBeGreaterThan(300);
  expect(layer.boxHeight).toBeLessThan(80);
});

test('Escape cancels new type and edits; clicking outside commits', async ({ page }) => {
  await startType(page, '');
  await clickCanvas(page, 0.3, 0.3);
  await page.keyboard.type('Discard me');
  await page.keyboard.press('Escape');
  await expect(overlay(page)).toHaveAttribute('data-editing', 'false');
  expect(textLayers(await project(page))).toHaveLength(0);

  await clickCanvas(page, 0.3, 0.3);
  await page.keyboard.type('Keep me');
  await clickCanvas(page, 0.9, 0.9);
  await expect(page.getByRole('button', { name: 'Move tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(textLayers(await project(page)).map((layer) => layer.text)).toEqual(['Keep me']);

  // Edit existing type, then cancel: the committed text is unchanged.
  await selectTool(page, 'Horizontal Type');
  await clickCanvas(page, 0.31, 0.29);
  await expect(overlay(page)).toHaveAttribute('data-editing', 'true');
  await page.keyboard.press('End');
  await page.keyboard.type(' more');
  await page.keyboard.press('Escape');
  expect(textLayers(await project(page)).map((layer) => layer.text)).toEqual(['Keep me']);
});

test('caret navigation, selection, styling shortcuts and in-session undo', async ({ page }) => {
  await startType(page, '');
  await clickCanvas(page, 0.1, 0.3);
  await page.keyboard.type('alpha beta gamma');
  await page.keyboard.press('Home');
  await expect(overlay(page)).toHaveAttribute('data-selection-start', '0');
  await page.keyboard.press(`${mod}+ArrowRight`);
  await expect(overlay(page)).not.toHaveAttribute('data-selection-start', '0');
  await page.keyboard.press('Home');
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+End');
  await expect(overlay(page)).toHaveAttribute('data-selection-start', '6');
  await expect(overlay(page)).toHaveAttribute('data-selection-end', '16');
  await page.keyboard.press(`${mod}+b`);
  await page.keyboard.press(`${mod}+i`);
  await page.keyboard.press(`${mod}+u`);
  await page.keyboard.press(`${mod}+Shift+Period`);
  // In-session undo reverts the size step, redo re-applies it.
  await page.keyboard.press(`${mod}+z`);
  await page.keyboard.press(`${mod}+Shift+z`);
  await page.keyboard.press(`${mod}+Enter`);
  const layer = textLayers(await project(page))[0];
  expect(layer.text).toBe('alpha beta gamma');
  expect(layer.rich?.runs).toEqual([
    { length: 6 },
    { length: 10, style: { fontWeight: 700, italic: true, underline: true, fontSize: 58 } },
  ]);
});

test('Character panel colours a selected range and Paragraph panel adds a numbered list', async ({ page }) => {
  await startType(page, '');
  await dragCanvas(page, [0.1, 0.1], [0.8, 0.7]);
  await editor(page).fill('First item\nSecond item');
  await editor(page).evaluate((node: HTMLTextAreaElement) => {
    node.setSelectionRange(0, 5);
    node.dispatchEvent(new Event('select', { bubbles: true }));
  });
  await expect(overlay(page)).toHaveAttribute('data-selection-end', '5');
  await page.getByLabel('Character colour', { exact: true }).fill('#00aa44');
  await page.locator('details.type-panel summary', { hasText: 'Paragraph' }).click();
  await page.getByRole('button', { name: 'Numbered list', exact: true }).click();
  await expect(editor(page)).toBeFocused();
  await page.getByLabel('Paragraph anti-aliasing', { exact: true }).selectOption('none');
  await page.getByRole('button', { name: 'Commit type', exact: true }).click();
  const saved = await project(page);
  const layer = textLayers(saved)[0];
  expect(layer.rich?.runs[0]).toEqual({ length: 5, style: { color: '#00aa44' } });
  expect(layer.paragraph?.list).toBe('number');
  expect(layer.antiAlias).toBe('none');
  // Project round trip keeps the rich runs.
  await page.getByTestId('project-input').setInputFiles({
    name: 'rich.pixelforge', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(page.getByText('Project opened with editable layers and history', { exact: true })).toBeVisible();
  expect(textLayers(await project(page))[0].rich?.runs[0]).toEqual({ length: 5, style: { color: '#00aa44' } });
});

test('clipboard copy/paste, IME composition and glyph insertion reach the editor', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
  await startType(page, '');
  await clickCanvas(page, 0.1, 0.3);
  await page.keyboard.type('copy');
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press(`${mod}+c`);
  await page.keyboard.press('End');
  await page.keyboard.press(`${mod}+v`);
  await expect.poll(async () => editor(page).inputValue()).toBe('copycopy');
  // IME-like composition: intermediate values preview, the final value commits.
  await editor(page).evaluate((node: HTMLTextAreaElement) => {
    node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    node.value = 'copycopyに';
    node.setSelectionRange(9, 9);
    node.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    node.value = 'copycopy日本';
    node.setSelectionRange(10, 10);
    node.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '日本' }));
  });
  await expect(overlay(page)).toHaveAttribute('data-selection-end', '10');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('pixelforge:insert-text', { detail: { text: '©' } })));
  await page.evaluate(() => (window as Window & { pixelforgeType?: { insertTextAtCaret: (text: string) => boolean } }).pixelforgeType?.insertTextAtCaret('™'));
  await expect.poll(async () => editor(page).inputValue()).toBe('copycopy日本©™');
  // Glyphs… opens the font library's Glyphs panel.
  await page.getByRole('button', { name: 'Glyphs…', exact: true }).click();
  const glyphs = page.getByRole('dialog', { name: 'Glyphs, icons & symbols' });
  await expect(glyphs).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(glyphs).toBeHidden();
  expect(textLayers(await project(page))[0].text).toBe('copycopy日本©™');
});

test('existing type is edited by clicking with the Type tool or double-clicking with Move', async ({ page }) => {
  await startType(page, 'Edit me');
  await clickCanvas(page, 0.2, 0.3);
  await page.keyboard.press(`${mod}+Enter`);
  // The commit switched to Move; return to the Type tool and click into the
  // type: the caret lands inside and typing inserts there.
  await selectTool(page, 'Horizontal Type');
  await clickCanvas(page, 0.2, 0.29);
  await expect(overlay(page)).toHaveAttribute('data-editing', 'true');
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await page.keyboard.press(`${mod}+Enter`);
  expect(textLayers(await project(page))[0].text).toBe('Edit me!');
  await selectTool(page, 'Move');
  const p = await at(page, 0.21, 0.29);
  await page.getByTestId('editor-canvas').dblclick({ position: { x: p.x - (await page.getByTestId('editor-canvas').boundingBox())!.x, y: p.y - (await page.getByTestId('editor-canvas').boundingBox())!.y } });
  await expect(page.getByRole('button', { name: 'Horizontal Type tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(overlay(page)).toHaveAttribute('data-editing', 'true');
  await page.keyboard.press('End');
  await page.keyboard.type('?');
  await page.keyboard.press(`${mod}+Enter`);
  const layers = textLayers(await project(page));
  expect(layers).toHaveLength(1);
  expect(layers[0]).toMatchObject({ text: 'Edit me!?', name: 'Edit me!?' });
});

test('Type family: vertical type, type mask selection and T shortcut cycling', async ({ page }) => {
  await selectTool(page, 'Vertical Type');
  await page.getByLabel('Text content', { exact: true }).fill('');
  await clickCanvas(page, 0.5, 0.1);
  await page.keyboard.type('ABC');
  await page.keyboard.press(`${mod}+Enter`);
  const vertical = textLayers(await project(page))[0];
  expect(vertical).toMatchObject({ text: 'ABC', orientation: 'vertical' });

  await selectTool(page, 'Horizontal Type Mask');
  await clickCanvas(page, 0.1, 0.6);
  await page.keyboard.type('MASK');
  await expect(overlay(page)).toHaveAttribute('data-mask', 'true');
  await page.keyboard.press(`${mod}+Enter`);
  await expect(page.getByText('Horizontal Type Mask selection created', { exact: true })).toBeVisible();
  const saved = await project(page);
  expect(textLayers(saved)).toHaveLength(1);
  expect(saved.history[saved.index].selection).toBeTruthy();
});

test('Convert to paragraph/point text, presets, find & replace keep styles', async ({ page }) => {
  await startType(page, '');
  await clickCanvas(page, 0.1, 0.3);
  await page.keyboard.type('red green');
  await page.keyboard.press('Shift+Home');
  await page.getByLabel('Character colour', { exact: true }).fill('#ff0000');
  await page.getByRole('button', { name: 'Commit type', exact: true }).click();
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Convert to Paragraph Text', exact: true }).click();
  let layer = textLayers(await project(page))[0];
  expect(layer.textMode).toBe('paragraph');
  expect(layer.boxHeight).toBeGreaterThan(40);
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Convert to Point Text', exact: true }).click();
  layer = textLayers(await project(page))[0];
  expect(layer.textMode).toBe('point');

  // Presets: save the paragraph look, apply it to another layer. The commit
  // above switched to Move, so return to the Type tool for its panels.
  await selectTool(page, 'Horizontal Type');
  await page.locator('details.type-panel summary', { hasText: 'Type presets' }).click();
  await page.getByLabel('Type preset name', { exact: true }).fill('Headline');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply type preset Headline', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /Find and Replace/ }).click();
  await page.getByLabel('Find text', { exact: true }).fill('green');
  await page.getByLabel('Replace text', { exact: true }).fill('blue');
  await page.getByRole('button', { name: /Replace all/i }).click();
  layer = textLayers(await project(page))[0];
  expect(layer.text).toBe('red blue');
  expect(layer.rich?.runs.reduce((sum, run) => sum + run.length, 0)).toBe(8);
});

test('touch: tapping places type, focuses the keyboard input and the options bar fits', async ({ page, browserName }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'touch path runs on the mobile project');
  expect(browserName).toBe('chromium');
  await startType(page, '');
  const canvas = page.getByTestId('editor-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width * 0.2, box.y + box.height * 0.4);
  await expect(overlay(page)).toHaveAttribute('data-editing', 'true');
  // The hidden textarea owns focus, so the virtual keyboard targets it.
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type('Tap');
  await expect(editor(page)).toHaveValue('Tap');
  const bar = (await page.getByTestId('type-options-bar').boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(bar.x).toBeGreaterThanOrEqual(0);
  expect(bar.x + bar.width).toBeLessThanOrEqual(viewport.width + 1);
  await page.getByRole('button', { name: 'Commit type', exact: true }).tap();
  expect(textLayers(await project(page))[0].text).toBe('Tap');
});

test('editing a 2,000-character paragraph stays responsive', async ({ page }) => {
  await startType(page, '');
  await dragCanvas(page, [0.05, 0.05], [0.95, 0.95]);
  const text = Array.from({ length: 400 }, (_, index) => `word${index % 9}`).join(' ').slice(0, 2000);
  await editor(page).fill(text);
  await expect(overlay(page)).toHaveAttribute('data-selection-end', '2000');
  const started = Date.now();
  await page.keyboard.type('abcdefghij', { delay: 0 });
  await expect(overlay(page)).toHaveAttribute('data-selection-end', '2010');
  const elapsed = Date.now() - started;
  expect(elapsed).toBeLessThan(4000);
  await page.keyboard.press(`${mod}+Enter`);
  expect(textLayers(await project(page))[0].text).toHaveLength(2010);
});

test('committing type switches to Move so a drag moves the text; Escape keeps the Type tool', async ({ page }) => {
  await startType(page, '');
  await clickCanvas(page, 0.25, 0.3);
  await page.keyboard.type('Drag me');
  // Escape on new type cancels it and stays on the Type tool.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Horizontal Type tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(textLayers(await project(page))).toHaveLength(0);

  await clickCanvas(page, 0.25, 0.3);
  await page.keyboard.type('Drag me');
  await page.getByRole('button', { name: 'Commit type', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Move tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const before = textLayers(await project(page));
  expect(before).toHaveLength(1);
  const [x0, y0] = [before[0].matrix[4], before[0].matrix[5]];

  // The committed layer stays selected, so a drag on the canvas moves it.
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  const scale = await canvas.evaluate((element: HTMLCanvasElement) => element.getBoundingClientRect().width / element.width);
  const start = { x: box.x + box.width * 0.27, y: box.y + box.height * 0.29 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 40, start.y + 30, { steps: 8 });
  await page.mouse.up();
  await settle(page);
  const after = textLayers(await project(page));
  expect(after).toHaveLength(1);
  expect(after[0].text).toBe('Drag me');
  expect(Math.round(after[0].matrix[4] - x0)).toBeGreaterThan(Math.floor((40 / scale) * 0.8));
  expect(Math.round(after[0].matrix[5] - y0)).toBeGreaterThan(Math.floor((30 / scale) * 0.8));

  // Pressing T returns to the Type tool and a click edits the moved text.
  await selectTool(page, 'Horizontal Type');
  await expect(page.getByRole('button', { name: 'Horizontal Type tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('selecting a text layer reveals the Text section without taking focus; re-selecting does not scroll again', async ({ page }) => {
  await startType(page, '');
  await clickCanvas(page, 0.2, 0.3);
  await page.keyboard.type('Reveal me');
  await page.keyboard.press(`${mod}+Enter`);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settle(page);
  await selectTool(page, 'Brush');
  const inspector = page.locator('aside.inspector');
  const textSectionTop = () =>
    inspector.evaluate((container) => {
      const section = container.querySelector('[data-sidebar-section="text"]');
      if (!section) return null;
      return section.getBoundingClientRect().top - container.getBoundingClientRect().top;
    });
  const inView = async () => {
    const top = await textSectionTop();
    const height = await inspector.evaluate((container) => container.clientHeight);
    return top !== null && top >= -4 && top < height - 24;
  };
  // Park the sidebar away from the Text section.
  await inspector.evaluate((container) => { container.scrollTop = container.scrollHeight; });
  const row = page.getByRole('button', { name: 'Select layer Reveal me', exact: true });
  await row.click();
  await expect.poll(inView).toBe(true);
  // The click's focus stays on the layer row; the reveal never moves focus.
  await expect(row).toBeFocused();

  // Reading elsewhere: re-selecting the same layer does not scroll back.
  await inspector.evaluate((container) => { container.scrollTop = container.scrollHeight; });
  const parked = await inspector.evaluate((container) => container.scrollTop);
  // A DOM click: Playwright would first scroll the off-screen row into view.
  await row.evaluate((element: HTMLElement) => element.click());
  await page.waitForTimeout(400);
  expect(await inspector.evaluate((container) => container.scrollTop)).toBe(parked);
});

test('the Text sidebar Font and Size edit the selected text layer and the live edit', async ({ page }) => {
  const section = page.locator('[data-sidebar-section="text"]');
  const font = section.getByLabel('Text tool font', { exact: true });
  const size = section.getByRole('slider', { name: 'Size', exact: true });
  await startType(page, '');
  // No layer selected: the top controls set the defaults for new type.
  await font.selectOption('Georgia');
  await size.fill('60');
  await clickCanvas(page, 0.2, 0.3);
  await page.keyboard.type('Sidebar font');
  await page.keyboard.press(`${mod}+Enter`);
  await expect(page.getByRole('button', { name: 'Move tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  let [layer] = textLayers(await project(page)) as Array<TextLayer & { fontFamily: string }>;
  expect(layer.fontFamily).toBe('Georgia');
  expect(layer.fontSize).toBe(60);

  // The committed layer stays selected: the top controls now show and edit it,
  // matching the Character panel below.
  await expect(font).toHaveValue('Georgia');
  await font.selectOption('Verdana');
  await expect(section.getByLabel('Character font family', { exact: true })).toHaveValue('Verdana');
  await size.fill('90');
  await expect(section.getByLabel('Font size', { exact: true })).toHaveValue('90');
  await settle(page);
  [layer] = textLayers(await project(page)) as Array<TextLayer & { fontFamily: string }>;
  expect(layer.fontFamily).toBe('Verdana');
  expect(layer.fontSize).toBe(90);
  expect(textLayers(await project(page))).toHaveLength(1);

  // During an edit they style the selected characters without committing it.
  await selectTool(page, 'Horizontal Type');
  await clickCanvas(page, 0.22, 0.31);
  await expect(overlay(page)).toBeVisible();
  await page.keyboard.press(`${mod}+A`);
  await font.selectOption('Courier New');
  await expect(overlay(page)).toBeVisible();
  await expect(font).toHaveValue('Courier New');
  await page.getByRole('button', { name: 'Commit type', exact: true }).click();
  await settle(page);
  const saved = textLayers(await project(page)) as Array<TextLayer & { fontFamily: string }>;
  expect(saved).toHaveLength(1);
  const runs = saved[0].rich?.runs ?? [];
  const families = new Set([saved[0].fontFamily, ...runs.map((run) => run.style?.fontFamily).filter(Boolean)]);
  expect(saved[0].fontFamily === 'Courier New' || (runs.length > 0 && runs.every((run) => run.style?.fontFamily === 'Courier New'))).toBe(true);
  expect(families.has('Courier New')).toBe(true);
});

// The live pane animates the reveal (no reduced motion) and the Text section
// is taller than the sidebar: its header must still land at the top, whatever
// tool is active (the Type tool's own section changes height on selection).
test('selecting a text layer lands the tall Text section header at the top of the sidebar', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) <= 680, 'desktop sidebar column');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await startType(page, '');
  await clickCanvas(page, 0.2, 0.3);
  await page.keyboard.type('Reveal me');
  await page.keyboard.press(`${mod}+Enter`);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settle(page);
  const inspector = page.locator('aside.inspector');
  const textSection = () => inspector.evaluate((container) => {
    const section = container.querySelector('[data-sidebar-section="text"]');
    if (!section) return null;
    const box = section.getBoundingClientRect();
    return { top: Math.round(box.top - container.getBoundingClientRect().top), height: box.height, client: container.clientHeight };
  });
  for (const tool of ['Horizontal Type', 'Move', 'Brush']) {
    await selectTool(page, tool);
    await page.getByRole('button', { name: /^Select layer (?!Reveal me$)/ }).first().click();
    await page.getByRole('button', { name: 'Select layer Reveal me', exact: true }).click();
    await expect.poll(async () => Math.abs((await textSection())?.top ?? 999), { message: tool }).toBeLessThanOrEqual(1);
    const geometry = await textSection();
    expect(geometry!.height).toBeGreaterThan(geometry!.client * 0.5);
  }
});
