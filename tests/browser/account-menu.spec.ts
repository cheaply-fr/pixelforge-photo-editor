import { test, expect } from '@playwright/test';

async function openEditor(page: import('@playwright/test').Page) {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
}

test('anonymous editing gets a stable artistic avatar and clear sign-in path', async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await openEditor(page);
  const trigger = page.getByRole('button', { name: 'Open guest profile menu' });
  await expect(trigger).toContainText('Guest editor');
  await expect(trigger).toContainText('Anonymous · local only');
  const avatar = trigger.locator('svg').first();
  await expect(avatar).toBeVisible();
  await trigger.click();
  await expect(page.getByRole('menu', { name: 'Account menu' })).toBeVisible();
  await expect(page.getByText('Editing is free without an account.')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Sign in with Cheaply' })).toHaveAttribute(
    'href',
    'https://marketplace.cheaply.fr/marketplace/photoeditor',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Account menu' })).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('authenticated account exposes projects, profile and shared logout routes', async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: true, user: { id: 'member-test', name: 'Test Creator' } } }),
  );
  await openEditor(page);
  const trigger = page.getByRole('button', { name: 'Open account menu for Test Creator' });
  await expect(trigger).toContainText('Test Creator');
  await expect(trigger).toContainText('Cheaply account');
  await trigger.click();
  await expect(page.getByRole('menuitem', { name: 'My projects' })).toHaveAttribute('href', '/#projects-heading');
  await expect(page.getByRole('menuitem', { name: 'Cheaply profile' })).toHaveAttribute(
    'href',
    'https://marketplace.cheaply.fr/marketplace/profile',
  );
  await expect(page.getByRole('menuitem', { name: 'Sign out' })).toHaveAttribute(
    'href',
    'https://marketplace.cheaply.fr/marketplace/auth/logout',
  );
  await page.mouse.click(20, 120);
  await expect(page.getByRole('menu', { name: 'Account menu' })).toBeHidden();
});

test('public home keeps the same optional-account affordance', async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Open guest profile menu' });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByRole('menuitem', { name: 'Sign in with Cheaply' })).toBeVisible();
});

// When the Cheaply account service is down (it returned 503 for every page on
// 2026-11-04), the menu must explain that instead of linking to an error page.
const SESSION = 'https://marketplace.cheaply.fr/marketplace/api/photoeditor**';
const outageHtml = '<html><body><h1>Error: Server Error</h1><h2>The service you requested is not available yet.</h2></body></html>';

test('an account-service outage shows a clear message instead of a broken sign-in link', async ({ page }) => {
  await page.route(SESSION, (route) => route.fulfill({ status: 503, contentType: 'text/html', body: outageHtml }));
  await openEditor(page);
  const trigger = page.getByRole('button', { name: 'Open guest profile menu' });
  await expect(trigger).toContainText('Sign-in unavailable · local only');
  await trigger.click();
  const menu = page.getByRole('menu', { name: 'Account menu' });
  await expect(menu).toContainText('Sign-in is unavailable right now');
  await expect(menu).toContainText('Your work is still saved on this device');
  // No link to the failing sign-in page while the service is down.
  await expect(page.getByRole('menuitem', { name: 'Sign in with Cheaply' })).toHaveCount(0);
  await expect(menu.locator('a[href*="marketplace.cheaply.fr/marketplace/photoeditor"]')).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Try again' })).toBeEnabled();
  // Local editing keeps working during the outage.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
});

test('Try again restores the normal sign-in link once the service recovers', async ({ page }) => {
  let healthy = false;
  await page.route(SESSION, (route) =>
    healthy
      ? route.fulfill({ json: { authenticated: false } })
      : route.fulfill({ status: 503, contentType: 'text/html', body: outageHtml }),
  );
  await openEditor(page);
  const trigger = page.getByRole('button', { name: 'Open guest profile menu' });
  await expect(trigger).toContainText('Sign-in unavailable');
  await trigger.click();
  healthy = true;
  await page.getByRole('menuitem', { name: 'Try again' }).click();
  await expect(page.getByRole('menuitem', { name: 'Sign in with Cheaply' })).toHaveAttribute(
    'href',
    'https://marketplace.cheaply.fr/marketplace/photoeditor',
  );
  await expect(page.getByText('Sign-in is unavailable right now')).toHaveCount(0);
  await expect(trigger).toContainText('Anonymous · local only');
});

test('a network failure is treated as unavailable, and a signed-in session clears it', async ({ page }) => {
  let mode: 'down' | 'member' = 'down';
  await page.route(SESSION, (route) =>
    mode === 'down'
      ? route.abort('connectionrefused')
      : route.fulfill({ json: { authenticated: true, user: { id: 'member-test', name: 'Test Creator' } } }),
  );
  await openEditor(page);
  await expect(page.getByRole('button', { name: 'Open guest profile menu' })).toContainText('Sign-in unavailable');
  // The session is re-checked when the window regains focus.
  mode = 'member';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const member = page.getByRole('button', { name: 'Open account menu for Test Creator' });
  await expect(member).toContainText('Cheaply account');
  await member.click();
  await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByText('Sign-in is unavailable right now')).toHaveCount(0);
});

test('the public home page shows the same outage message', async ({ page }) => {
  await page.route(SESSION, (route) => route.fulfill({ status: 500, contentType: 'text/html', body: outageHtml }));
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Open guest profile menu' });
  await trigger.click();
  await expect(page.getByRole('menu', { name: 'Account menu' })).toContainText('Sign-in is unavailable right now');
  await expect(page.getByRole('menuitem', { name: 'Try again' })).toBeVisible();
  const box = (await page.getByRole('menu', { name: 'Account menu' }).boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
});
