import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  // Native fullscreen is intentionally denied in this contract test. The CSS
  // viewport fallback must remain fully usable in headless and embedded hosts.
  await page.evaluate(() => {
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: () => Promise.reject(new Error('fullscreen denied by host')),
    });
  });
});

test('View menu exposes all three screen modes with an accessible Escape exit', async ({
  page,
}) => {
  const shell = page.getByTestId('editor-shell');
  const canvas = page.getByTestId('editor-canvas');
  const before = await canvas.evaluate((element) =>
    (element as HTMLCanvasElement).toDataURL(),
  );

  await page.getByRole('button', { name: 'View', exact: true }).click();
  await expect(
    page.getByRole('menuitem', { name: /^Standard Screen Mode/ }),
  ).toBeEnabled();
  await expect(
    page.getByRole('menuitem', { name: 'Full Screen with Menu', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('menuitem', { name: 'Full Screen', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('menuitem', { name: 'Full Screen with Menu', exact: true })
    .click();
  await expect(shell).toHaveAttribute('data-screen-mode', 'full-menu');
  await expect(
    page.getByRole('button', { name: 'Exit screen mode', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'File', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.docbar')).toBeHidden();
  expect(
    await canvas.evaluate((element) =>
      (element as HTMLCanvasElement).toDataURL(),
    ),
  ).toBe(before);

  await page.keyboard.press('Escape');
  await expect(shell).toHaveAttribute('data-screen-mode', 'standard');
  await expect(
    page.getByRole('button', { name: 'Exit screen mode', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.docbar')).toBeVisible();
  expect(
    await canvas.evaluate((element) =>
      (element as HTMLCanvasElement).toDataURL(),
    ),
  ).toBe(before);
});

test('F cycles screen modes, persists the preference, and wraps to Standard', async ({
  page,
}) => {
  const shell = page.getByTestId('editor-shell');
  await page.keyboard.press('F');
  await expect(shell).toHaveAttribute('data-screen-mode', 'full-menu');
  await page.keyboard.press('F');
  await expect(shell).toHaveAttribute('data-screen-mode', 'full');
  await page.reload();
  await expect(shell).toHaveAttribute('data-screen-mode', 'full');
  await page.keyboard.press('F');
  await expect(shell).toHaveAttribute('data-screen-mode', 'standard');
});

test('Full Screen gives the canvas the viewport while preserving the editor draft', async ({
  page,
}) => {
  const shell = page.getByTestId('editor-shell');
  const canvas = page.getByTestId('editor-canvas');
  const before = await canvas.evaluate((element) =>
    (element as HTMLCanvasElement).toDataURL(),
  );
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Full Screen', exact: true })
    .click();
  await expect(shell).toHaveAttribute('data-screen-mode', 'full');
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.locator('.inspector')).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Exit screen mode', exact: true }),
  ).toBeVisible();
  expect(
    await canvas.evaluate((element) =>
      (element as HTMLCanvasElement).toDataURL(),
    ),
  ).toBe(before);
  await page
    .getByRole('button', { name: 'Exit screen mode', exact: true })
    .click();
  await expect(shell).toHaveAttribute('data-screen-mode', 'standard');
});

test('screen modes remain keyboard reachable on the mobile viewport', async ({
  page,
}) => {
  await page.keyboard.press('F');
  await expect(page.getByTestId('editor-shell')).toHaveAttribute(
    'data-screen-mode',
    'full-menu',
  );
  const exit = page.getByRole('button', {
    name: 'Exit screen mode',
    exact: true,
  });
  await expect(exit).toBeVisible();
  const box = await exit.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(30);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('editor-shell')).toHaveAttribute(
    'data-screen-mode',
    'standard',
  );
});
