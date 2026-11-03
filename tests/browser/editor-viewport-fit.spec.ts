import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
});

async function openEditor(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
}

const box = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
  });

// 681–900 px used to lay the editor out ~1170 px wide with overflow hidden,
// hiding the inspector, Export and the account menu.
for (const [width, height] of [
  [681, 800],
  [707, 689],
  [768, 1024],
  [900, 700],
  [1024, 768],
] as const) {
  test(`editor fits a ${width}px window without hidden panels`, async ({ page }) => {
    await openEditor(page, width, height);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(width);

    for (const selector of ['.topbar', '.workspace', '.inspector', '.stage', '.toolbar']) {
      const rect = await box(page, selector);
      expect(rect.right, selector).toBeLessThanOrEqual(width + 0.5);
      expect(rect.left, selector).toBeGreaterThanOrEqual(-0.5);
    }
    const stage = await box(page, '.stage');
    expect(stage.width).toBeGreaterThanOrEqual(240);

    for (const name of ['Export', 'Open guest profile menu', 'Plugins', 'File']) {
      const button = page.getByRole('button', { name, exact: true });
      await expect(button, name).toBeVisible();
      const rect = await button.boundingBox();
      expect(rect!.x + rect!.width, name).toBeLessThanOrEqual(width + 0.5);
      expect(rect!.width, name).toBeGreaterThan(0);
    }
    await expect(page.getByRole('button', { name: 'Add paint layer', exact: true })).toBeInViewport();
  });
}

test('menus stay usable from the two-row tablet header', async ({ page }) => {
  await openEditor(page, 768, 1024);
  const menus = page.locator('.topbar nav .menu > button');
  const tops = await menus.evaluateAll((buttons) =>
    buttons.map((button) => Math.round(button.getBoundingClientRect().top)),
  );
  expect(new Set(tops).size).toBe(1);
  const brand = await box(page, '.topbar > .brand-lockup');
  expect(tops[0]).toBeGreaterThanOrEqual(brand.bottom - 1);

  await page.getByRole('button', { name: 'Plugins', exact: true }).click();
  const item = page.getByRole('menuitem').first();
  await expect(item).toBeVisible();
  const rect = await item.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(768);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Canvas Size…', exact: true }).click();
  await expect(page.getByLabel('Width (px)')).toBeInViewport();
});

test('desktop width keeps the single-row header', async ({ page }) => {
  await openEditor(page, 1280, 800);
  const brand = await box(page, '.topbar > .brand-lockup');
  const nav = await box(page, '.topbar nav');
  const actions = await box(page, '.top-actions');
  expect(Math.abs(nav.top - brand.top)).toBeLessThan(20);
  expect(actions.right).toBeLessThanOrEqual(1280);
  expect(nav.left).toBeGreaterThan(brand.right - 1);
});
