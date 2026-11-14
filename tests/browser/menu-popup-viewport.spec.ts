import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
});

async function openEditor(page: Page) {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
}

/** Every item of the open menu lies inside the viewport and is the element hit at its centre once scrolled into the popup's view. */
async function assertMenuItemsReachable(page: Page, menu: string) {
  const popup = page.getByRole('menu', { name: `${menu} menu` });
  await expect(popup).toBeVisible();
  const report = await popup.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const items = [...element.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    const misses: string[] = [];
    for (const item of items) {
      item.scrollIntoView({ block: 'nearest' });
      const rect = item.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !item.contains(hit)) misses.push(`${item.textContent} hit ${hit?.tagName}.${hit?.className}`);
    }
    return {
      box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      count: items.length,
      contentHeight: element.scrollHeight,
      misses,
    };
  });
  expect(report.count).toBeGreaterThan(0);
  expect(report.box.left).toBeGreaterThanOrEqual(0);
  expect(report.box.top).toBeGreaterThanOrEqual(0);
  expect(report.box.right).toBeLessThanOrEqual(report.viewport.width);
  expect(report.box.bottom).toBeLessThanOrEqual(report.viewport.height);
  // The whole menu shows at once, or a tall one fills most of the screen.
  expect(report.box.bottom - report.box.top).toBeGreaterThanOrEqual(Math.min(report.contentHeight, 300));
  expect(report.misses, `${menu}: ${report.misses.join('; ')}`).toEqual([]);
}

test('every top menu opens fully inside the viewport with tappable items', async ({ page }) => {
  await openEditor(page);
  const triggers = page.getByRole('navigation', { name: 'Editor menus' }).locator('.menu > button');
  const names = await triggers.allInnerTexts();
  expect(names.length).toBeGreaterThanOrEqual(5);
  for (const name of names) {
    await page.getByRole('navigation', { name: 'Editor menus' }).getByRole('button', { name, exact: true }).click();
    await assertMenuItemsReachable(page, name);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
  }
});

test('a File item below the first row is hit where it is drawn and runs', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('navigation', { name: 'Editor menus' }).getByRole('button', { name: 'File', exact: true }).click();
  const popup = page.getByRole('menu', { name: 'File menu' });
  // "New…" sits below the first row and used to be clipped by the phone menu
  // bar. Click where it is drawn, without Playwright scrolling it into view.
  const item = popup.getByRole('menuitem', { name: 'New…', exact: true });
  const box = (await item.boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="menuitem"]')?.textContent ?? null, point)).toBe('New…');
  await page.mouse.click(point.x, point.y);
  await expect(popup).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: /new document/i })).toBeVisible();
});

test('menus fit a tablet viewport too', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await openEditor(page);
  await page.getByRole('navigation', { name: 'Editor menus' }).getByRole('button', { name: 'Filter', exact: true }).click();
  await assertMenuItemsReachable(page, 'Filter');
});

test('the menu popup stays anchored under its trigger', async ({ page }) => {
  await openEditor(page);
  const trigger = page.getByRole('navigation', { name: 'Editor menus' }).getByRole('button', { name: 'File', exact: true });
  await trigger.click();
  const button = (await trigger.boundingBox())!;
  const popup = (await page.getByRole('menu', { name: 'File menu' }).boundingBox())!;
  expect(popup.y).toBeGreaterThanOrEqual(button.y + button.height);
  expect(popup.y).toBeLessThanOrEqual(button.y + button.height + 10);
  expect(Math.abs(popup.x - Math.max(8, button.x))).toBeLessThan(2);
});
