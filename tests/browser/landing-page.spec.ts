import { expect, test, type Page } from '@playwright/test';

// The public landing page (src/HomePage.tsx). The default project runs with
// reduced motion; the animated path opts back in per test.

const SESSION = 'https://marketplace.cheaply.fr/marketplace/api/photoeditor**';

async function openHome(page: Page) {
  await page.route(SESSION, (route) => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Free, right in your browser');
}

const canvasPixels = (page: Page) =>
  page.getByTestId('landing-hero-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL('image/png'));

test('renders the hero, live demo, real stats and every tool family', async ({ page }) => {
  await openHome(page);
  await expect(page.getByText('100% free · Local-first · No sign-up')).toBeVisible();
  await expect(page.getByRole('figure', { name: /Animated preview of the PixelForge editor/ })).toBeVisible();
  await expect(page.getByTestId('landing-hero-canvas')).toHaveAttribute('data-ready', 'true');

  const stats = page.getByRole('region', { name: 'PixelForge in numbers' });
  await expect(stats.locator('dt')).toHaveText(['Editing tools', 'Toolbar families', 'Filter effects', 'Blend modes', 'Undo steps', 'Price, forever']);
  await expect(stats.locator('dd .sr-only')).toHaveText(['69', '28', '66', '26', '240', '0 €']);

  const families = page.locator('.lp-family');
  await expect(families).toHaveCount(10);
  await expect(families.first()).toContainText('Navigate');
  await expect(page.getByRole('heading', { name: '69 tools in 28 compact toolbar slots.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your photos stay on your device.' })).toBeVisible();
  // Free is a headline promise, backed by a dedicated section.
  await expect(page.getByRole('heading', { name: 'Every tool. Every export. Zero cost.' })).toBeVisible();
  await expect(page.locator('.lp-free-list li')).toHaveCount(4);
  await expect(page.locator('.lp-free-list')).toContainText('All 69 tools and 66 filter effects, unlocked');
  await expect(page.getByText('Free forever, every tool')).toBeVisible();

  // Claims stay honest: no competitor names, no unverifiable ranking.
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/Photoshop|Adobe|number 1|#1/i);

  // The demo canvas is not blank.
  const painted = await page.getByTestId('landing-hero-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const colours = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 997) colours.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    return colours.size;
  });
  expect(painted).toBeGreaterThan(40);
});

test('Start editing opens the editor anonymously', async ({ page }) => {
  await openHome(page);
  await expect(page.getByRole('link', { name: 'Start editing' })).toHaveAttribute('href', '/editor?new=1');
  await page.getByRole('link', { name: 'Start editing' }).click();
  await expect(page).toHaveURL(/\/editor/);
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
});

test('the closing call to action also opens the editor', async ({ page }) => {
  await openHome(page);
  const finalCta = page.locator('.lp-final').getByRole('link', { name: 'Open editor' });
  await finalCta.scrollIntoViewIfNeeded();
  await expect(finalCta).toBeVisible();
  await finalCta.click();
  await expect(page).toHaveURL(/\/editor\?new=1/);
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

test('Explore the toolset jumps to the tool families', async ({ page }) => {
  await openHome(page);
  await page.getByRole('link', { name: 'Explore the toolset' }).click();
  await expect(page.locator('#lp-tools')).toBeInViewport();
});

test('reduced motion shows a still frame with every section visible', async ({ page }) => {
  await openHome(page);
  const demo = page.getByTestId('landing-hero-demo');
  await expect(page.getByTestId('landing-hero-canvas')).toHaveAttribute('data-ready', 'true');
  await expect(demo).toHaveAttribute('data-animated', 'false');
  // Poster frame: every layer is listed and the type layer is active.
  await expect(demo.locator('.lp-panel li[data-shown="true"]')).toHaveCount(5);
  const first = await canvasPixels(page);
  await page.waitForTimeout(800);
  expect(await canvasPixels(page)).toBe(first);
  // Scroll reveal never hides content.
  await expect(page.locator('main.lp')).not.toHaveAttribute('data-reveal', 'on');
  const hidden = await page.locator('.lp-reveal').evaluateAll((nodes) =>
    nodes.filter((node) => Number(getComputedStyle(node).opacity) < 1).length);
  expect(hidden).toBe(0);
  const animations = await page.locator('.lp').evaluate((root) =>
    [...root.querySelectorAll('*')].filter((node) => getComputedStyle(node).animationName !== 'none').length);
  expect(animations).toBe(0);
  // Stats show final numbers immediately.
  await expect(page.locator('.lp-stat dd [aria-hidden="true"]').first()).toHaveText('69');
});

test.describe('with motion', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('the hero demo animates, then reveals sections and counts up stats', async ({ page }) => {
    await openHome(page);
    const demo = page.getByTestId('landing-hero-demo');
    await expect(demo).toHaveAttribute('data-animated', 'true');
    await expect(demo).toHaveAttribute('data-phase', 'paint');
    const first = await canvasPixels(page);
    await expect.poll(() => canvasPixels(page), { timeout: 5000 }).not.toBe(first);
    // The demo moves on to the Curves adjustment phase and highlights its tool.
    await expect(demo).toHaveAttribute('data-phase', 'adjust', { timeout: 8000 });
    await expect(demo.locator('.lp-rail li[data-active="true"]')).toHaveAttribute('title', 'Adjustments');
    await expect(demo.locator('.lp-panel li[data-active="true"]')).toContainText('Curves 1');

    await expect(page.locator('main.lp')).toHaveAttribute('data-reveal', 'on');
    const stats = page.locator('.lp-stats');
    await stats.scrollIntoViewIfNeeded();
    await expect(stats).toHaveAttribute('data-in', 'true');
    await expect(page.locator('.lp-stat dd [aria-hidden="true"]').nth(4)).toHaveText('240', { timeout: 4000 });
    const families = page.locator('#lp-tools');
    await families.scrollIntoViewIfNeeded();
    await expect(page.locator('.lp-family').first()).toHaveAttribute('data-in', 'true');
  });

  test('the demo pauses while the tab is hidden', async ({ page }) => {
    await openHome(page);
    await expect(page.getByTestId('landing-hero-demo')).toHaveAttribute('data-animated', 'true');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const paused = await canvasPixels(page);
    await page.waitForTimeout(700);
    expect(await canvasPixels(page)).toBe(paused);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => canvasPixels(page), { timeout: 4000 }).not.toBe(paused);
  });
});

test('no horizontal overflow at any section', async ({ page }) => {
  await openHome(page);
  const overflow = await page.evaluate(() => {
    const scroller = document.querySelector('.home-page') as HTMLElement;
    const width = window.innerWidth;
    const offenders = [...document.querySelectorAll('.lp *')]
      .filter((node) => !node.closest('.lp-ribbon, .lp-backdrop, .lp-price-shine'))
      .filter((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && (box.right > width + 1 || box.left < -1);
      })
      .slice(0, 5)
      .map((node) => `${node.tagName}.${(node as HTMLElement).className}`);
    return {
      page: document.documentElement.scrollWidth - width,
      scroller: scroller.scrollWidth - scroller.clientWidth,
      offenders,
    };
  });
  expect(overflow.page).toBeLessThanOrEqual(0);
  expect(overflow.scroller).toBeLessThanOrEqual(0);
  expect(overflow.offenders).toEqual([]);
});

test('keyboard users reach the primary call to action with a visible focus ring', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard navigation is a desktop path');
  await openHome(page);
  const cta = page.getByRole('link', { name: 'Start editing' });
  await page.getByRole('link', { name: 'Explore the toolset' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(cta).toBeFocused();
  expect(await cta.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('solid');
});
