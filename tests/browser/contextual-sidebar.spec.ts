import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';
import { closePanels, openPanel } from './sidebar-panels';

// Contract: docs/contextual-sidebar-contract.md. The properties sidebar shows
// only the active tool's options, the Layers panel and a "More panels" strip
// with at most one open panel, remembered per tool.

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const inspector = (page: Page) => page.locator('aside.inspector');
const toolArea = (page: Page) => page.getByTestId('tool-options-area');
const openPanelBody = (page: Page, panel: string) => page.locator(`#sidebar-open-panel[data-sidebar-open-panel="${panel}"]`);

/** A control (or text) that only one tool's options render. */
type Marker = { role?: 'combobox' | 'button' | 'textbox'; name: string };
const MARKERS: Record<string, Marker> = {
  Brush: { role: 'combobox', name: 'Brush preset' },
  Text: { role: 'textbox', name: 'Text content' },
  Gradient: { role: 'combobox', name: 'Gradient type' },
  Move: { role: 'button', name: 'Align left' },
  Select: { role: 'combobox', name: 'Selection mode' },
  Clone: { name: 'Option/Alt-click the canvas to set' },
  Crop: { role: 'combobox', name: 'Crop aspect ratio' },
};

const marker = (page: Page, key: string) => {
  const { role, name } = MARKERS[key];
  return role
    ? inspector(page).getByRole(role, { name, exact: true })
    : inspector(page).getByText(name);
};

/** Labels of large panels that must never be stacked in the default sidebar. */
const PANEL_ONLY_CONTROLS = [
  { role: 'combobox', name: 'Filter effect' },
  { role: 'checkbox', name: 'Enable drop shadow' },
  { role: 'slider', name: 'Brightness' },
  { role: 'button', name: 'Rotate left' },
  { role: 'textbox', name: 'Saved selection name' },
] as const;

test('each tool shows only its own options; other tools and large panels are absent', async ({ page }) => {
  const cases: Array<[string, string | null]> = [
    ['Brush', 'Brush'],
    ['Horizontal Type', 'Text'],
    ['Gradient', 'Gradient'],
    ['Move', 'Move'],
    ['Crop', 'Crop'],
    ['Hand', null],
    ['Select', 'Select'],
    ['Clone', 'Clone'],
  ];
  for (const [tool, own] of cases) {
    await selectTool(page, tool);
    await expect(inspector(page)).toHaveAttribute('data-sidebar-tool', /.+/);
    await expect(toolArea(page)).toHaveAccessibleName(`${tool} tool options`);
    for (const key of Object.keys(MARKERS)) {
      if (key === own) await expect(marker(page, key), `${tool} shows ${key}`).toBeVisible();
      else await expect(marker(page, key), `${tool} hides ${key}`).toHaveCount(0);
    }
    if (own === null) await expect(page.getByTestId('tool-options-empty')).toBeVisible();
    else await expect(page.getByTestId('tool-options-empty')).toHaveCount(0);
    // Always-relevant: Layers with the active layer's essentials.
    await expect(inspector(page).getByRole('region', { name: 'Layers', exact: true })).toBeVisible();
    await expect(inspector(page).getByRole('slider', { name: 'Layer opacity' })).toBeVisible();
    await expect(inspector(page).getByRole('combobox', { name: 'Blend mode', exact: true })).toBeVisible();
    for (const control of PANEL_ONLY_CONTROLS)
      await expect(inspector(page).getByRole(control.role, { name: control.name, exact: true })).toHaveCount(0);
  }
});

test('a retouch and a selection tool show their own sections only', async ({ page }) => {
  await selectTool(page, 'Spot Healing');
  await expect(toolArea(page).locator('[data-sidebar-section]')).toHaveCount(1);
  await expect(toolArea(page).locator('[data-sidebar-section="tool-options"]')).toBeVisible();
  await selectTool(page, 'Quick Selection');
  const sections = toolArea(page).locator('[data-sidebar-section]');
  await expect(sections).toHaveCount(2);
  await expect(toolArea(page).locator('[data-sidebar-section="selection-options"]')).toBeVisible();
  await selectTool(page, 'Lasso');
  await expect(toolArea(page).locator('[data-sidebar-section="selection-options"]')).toBeVisible();
  await expect(toolArea(page).locator('[data-sidebar-section="tool-options"]')).toHaveCount(0);
});

test('the sidebar is bounded: tool options, Layers, the strip and at most one panel', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop geometry');
  await page.setViewportSize({ width: 1280, height: 800 });
  const heights: Record<string, { scrollHeight: number; clientHeight: number }> = {};
  for (const tool of ['Hand', 'Move', 'Select', 'Crop', 'Horizontal Type', 'Gradient', 'Clone', 'Brush']) {
    await selectTool(page, tool);
    const geometry = await inspector(page).evaluate((element) => {
      const body = element.querySelector('.inspector-body')!;
      const visible = Array.from(body.children).filter((child) => (child as HTMLElement).getClientRects().length > 0);
      return {
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        blocks: visible.map((child) => child.getAttribute('aria-label') ?? child.getAttribute('data-testid') ?? child.className),
        sections: element.querySelectorAll('[data-sidebar-section]').length,
      };
    });
    heights[tool] = { scrollHeight: geometry.scrollHeight, clientHeight: geometry.clientHeight };
    // Tool area + Layers + More panels strip; no panel is open by default.
    expect(geometry.blocks, tool).toHaveLength(3);
    // Layers, Layer properties and the tool's own sections (≤ 2) only.
    expect(geometry.sections, tool).toBeLessThanOrEqual(4);
    // The legacy sidebar stacked every panel (≥ 7 300 px at this size).
    const compact = ['Hand', 'Move', 'Select', 'Crop'].includes(tool);
    expect(geometry.scrollHeight, tool).toBeLessThan(compact ? 1.8 * geometry.clientHeight : 4000);
  }
  testInfo.annotations.push({ type: 'sidebar-heights', description: JSON.stringify(heights) });
});

test('the More panels strip opens one panel at a time and toggles it closed', async ({ page }) => {
  await selectTool(page, 'Move');
  const strip = page.getByRole('group', { name: 'More panels' });
  await expect(strip.getByRole('button')).toHaveCount(9);
  await openPanel(page, 'Layer styles');
  await expect(inspector(page).getByRole('checkbox', { name: 'Enable drop shadow' })).toBeVisible();
  await openPanel(page, 'Filters');
  await expect(inspector(page).getByRole('checkbox', { name: 'Enable drop shadow' })).toHaveCount(0);
  await expect(inspector(page).getByRole('combobox', { name: 'Filter effect', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Layer styles panel' })).toHaveAttribute('aria-expanded', 'false');
  const filters = page.getByRole('button', { name: 'Filters panel', exact: true });
  await expect(filters).toHaveAttribute('aria-controls', 'sidebar-open-panel');
  await filters.click();
  await expect(filters).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#sidebar-open-panel')).toHaveCount(0);
  for (const label of ['Layer details', 'Adjust selected layer', 'History', 'Saved selections', 'Transform', 'Reference image', 'My projects'] as const) {
    await openPanel(page, label);
    await expect(page.locator('[data-sidebar-panel-toggle][aria-expanded="true"]')).toHaveCount(1);
  }
});

test('the open panel is remembered per tool across a reload', async ({ page }) => {
  await selectTool(page, 'Brush');
  await openPanel(page, 'Adjust selected layer');
  // A tool without its own choice keeps the panel the user last opened.
  await selectTool(page, 'Horizontal Type');
  await expect(openPanelBody(page, 'adjustments')).toBeVisible();
  await openPanel(page, 'Filters');
  await selectTool(page, 'Gradient');
  await closePanels(page);
  await selectTool(page, 'Horizontal Type');
  await expect(openPanelBody(page, 'filters')).toBeVisible();
  await selectTool(page, 'Gradient');
  await expect(page.locator('#sidebar-open-panel')).toHaveCount(0);
  await selectTool(page, 'Brush');
  await expect(openPanelBody(page, 'adjustments')).toBeVisible();
  // The History Brush opens its source context by default.
  await selectTool(page, 'History Brush');
  await expect(openPanelBody(page, 'history')).toBeVisible();
  const stored = await page.evaluate(() => window.localStorage.getItem('pixelforge.sidebar-open-panels'));
  expect(JSON.parse(stored ?? '{}')).toMatchObject({ brush: 'adjustments', text: 'filters' });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Horizontal Type');
  await expect(openPanelBody(page, 'filters')).toBeVisible();
  await selectTool(page, 'Brush');
  await expect(openPanelBody(page, 'adjustments')).toBeVisible();
  // Corrupt storage falls back to the defaults instead of failing.
  await page.evaluate(() => window.localStorage.setItem('pixelforge.sidebar-open-panels', '{oops'));
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Brush');
  await expect(page.locator('#sidebar-open-panel')).toHaveCount(0);
});

test('menu commands open the panel that owns their controls', async ({ page }) => {
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Gaussian Blur…', exact: true }).click();
  await expect(openPanelBody(page, 'filters')).toBeVisible();
  await expect(inspector(page).getByRole('combobox', { name: 'Filter effect', exact: true })).toHaveValue('gaussian-blur');
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Layer Style', exact: true }).click();
  await expect(openPanelBody(page, 'layer-styles')).toBeVisible();
  await expect(inspector(page).getByRole('checkbox', { name: 'Enable outline' })).toBeFocused();
  await expect(inspector(page).getByRole('checkbox', { name: 'Enable outline' })).toBeInViewport();
});

test('F6 and Ctrl+. move focus into the active tool options', async ({ page }) => {
  await selectTool(page, 'Gradient');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('F6');
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="tool-options-area"]')))).toBe(true);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await selectTool(page, 'Hand');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Control+.');
  // No controls: the labelled tool area itself takes focus.
  await expect(toolArea(page)).toBeFocused();
  await expect(toolArea(page)).toHaveAccessibleName('Hand tool options');
});

test('phone: the properties sheet collapses and expands without horizontal overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'phone sheet');
  await page.setViewportSize({ width: 375, height: 812 });
  const handle = page.locator('.inspector-sheet-handle');
  await expect(handle).toBeVisible();
  await expect(handle).toHaveAttribute('aria-expanded', 'true');
  await expect(handle).toHaveAttribute('aria-controls', 'inspector-sheet-body');
  await selectTool(page, 'Brush');
  await expect(handle).toContainText('Brush');
  await expect(marker(page, 'Brush')).toBeVisible();
  await expect(marker(page, 'Gradient')).toHaveCount(0);
  const overflow = () => page.evaluate(() => ({
    page: document.documentElement.scrollWidth - window.innerWidth,
    sidebar: (() => {
      const aside = document.querySelector('aside.inspector') as HTMLElement;
      return aside.scrollWidth - aside.clientWidth;
    })(),
  }));
  expect(await overflow()).toEqual({ page: 0, sidebar: 0 });
  await openPanel(page, 'Layer styles');
  expect(await overflow()).toEqual({ page: 0, sidebar: 0 });
  await handle.click();
  await expect(handle).toHaveAttribute('aria-expanded', 'false');
  await expect(toolArea(page)).toBeHidden();
  // A menu command that targets a panel re-opens the sheet.
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Gaussian Blur…', exact: true }).click();
  await expect(handle).toHaveAttribute('aria-expanded', 'true');
  await expect(inspector(page).getByRole('combobox', { name: 'Filter effect', exact: true })).toBeVisible();
  expect(await overflow()).toEqual({ page: 0, sidebar: 0 });
});

test('desktop has no sheet handle', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only');
  await expect(page.locator('.inspector-sheet-handle')).toBeHidden();
});

const FOOTER_ACTIONS = [
  'Add paint layer', 'Add adjustment layer', 'Group active layer', 'Mask from selection',
  'Create clipping mask', 'Release clipping mask', 'Raise layer', 'Lower layer',
  'Duplicate layer', 'Delete layer',
];

test('layer actions sit in an icon footer directly under the layer list', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 375, height: 812 });
  for (const tool of ['Brush', 'Move']) {
    await selectTool(page, tool);
    const footer = page.getByRole('toolbar', { name: 'Layer actions' });
    await expect(footer).toBeVisible();
    for (const name of FOOTER_ACTIONS) {
      const button = footer.getByRole('button', { name, exact: true });
      await expect(button).toBeVisible();
      await expect(button).toHaveAttribute('title', /\S/);
      // No duplicate text button elsewhere in the sidebar.
      await expect(inspector(page).getByRole('button', { name, exact: true })).toHaveCount(1);
    }
    const geometry = await page.evaluate(() => {
      const list = document.querySelector('aside.inspector .layer-list')!.getBoundingClientRect();
      const bar = document.querySelector('[data-testid="layer-footer"]')!;
      const box = bar.getBoundingClientRect();
      const buttons = Array.from(bar.querySelectorAll('button')).map((button) => button.getBoundingClientRect());
      return {
        gap: box.top - list.bottom,
        overflow: bar.scrollWidth - bar.clientWidth,
        right: Math.max(...buttons.map((rect) => rect.right)) - box.right,
        minWidth: Math.min(...buttons.map((rect) => rect.width)),
        minHeight: Math.min(...buttons.map((rect) => rect.height)),
        page: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    expect(geometry.gap).toBeGreaterThanOrEqual(0);
    expect(geometry.gap).toBeLessThanOrEqual(12);
    expect(geometry.overflow).toBeLessThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(0.5);
    expect(geometry.page).toBe(0);
    if (testInfo.project.name === 'mobile') {
      expect(geometry.minWidth).toBeGreaterThanOrEqual(32);
      expect(geometry.minHeight).toBeGreaterThanOrEqual(32);
    }
  }
  // The footer acts on the active layer.
  const rows = inspector(page).getByRole('button', { name: /^Select layer / });
  const footer = page.getByRole('toolbar', { name: 'Layer actions' });
  const before = await rows.count();
  await footer.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await expect(rows).toHaveCount(before + 1);
  await footer.getByRole('button', { name: 'Duplicate layer', exact: true }).click();
  await expect(rows).toHaveCount(before + 2);
  await footer.getByRole('button', { name: 'Delete layer', exact: true }).click();
  await expect(rows).toHaveCount(before + 1);
});
