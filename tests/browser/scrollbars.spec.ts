import { test, expect, type Locator, type Page } from '@playwright/test';

// Contract: docs/scrollbar-contract.md.

// Headless Chromium hides scrollbars by default; this suite needs them painted.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

async function openEditor(page: Page) {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
}

/** The first editor panel that can actually scroll vertically. */
async function scroller(page: Page): Promise<Locator> {
  const index = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll<HTMLElement>('.toolbar, .inspector')];
    return candidates.findIndex((element) => element.scrollHeight > element.clientHeight + 20 && getComputedStyle(element).overflowY !== 'hidden');
  });
  expect(index, 'a scrollable editor panel').toBeGreaterThanOrEqual(0);
  return page.locator('.toolbar, .inspector').nth(index);
}

/** Width the vertical scrollbar takes inside the panel border. */
function gutterWidth(node: Element): number {
  const element = node as HTMLElement;
  const style = getComputedStyle(element);
  return element.offsetWidth - element.clientWidth - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
}

/** A screenshot of the strip where the vertical scrollbar is painted. */
async function scrollbarStrip(page: Page, panel: Locator): Promise<Buffer> {
  const box = (await panel.boundingBox())!;
  const gutter = await panel.evaluate(gutterWidth);
  const borderRight = await panel.evaluate((element) => parseFloat(getComputedStyle(element).borderRightWidth));
  const width = Math.max(gutter, 1);
  return page.screenshot({
    clip: { x: box.x + box.width - borderRight - width, y: box.y + 4, width, height: Math.min(box.height - 8, 300) },
    animations: 'disabled',
  });
}

test('scroll activity marks a panel while it scrolls and clears after a pause', async ({ page }) => {
  await openEditor(page);
  const panel = await scroller(page);
  await expect(panel).not.toHaveAttribute('data-scrolling');
  await panel.evaluate((element) => { element.scrollTop = 60; });
  await expect(panel).toHaveAttribute('data-scrolling', '');
  // Keep scrolling: the mark stays.
  for (let i = 0; i < 4; i += 1) {
    await page.waitForTimeout(300);
    await panel.evaluate((element, step) => { element.scrollTop = 60 + step * 10; }, i + 1);
    await expect(panel).toHaveAttribute('data-scrolling', '');
  }
  await expect(panel).not.toHaveAttribute('data-scrolling', { timeout: 3000 });
});

test('dragging across the tool rail does not select tool labels', async ({ page }) => {
  await openEditor(page);
  const rail = page.locator('.toolbar');
  await expect(rail).toHaveCSS('user-select', 'none');
  const box = (await rail.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 4, box.y + Math.min(box.height - 10, 400), { steps: 8 });
  await page.mouse.up();
  expect(await page.evaluate(() => String(window.getSelection() ?? '').trim())).toBe('');
});

test.describe('desktop scrollbar look', () => {
  test.skip(({ isMobile }) => isMobile, 'Mobile browsers draw their own overlay scrollbars');

  test('panels keep a thin 8px gutter with no arrow buttons', async ({ page }) => {
    await openEditor(page);
    const panel = await scroller(page);
    const gutter = await panel.evaluate(gutterWidth);
    expect(gutter).toBe(8);
  });

  test('the thumb is hidden at rest, shown on hover and while scrolling, then hides again', async ({ page }) => {
    await openEditor(page);
    const panel = await scroller(page);
    // Park the pointer on the canvas area, away from every scroller.
    await page.mouse.move(700, 450);
    await expect(panel).not.toHaveAttribute('data-scrolling', { timeout: 3000 });
    const idle = await scrollbarStrip(page, panel);

    // Hover shows the thumb.
    const box = (await panel.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 40);
    await expect.poll(async () => (await scrollbarStrip(page, panel)).equals(idle)).toBe(false);

    // Leaving hides it again.
    await page.mouse.move(700, 450);
    await expect.poll(async () => (await scrollbarStrip(page, panel)).equals(idle)).toBe(true);

    // Scrolling without hover shows it, then it fades out after the pause.
    // A hidden thumb leaves the strip blank wherever it sits, so the idle
    // capture still applies after scrolling.
    await panel.evaluate((element) => { element.scrollTop = 80; });
    await expect(panel).toHaveAttribute('data-scrolling', '');
    await expect.poll(async () => (await scrollbarStrip(page, panel)).equals(idle)).toBe(false);
    await expect(panel).not.toHaveAttribute('data-scrolling', { timeout: 3000 });
    await expect.poll(async () => (await scrollbarStrip(page, panel)).equals(idle)).toBe(true);
  });
});
