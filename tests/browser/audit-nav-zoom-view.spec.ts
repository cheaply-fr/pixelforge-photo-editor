import { test, expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';

// Audit fixes B-03 (zoom pill pinned), B-04 (Reset view fits), I-02 (Zoom
// options and Ctrl+0/1). Contract: docs/navigation-tool-options-contract.md.

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const zoomLevel = (page: Page) => page.getByTestId('zoom-level');
const zoomValue = async (page: Page) =>
  Number(await page.getByTestId('canvas-wrap').getAttribute('data-view-zoom'));
const canvasBox = async (page: Page) => {
  const canvas = page.getByTestId('editor-canvas');
  await canvas.scrollIntoViewIfNeeded();
  return (await canvas.boundingBox())!;
};

test('the zoom pill stays pinned to the visible stage while the canvas scrolls', async ({ page }) => {
  const stage = page.locator('.stage');
  const pill = page.getByTestId('zoom-control');
  const shellBox = async () => (await page.locator('.stage-shell').boundingBox())!;
  const before = (await pill.boundingBox())!;
  const shell = await shellBox();
  expect(shell.y + shell.height - (before.y + before.height)).toBeGreaterThanOrEqual(8);
  expect(shell.y + shell.height - (before.y + before.height)).toBeLessThanOrEqual(40);
  // Zoom far in, then scroll the stage both ways: the pill must not move.
  for (let step = 0; step < 14 && (await zoomValue(page)) < 200; step += 1)
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  expect(await zoomValue(page)).toBeGreaterThanOrEqual(200);
  for (const [left, top] of [[0, 0], [400, 300], [100000, 100000]]) {
    await stage.evaluate((element, [x, y]) => element.scrollTo(x, y), [left, top]);
    await expect.poll(async () => (await pill.boundingBox())!.y).toBeCloseTo(before.y, 0);
    const box = (await pill.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - (before.x + before.width / 2))).toBeLessThan(2);
  }
  expect(await stage.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  // The pill is above the canvas, not hidden under it.
  const centre = (await pill.boundingBox())!;
  const hit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid="zoom-control"]') !== null,
    [centre.x + 6, centre.y + centre.height / 2],
  );
  expect(hit).toBe(true);
});

test('Rotate View "Reset view" fits on one line inside its button', async ({ page }) => {
  await selectTool(page, 'Rotate View');
  const reset = page.getByRole('button', { name: 'Reset view rotation' });
  await expect(reset).toBeVisible();
  const metrics = await reset.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    whiteSpace: getComputedStyle(element).whiteSpace,
  }));
  expect(metrics.whiteSpace).toBe('nowrap');
  expect(metrics.height).toBeLessThanOrEqual(33);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  await page.getByRole('button', { name: 'Rotate view right 15 degrees' }).click();
  await expect(page.getByTestId('view-rotation-value')).toHaveText('15°');
  await reset.click();
  await expect(page.getByTestId('view-rotation-value')).toHaveText('0°');
});

test('Zoom tool options: mode, 100% / Fit / Fill, Scrubby Zoom and persistence', async ({ page }) => {
  await selectTool(page, 'Zoom');
  const options = page.getByTestId('zoom-options');
  await expect(options).toBeVisible();
  await expect(page.locator('[data-sidebar-section="tool-options"]')).toHaveAttribute('aria-label', 'Zoom options');
  // Navigation tools never show the painting Size control.
  await expect(page.getByRole('spinbutton', { name: 'Size', exact: true })).toHaveCount(0);

  await options.getByRole('button', { name: '100%', exact: true }).click();
  await expect(zoomLevel(page)).toHaveText('100%');
  await options.getByRole('button', { name: 'Fit Screen', exact: true }).click();
  const fitted = await zoomValue(page);
  expect(fitted).toBeLessThanOrEqual(100);
  await options.getByRole('button', { name: 'Fill Screen', exact: true }).click();
  await expect.poll(() => zoomValue(page)).toBeGreaterThan(fitted);
  // Filled: one image axis spans the stage's content box.
  const filled = await page.evaluate(() => {
    const stage = document.querySelector('.stage') as HTMLElement;
    const wrap = document.querySelector('.canvas-wrap') as HTMLElement;
    const style = getComputedStyle(stage);
    const width = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const height = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    return { width, height, wrapWidth: wrap.offsetWidth, wrapHeight: wrap.offsetHeight };
  });
  expect(filled.wrapWidth >= filled.width - 2 && filled.wrapHeight >= filled.height - 2).toBe(true);

  // Zoom Out mode: a plain click zooms out, Alt-click zooms in.
  await options.getByRole('button', { name: '100%', exact: true }).click();
  await options.getByRole('combobox', { name: 'Zoom mode' }).selectOption('out');
  let box = await canvasBox(page);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => zoomValue(page)).toBeLessThan(100);
  const out = await zoomValue(page);
  box = await canvasBox(page);
  await page.keyboard.down('Alt');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.up('Alt');
  await expect.poll(() => zoomValue(page)).toBeGreaterThan(out);

  // Scrubby Zoom: dragging right zooms in continuously.
  await options.getByRole('checkbox', { name: 'Scrubby Zoom' }).check();
  await options.getByRole('button', { name: 'Fit Screen', exact: true }).click();
  const start = await zoomValue(page);
  box = await canvasBox(page);
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4 + 120, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => zoomValue(page)).toBeGreaterThan(start * 1.3);
  await expect(page.getByText(/^Scrubby Zoom:/)).toBeVisible();

  // Options are part of the draft settings and survive a reload.
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByTestId('zoom-options')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Zoom mode' })).toHaveValue('out');
  await expect(page.getByRole('checkbox', { name: 'Scrubby Zoom' })).toBeChecked();
});

test('Ctrl/Cmd+1 shows 100% and Ctrl/Cmd+0 fits, with the browser default prevented', async ({ page }) => {
  // Keep the events and read defaultPrevented after every listener ran.
  await page.evaluate(() => {
    (window as unknown as { zoomKeys: KeyboardEvent[] }).zoomKeys = [];
    window.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === '0' || event.key === '1'))
        (window as unknown as { zoomKeys: KeyboardEvent[] }).zoomKeys.push(event);
    });
  });
  await page.getByTestId('editor-canvas').click({ position: { x: 5, y: 5 }, trial: true });
  await page.keyboard.press('Control+1');
  await expect(zoomLevel(page)).toHaveText('100%');
  await page.keyboard.press('Control+0');
  await expect.poll(() => zoomValue(page)).toBeLessThan(100);
  expect(
    await page.evaluate(() =>
      (window as unknown as { zoomKeys: KeyboardEvent[] }).zoomKeys.map((event) => event.defaultPrevented),
    ),
  ).toEqual([true, true]);
});
