import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';
import { SIDEBAR_SECTIONS, TOOL_SECTIONS, type SidebarSectionId } from '../../src/sidebarSections.ts';
import type { Tool } from '../../src/drafts.ts';

// Contract: docs/sidebar-autoscroll-contract.md. The suite as a whole runs
// with prefers-reduced-motion: reduce (playwright.config.ts), so reveals are
// instant and synchronous with the triggering click; tests that exercise the
// animated path opt back into motion explicitly.

/** Toolbar accessible labels (`<label> tool`) for every registered tool. */
const TOOL_LABELS: Record<Tool, string> = {
  move: 'Move', hand: 'Hand', zoom: 'Zoom', 'rotate-view': 'Rotate View',
  eyedropper: 'Eyedropper', 'color-sampler': 'Color Sampler', ruler: 'Ruler', note: 'Note', 'audio-note': 'Audio Annotation', count: 'Count',
  fill: 'Fill', gradient: 'Gradient', clone: 'Clone', heal: 'Healing', 'spot-heal': 'Spot Healing',
  patch: 'Patch', 'red-eye': 'Red Eye', 'pattern-stamp': 'Pattern Stamp', crop: 'Crop',
  'perspective-crop': 'Perspective Crop', slice: 'Slice', 'slice-select': 'Slice Select', frame: 'Frame',
  brush: 'Brush', 'mixer-brush': 'Mixer Brush', 'history-brush': 'History Brush',
  'art-history-brush': 'Art History Brush', pencil: 'Pencil', 'color-replace': 'Color Replace',
  eraser: 'Eraser', 'background-eraser': 'Background Eraser', 'magic-eraser': 'Magic Eraser',
  'mask-brush': 'Mask Brush', 'mask-eraser': 'Mask Eraser', 'adjustment-brush': 'Adjustment Brush',
  dodge: 'Dodge', burn: 'Burn', sponge: 'Sponge', smudge: 'Smudge', blur: 'Blur', sharpen: 'Sharpen',
  pen: 'Pen', 'freeform-pen': 'Freeform Pen', 'curvature-pen': 'Curvature Pen',
  'add-anchor': 'Add Anchor Point', 'delete-anchor': 'Delete Anchor Point', 'convert-point': 'Convert Point',
  'path-select': 'Path Selection', 'direct-select': 'Direct Selection', text: 'Text', rectangle: 'Shape', ellipse: 'Ellipse',
  line: 'Line', polygon: 'Polygon', select: 'Select', 'ellipse-select': 'Elliptical marquee',
  'row-select': 'Single Row marquee', 'column-select': 'Single Column marquee', lasso: 'Lasso',
  'polygonal-lasso': 'Polygonal Lasso', 'magnetic-lasso': 'Magnetic Lasso',
  'selection-brush': 'Selection Brush', 'quick-selection': 'Quick Selection', 'magic-wand': 'Magic Wand',
};

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const inspector = (page: Page) => page.locator('aside.inspector');

type RevealState = { phase: string; section: string; outcome: string; sequence: number };

const revealState = (page: Page): Promise<RevealState> =>
  inspector(page).evaluate((element) => ({
    phase: element.getAttribute('data-autoscroll-phase') ?? 'idle',
    section: element.getAttribute('data-autoscroll-section') ?? '',
    outcome: element.getAttribute('data-autoscroll-outcome') ?? '',
    sequence: Number(element.getAttribute('data-autoscroll-sequence') ?? 0),
  }));

/** Wait until a reveal newer than `after` has finished; returns its state. */
async function settledReveal(page: Page, after: number): Promise<RevealState> {
  await expect
    .poll(async () => {
      const state = await revealState(page);
      return state.sequence > after && state.phase === 'idle';
    }, { timeout: 10_000 })
    .toBe(true);
  return revealState(page);
}

type SectionBox = {
  /** Header offset from the top of the sidebar's scrollport. */
  top: number;
  bottom: number;
  clientHeight: number;
  scrollTop: number;
  maxScroll: number;
  /** On-screen part of the scrollport (the stacked mobile sidebar starts below the canvas). */
  bandTop: number;
  bandBottom: number;
};

const sectionBox = (page: Page, section: SidebarSectionId): Promise<SectionBox> =>
  inspector(page).evaluate((container, id) => {
    const element = container.querySelector(`[data-sidebar-section="${id}"]`);
    if (!element) throw new Error(`section ${id} is not rendered`);
    const rect = element.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    const origin = box.top + container.clientTop;
    const hiddenAbove = Math.max(0, -origin);
    const hiddenBelow = Math.max(0, origin + container.clientHeight - window.innerHeight);
    const onScreen = container.clientHeight - hiddenAbove - hiddenBelow >= 64;
    return {
      top: rect.top - origin,
      bottom: rect.bottom - origin,
      clientHeight: container.clientHeight,
      scrollTop: container.scrollTop,
      maxScroll: container.scrollHeight - container.clientHeight,
      bandTop: onScreen ? hiddenAbove : 0,
      bandBottom: container.clientHeight - (onScreen ? hiddenBelow : 0),
    };
  }, section);

/** Header at the top (±1 px), or the sidebar is clamped at its end with the header visible. */
function expectHeaderAligned(box: SectionBox, inset = 0) {
  const expected = Math.max(inset, box.bandTop);
  const aligned = Math.abs(box.top - expected) <= 1.5;
  const clampedAtEnd = box.scrollTop >= box.maxScroll - 1.5 && box.top >= expected - 1.5 && box.top < box.bandBottom;
  expect(aligned || clampedAtEnd, JSON.stringify(box)).toBe(true);
}

function expectFullyVisible(box: SectionBox) {
  expect(box.top, JSON.stringify(box)).toBeGreaterThanOrEqual(box.bandTop - 1.5);
  expect(box.bottom, JSON.stringify(box)).toBeLessThanOrEqual(box.bandBottom + 1.5);
}

/** What each landed outcome promises about the section's position. */
function expectSatisfied(box: SectionBox, outcome: string) {
  if (outcome === 'visible') expectFullyVisible(box);
  else expectHeaderAligned(box);
}

const scrollSidebarTo = (page: Page, where: 'top' | 'bottom' | number) =>
  inspector(page).evaluate((container, target) => {
    const top = target === 'top' ? 0 : target === 'bottom' ? container.scrollHeight : target;
    container.scrollTo({ top, behavior: 'instant' as ScrollBehavior });
    return container.scrollTop;
  }, where);

const toolButton = (page: Page, label: string) =>
  page.getByTestId('tool-palette').getByRole('button', { name: `${label} tool`, exact: true });

const enableMotion = (page: Page) => page.emulateMedia({ reducedMotion: 'no-preference' });

test.describe('every toolbar tool reveals the section that owns its controls', () => {
  for (const [tool, section] of Object.entries(TOOL_SECTIONS) as Array<[Tool, SidebarSectionId | null]>) {
    test(`${tool} → ${section ?? 'no inline section'}`, async ({ page }) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      const pageScroll = await page.evaluate(() => window.scrollY);
      const canvasBefore = await page.getByTestId('editor-canvas').boundingBox();
      const start = await scrollSidebarTo(page, 'bottom');
      const before = (await revealState(page)).sequence;
      await selectTool(page, TOOL_LABELS[tool]);
      await expect(page.locator(`[data-tool-id="${tool}"][aria-pressed="true"]`)).toHaveCount(1);
      const state = await settledReveal(page, before);
      if (section === null) {
        expect(state.outcome).toBe('no-section');
        expect(await inspector(page).evaluate((element) => element.scrollTop)).toBe(start);
      } else {
        expect(state.section).toBe(section);
        expect(['scrolled', 'visible', 'aligned']).toContain(state.outcome);
        expectSatisfied(await sectionBox(page, section), state.outcome);
        await expect(inspector(page).locator(`[data-sidebar-section="${section}"]`)).toBeVisible();
      }
      // The canvas never moves because of a reveal (desktop and stacked mobile).
      expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);
      expect(await page.getByTestId('editor-canvas').boundingBox()).toEqual(canvasBefore);
    });
  }
});

test('flyout pick by keyboard reveals the subtool section and keeps focus in the toolbar', async ({ page }) => {
  await scrollSidebarTo(page, 'bottom');
  const before = (await revealState(page)).sequence;
  const brush = toolButton(page, 'Brush');
  await brush.focus();
  await page.keyboard.press('ArrowDown');
  const flyout = page.locator('.tool-flyout[role="menu"]');
  await expect(flyout).toBeVisible();
  await flyout.getByRole('menuitem', { name: 'Pencil', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(flyout).toBeHidden();
  const state = await settledReveal(page, before);
  expect(state).toMatchObject({ section: 'tool-options', outcome: 'scrolled' });
  expectHeaderAligned(await sectionBox(page, 'tool-options'));
  await expect(toolButton(page, 'Pencil')).toBeFocused();
});

test('keyboard tool shortcuts reveal the section without moving focus', async ({ page }) => {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (const [key, section] of [
    ['b', 'tool-options'],
    ['m', 'selection-options'],
    ['r', 'rotate-view'],
  ] as const) {
    await scrollSidebarTo(page, 'bottom');
    const before = (await revealState(page)).sequence;
    await page.keyboard.press(key);
    const state = await settledReveal(page, before);
    expect(state.section).toBe(section);
    expect(['scrolled', 'aligned', 'visible']).toContain(state.outcome);
    expectSatisfied(await sectionBox(page, section), state.outcome);
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  }
});

test('Filter menu pick reveals and highlights Filter effects', async ({ page }) => {
  await scrollSidebarTo(page, 'top');
  const before = (await revealState(page)).sequence;
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Gaussian Blur…', exact: true }).click();
  const state = await settledReveal(page, before);
  expect(state).toMatchObject({ section: 'filter-effects', outcome: 'scrolled' });
  expectHeaderAligned(await sectionBox(page, 'filter-effects'));
  const section = inspector(page).locator('[data-sidebar-section="filter-effects"]');
  await expect(section).toHaveAttribute('data-sidebar-highlight', 'true');
  await expect(section.getByRole('combobox', { name: 'Filter effect', exact: true })).toHaveValue('gaussian-blur');
  await expect(page.getByTestId('sidebar-autoscroll-announcer')).toHaveText(/Filter effects section shown/);
  // Pointer activation never moves focus into the sidebar.
  expect(await section.evaluate((element) => element.contains(document.activeElement))).toBe(false);
  // The highlight is brief.
  await expect(section).not.toHaveAttribute('data-sidebar-highlight', 'true', { timeout: 4000 });
});

test('keyboard menu activation lands focus on the revealed section', async ({ page }) => {
  await scrollSidebarTo(page, 'top');
  const before = (await revealState(page)).sequence;
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Gaussian Blur…', exact: true }).focus();
  await page.keyboard.press('Enter');
  const state = await settledReveal(page, before);
  expect(state).toMatchObject({ section: 'filter-effects', outcome: 'scrolled' });
  await expect(page.getByRole('button', { name: 'Filter effects', exact: true })).toBeFocused();
});

test('Layer > Layer Style focuses Enable outline and keeps it visible', async ({ page }) => {
  await scrollSidebarTo(page, 'bottom');
  const before = (await revealState(page)).sequence;
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Layer Style', exact: true }).click();
  const state = await settledReveal(page, before);
  expect(state.section).toBe('layer-styles');
  const outline = page.getByLabel('Enable outline', { exact: true });
  await expect(outline).toBeFocused();
  const visible = await inspector(page).evaluate((container) => {
    const input = container.querySelector('input[aria-label="Enable outline"]')!.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    return input.top >= box.top - 1 && input.bottom <= box.bottom + 1;
  });
  expect(visible).toBe(true);
});

test('enabling a layer style reveals its controls without hiding the checkbox', async ({ page }) => {
  // Put the Outer glow checkbox, fully visible, just above the bottom edge:
  // the glow controls it reveals will open below the fold.
  await inspector(page).evaluate((container) => {
    const label = container.querySelector('input[aria-label="Enable outer glow"]')!.closest('label')!;
    const box = container.getBoundingClientRect();
    const rect = label.getBoundingClientRect();
    container.scrollTop += rect.bottom - box.bottom + 4;
  });
  const checkbox = page.getByLabel('Enable outer glow', { exact: true });
  const before = (await revealState(page)).sequence;
  await checkbox.check();
  const state = await settledReveal(page, before);
  expect(state).toMatchObject({ section: 'layer-style-outer-glow', outcome: 'scrolled' });
  const box = await sectionBox(page, 'layer-style-outer-glow');
  // Minimal (nearest) movement: the whole block is visible, header included.
  expectFullyVisible(box);
  expect(box.top).toBeGreaterThan(5);
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toBeInViewport();
});

test('selecting a layer reveals its properties; additive selection does not move', async ({ page }) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await scrollSidebarTo(page, 'top');
  const rows = inspector(page).getByRole('button', { name: /^Select layer / });
  await expect(rows).toHaveCount(2);
  let before = (await revealState(page)).sequence;
  await rows.nth(1).click();
  const state = await settledReveal(page, before);
  expect(state.section).toBe('layer-properties');
  expect(['scrolled', 'visible']).toContain(state.outcome);
  expectFullyVisible(await sectionBox(page, 'layer-properties'));
  // Ctrl/Cmd-click builds a multi-selection: the list must stay put.
  await scrollSidebarTo(page, 'top');
  before = (await revealState(page)).sequence;
  await rows.nth(0).click({ modifiers: ['ControlOrMeta'] });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect((await revealState(page)).sequence).toBe(before);
  expect(await inspector(page).evaluate((element) => element.scrollTop)).toBe(0);
});

test('a collapsed section is expanded before it is revealed, and the choice persists', async ({ page }) => {
  await selectTool(page, 'Brush');
  const toggle = page.getByRole('button', { name: 'Tool options', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const body = page.locator('#sidebar-section-tool-options-body');
  await expect(body).toBeHidden();
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Move');
  await scrollSidebarTo(page, 'bottom');
  const before = (await revealState(page)).sequence;
  await selectTool(page, 'Brush');
  const state = await settledReveal(page, before);
  expect(state).toMatchObject({ section: 'tool-options', outcome: 'scrolled' });
  await expect(page.getByRole('button', { name: 'Tool options', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#sidebar-section-tool-options-body')).toBeVisible();
  expectHeaderAligned(await sectionBox(page, 'tool-options'));
  await expect(page.getByTestId('sidebar-autoscroll-announcer')).toHaveText(/Tool options section shown/);
  // Expansion by a reveal is persisted like a manual toggle.
  expect(await page.evaluate(() => localStorage.getItem('pixelforge.sidebar-collapsed-sections'))).toBe('[]');
});

test('a section that is already fully visible does not move', async ({ page }) => {
  await selectTool(page, 'Brush');
  // Bring the whole sidebar on screen (it sits below the canvas on mobile).
  await page.evaluate(() => {
    const top = document.querySelector('aside.inspector')!.getBoundingClientRect().top;
    window.scrollBy(0, top);
  });
  const target = await inspector(page).evaluate((container) => {
    const section = container.querySelector('[data-sidebar-section="layer-alignment"]')!;
    const rect = section.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    // Leave the Align fieldset fully visible but well below the top.
    container.scrollTop += rect.top - box.top - 40;
    return container.scrollTop;
  });
  const geometry = await sectionBox(page, 'layer-alignment');
  expectFullyVisible(geometry);
  const before = (await revealState(page)).sequence;
  // Dispatch the click directly: Playwright would scroll the page back up to
  // the toolbar first, pushing the mobile sidebar partly off screen.
  await page.evaluate(() =>
    document.querySelector<HTMLButtonElement>('[data-tool-id="move"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })),
  );
  const state = await settledReveal(page, before);
  expect(state).toMatchObject({ section: 'layer-alignment', outcome: 'visible' });
  expect(await inspector(page).evaluate((element) => element.scrollTop)).toBe(target);
  await expect(inspector(page).locator('[data-sidebar-section="layer-alignment"]')).toHaveAttribute('data-sidebar-highlight', 'true');
});

test('rapid successive tool clicks: only the last one wins', async ({ page }) => {
  await enableMotion(page);
  await scrollSidebarTo(page, 'bottom');
  const before = (await revealState(page)).sequence;
  for (const label of ['Brush', 'Rotate View', 'Text', 'Move', 'Lasso'])
    await toolButton(page, label).click();
  const state = await settledReveal(page, before);
  expect(state.sequence - before).toBe(5);
  expect(state).toMatchObject({ section: 'selection-options' });
  expect(['scrolled', 'aligned', 'visible']).toContain(state.outcome);
  expectSatisfied(await sectionBox(page, 'selection-options'), state.outcome);
  await expect(inspector(page).locator('[data-sidebar-highlight="true"]')).toHaveCount(1);
  await expect(inspector(page).locator('[data-sidebar-section="selection-options"]')).toHaveAttribute('data-sidebar-highlight', 'true');
});

test('a section-less tool cancels a reveal that is still pending', async ({ page }) => {
  await scrollSidebarTo(page, 'bottom');
  const start = await inspector(page).evaluate((element) => element.scrollTop);
  const before = (await revealState(page)).sequence;
  // Both clicks in one task: the Brush reveal never gets to resolve.
  await page.evaluate(() => {
    const click = (id: string) =>
      document.querySelector<HTMLButtonElement>(`[data-tool-id="${id}"]`)!
        .dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    click('brush');
    click('hand');
  });
  const state = await settledReveal(page, before);
  expect(state.sequence - before).toBe(2);
  expect(state.outcome).toBe('no-section');
  expect(await inspector(page).evaluate((element) => element.scrollTop)).toBe(start);
});

test('animated reveal: smooth, monotonic, highlighted with motion', async ({ page }) => {
  await enableMotion(page);
  await scrollSidebarTo(page, 'top');
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const item = page.getByRole('menuitem', { name: 'Gaussian Blur…', exact: true });
  await expect(item).toBeVisible();
  const samples = await page.evaluate(async () => {
    const container = document.querySelector<HTMLElement>('aside.inspector')!;
    const menuItem = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((element) => element.textContent?.includes('Gaussian Blur'))!;
    menuItem.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    const values: number[] = [];
    for (let i = 0; i < 90; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      values.push(container.scrollTop);
      if (container.getAttribute('data-autoscroll-phase') === 'idle' && i > 2) break;
    }
    return values;
  });
  const distinct = [...new Set(samples)];
  expect(distinct.length, samples.join(',')).toBeGreaterThan(3);
  for (let i = 1; i < samples.length; i += 1) expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
  const state = await revealState(page);
  expect(state).toMatchObject({ phase: 'idle', section: 'filter-effects', outcome: 'scrolled' });
  expectHeaderAligned(await sectionBox(page, 'filter-effects'));
  const animation = await inspector(page)
    .locator('[data-sidebar-section="filter-effects"]')
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(animation).toBe('sidebar-section-landing');
});

test('reduced motion: the reveal is a single instant jump with a static highlight', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await scrollSidebarTo(page, 'top');
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Gaussian Blur…', exact: true })).toBeVisible();
  const result = await page.evaluate(async () => {
    const container = document.querySelector<HTMLElement>('aside.inspector')!;
    const menuItem = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((element) => element.textContent?.includes('Gaussian Blur'))!;
    menuItem.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    // Microtasks only: React's commit and the reveal both run before a frame.
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    const immediate = container.scrollTop;
    const values: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      values.push(container.scrollTop);
    }
    return { immediate, values };
  });
  expect(result.immediate).toBeGreaterThan(0);
  expect(new Set([result.immediate, ...result.values]).size, JSON.stringify(result)).toBe(1);
  expectHeaderAligned(await sectionBox(page, 'filter-effects'));
  const animation = await inspector(page)
    .locator('[data-sidebar-section="filter-effects"]')
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(animation).toBe('none');
  await expect(inspector(page).locator('[data-sidebar-section="filter-effects"]')).toHaveAttribute('data-sidebar-highlight', 'true');
});

test('a manual scroll during the animation stops it where the user left it', async ({ page }) => {
  await enableMotion(page);
  await scrollSidebarTo(page, 'top');
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Gaussian Blur…', exact: true })).toBeVisible();
  const result = await page.evaluate(async () => {
    const container = document.querySelector<HTMLElement>('aside.inspector')!;
    const menuItem = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((element) => element.textContent?.includes('Gaussian Blur'))!;
    menuItem.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    let phaseAtInterrupt = '';
    for (let i = 0; i < 60; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (container.getAttribute('data-autoscroll-phase') === 'animating' && container.scrollTop > 0) {
        phaseAtInterrupt = 'animating';
        break;
      }
    }
    // The user drags the scrollbar / flicks: a wheel plus a position change.
    container.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }));
    container.scrollTop = 10;
    const after: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      after.push(container.scrollTop);
    }
    return { phaseAtInterrupt, after, outcome: container.getAttribute('data-autoscroll-outcome') };
  });
  expect(result.phaseAtInterrupt).toBe('animating');
  expect(result.outcome).toBe('interrupted');
  expect(new Set(result.after)).toEqual(new Set([10]));
});

test('a scrollbar drag without wheel events also interrupts the animation', async ({ page }) => {
  await enableMotion(page);
  await scrollSidebarTo(page, 'top');
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Gaussian Blur…', exact: true })).toBeVisible();
  const result = await page.evaluate(async () => {
    const container = document.querySelector<HTMLElement>('aside.inspector')!;
    const menuItem = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((element) => element.textContent?.includes('Gaussian Blur'))!;
    menuItem.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    for (let i = 0; i < 60; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (container.getAttribute('data-autoscroll-phase') === 'animating' && container.scrollTop > 0) break;
    }
    const position = container.scrollTop + 7;
    container.scrollTop = position;
    for (let i = 0; i < 30; i += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
    return { position, final: container.scrollTop, outcome: container.getAttribute('data-autoscroll-outcome') };
  });
  expect(result.outcome).toBe('interrupted');
  expect(Math.abs(result.final - result.position)).toBeLessThanOrEqual(1);
});

test('no auto-scroll while a pointer is held: the reveal waits for release', async ({ page }) => {
  await scrollSidebarTo(page, 'bottom');
  // When Tool options mounts above the view, the browser either keeps
  // scrollTop or (CSS scroll anchoring) keeps the visible content still. The
  // reveal itself must do neither more: one of the two stays unchanged.
  const view = () =>
    inspector(page).evaluate((container) => ({
      scrollTop: container.scrollTop,
      anchor: Math.round(container.querySelector('.cloud-panel')!.getBoundingClientRect().top),
    }));
  const start = await view();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // A non-interactive spot (the document icon): a held press there is an
  // active pointer interaction that is neither a stroke nor a text field.
  const holdTarget = await page.locator('.docbar svg').first().boundingBox();
  expect(holdTarget).not.toBeNull();
  await page.mouse.move(holdTarget!.x + 4, holdTarget!.y + holdTarget!.height / 2);
  await page.mouse.down();
  const focusDuringHold = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80) ?? null);
  const before = (await revealState(page)).sequence;
  await page.keyboard.press('b');
  await expect(page.locator('[data-tool-id="brush"][aria-pressed="true"]')).toHaveCount(1);
  await expect.poll(async () => (await revealState(page)).phase).toBe('deferred');
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
  const during = await view();
  expect(during.scrollTop === start.scrollTop || Math.abs(during.anchor - start.anchor) <= 1, JSON.stringify({ start, during })).toBe(true);
  expect((await revealState(page)).phase).toBe('deferred');
  expect(Math.abs((await sectionBox(page, 'tool-options')).top - (await sectionBox(page, 'tool-options')).bandTop)).toBeGreaterThan(2);
  await page.mouse.up();
  const state = await settledReveal(page, before);
  expect(state).toMatchObject({ section: 'tool-options', outcome: 'scrolled' });
  expectHeaderAligned(await sectionBox(page, 'tool-options'));
  expect(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80) ?? null)).toBe(focusDuringHold);
  expect(await inspector(page).evaluate((element) => element.contains(document.activeElement))).toBe(false);
});

test('a canvas stroke is never disturbed: no scroll and no focus change', async ({ page }) => {
  await selectTool(page, 'Brush');
  await scrollSidebarTo(page, 'top');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page.mouse.down();
  // The editor focuses its own shell on a canvas press; that is the baseline.
  const focusBefore = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80) ?? null);
  for (let i = 1; i <= 6; i += 1) {
    await page.mouse.move(box.x + box.width * (0.3 + i * 0.04), box.y + box.height * 0.45);
    if (i === 3) {
      await page.keyboard.press('e');
      await page.keyboard.press('m');
    }
  }
  expect(await inspector(page).evaluate((element) => element.scrollTop)).toBe(0);
  expect(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80) ?? null)).toBe(focusBefore);
  await page.mouse.up();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80) ?? null)).toBe(focusBefore);
  expect(await inspector(page).evaluate((element) => element.contains(document.activeElement))).toBe(false);
  expect(await inspector(page).evaluate((element) => element.scrollTop)).toBe(0);
});

test('sticky headers and scroll-padding offset the landing position', async ({ page }) => {
  await inspector(page).evaluate((container) => {
    container.style.scrollPaddingTop = '36px';
  });
  await scrollSidebarTo(page, 'bottom');
  let before = (await revealState(page)).sequence;
  await selectTool(page, 'Brush');
  await settledReveal(page, before);
  expectHeaderAligned(await sectionBox(page, 'tool-options'), 36);
  // A sticky element pinned at the top of the sidebar is accounted for too.
  await inspector(page).evaluate((container) => {
    container.style.scrollPaddingTop = '';
    const sticky = document.createElement('div');
    sticky.setAttribute('data-sidebar-sticky', 'top');
    sticky.style.cssText = 'position:sticky;top:0;height:52px;z-index:2;background:#111;grid-column:1/-1';
    container.prepend(sticky);
  });
  await scrollSidebarTo(page, 'bottom');
  before = (await revealState(page)).sequence;
  await selectTool(page, 'Text');
  await settledReveal(page, before);
  expectHeaderAligned(await sectionBox(page, 'text'), 52);
});

test('collapsible headers are accessible disclosures', async ({ page }) => {
  for (const [id, spec] of Object.entries(SIDEBAR_SECTIONS)) {
    if (!spec.collapsible || spec.conditional) continue;
    const section = inspector(page).locator(`[data-sidebar-section="${id}"]`);
    await expect(section).toHaveCount(1);
    const toggle = section.locator('[data-sidebar-section-toggle]');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toHaveAttribute('aria-controls', `sidebar-section-${id}-body`);
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(`#sidebar-section-${id}-body`)).toBeHidden();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
});
