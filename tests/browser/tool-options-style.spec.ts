import { test, expect } from '@playwright/test';

// Every tool's options must render as styled controls: no dropdown, number
// field or button in the properties sidebar may fall back to the browser's
// bare look (no border, transparent background). Section headers and the
// mobile sheet handle are plain text buttons by design.
test('every tool options control in the sidebar is styled', async ({ page }) => {
  test.setTimeout(180_000);
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const tools = await page.$$eval('.toolbar button[aria-label$=" tool"], .tool-flyout button[aria-label$=" tool"]',
    (buttons) => [...new Set(buttons.map((button) => button.getAttribute('aria-label')!))]);
  expect(tools.length).toBeGreaterThan(20);
  const bare: string[] = [];
  for (const label of tools) {
    await page.evaluate((name) => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.getAttribute('aria-label') === name);
      button?.click();
    }, label);
    await expect(page.locator('aside.inspector')).toHaveAttribute('data-sidebar-tool', /.+/);
    const found = await page.$$eval(
      'aside.inspector select, aside.inspector button, aside.inspector input[type=number], aside.inspector input[type=text]',
      (elements) => elements.filter((element) => {
        if (!element.getBoundingClientRect().width) return false;
        if (element.closest('.layers-panel') || element.matches('.panel-toggle, .inspector-sheet-handle')) return false;
        const style = getComputedStyle(element);
        return style.borderTopWidth === '0px' && style.backgroundColor === 'rgba(0, 0, 0, 0)';
      }).map((element) => element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName));
    for (const name of found) bare.push(`${label}: ${name}`);
  }
  expect(bare).toEqual([]);
});

test('Brush tool options use compact styled dropdowns and buttons', async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => {
    [...document.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.getAttribute('aria-label') === 'Brush tool')?.click();
  });
  const preset = page.locator('aside.inspector .select-row > select').first();
  await expect(preset).toBeVisible();
  const select = await preset.evaluate((element) => {
    const style = getComputedStyle(element);
    const row = getComputedStyle(element.parentElement!);
    return { border: style.borderTopWidth, radius: style.borderTopLeftRadius, fontSize: style.fontSize, height: element.getBoundingClientRect().height, rowDisplay: row.display };
  });
  expect(select.border).toBe('1px');
  expect(select.radius).toBe('6px');
  expect(select.fontSize).toBe('10px');
  expect(select.rowDisplay).toBe('flex');
  const isMobile = (page.viewportSize()?.width ?? 1280) <= 680;
  expect(select.height).toBeCloseTo(isMobile ? 36 : 28, 0);
  const save = page.getByRole('button', { name: 'Save brush preset', exact: true });
  const button = await save.evaluate((element) => {
    const style = getComputedStyle(element);
    return { border: style.borderTopWidth, background: style.backgroundColor, fontSize: style.fontSize };
  });
  expect(button.border).toBe('1px');
  expect(button.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(button.fontSize).toBe('10px');
});
