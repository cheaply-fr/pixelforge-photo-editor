import { test, expect } from '@playwright/test';
import { openPanel } from './sidebar-panels';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
});

test('offline shell reopens a bookmarked local draft after the service worker is ready', async ({
  page,
}) => {
  await page.goto('/editor?new=1', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );

  const documentName = page.getByLabel('Document name', { exact: true });
  await documentName.fill('offline-round-trip');
  await documentName.press('Tab');
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Saved on this device');

  // Registration happens after the first production page load. Reload once
  // online so the service worker controls this bookmarked document before
  // the network is disabled.
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker?.controller)),
    )
    .toBe(true);
  const bookmark = await page.evaluate(() => location.href);
  const registration = await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready;
    return {
      scope: ready.scope,
      active: ready.active?.state,
      controlled: navigator.serviceWorker.controller !== null,
    };
  });
  expect(registration.scope).toContain('/');
  expect(registration.active).toBe('activated');
  expect(registration.controlled).toBe(true);

  await page.context().setOffline(true);
  try {
    await page.goto(bookmark, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('application')).toHaveAttribute(
      'aria-busy',
      'false',
    );
    await expect(documentName).toHaveValue('offline-round-trip');
    await expect(
      page.getByRole('status', { name: 'Draft save status' }),
    ).toHaveText('Saved on this device');
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)))
      .toBe(true);
  } finally {
    await page.context().setOffline(false);
  }
});

test('offline cloud save reports a failure while preserving the local draft', async ({
  page,
}) => {
  await page.unroute(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
  );
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('action') === 'session')
        return route.fulfill({
          json: {
            authenticated: true,
            user: {
              id: 'a6135ab2-0c9f-4f07-a78d-86648d6fb10a',
              name: 'Offline test member',
            },
          },
        });
      return route.continue();
    },
  );
  await page.goto('/editor?new=1', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await page.getByLabel('Document name', { exact: true }).fill('cloud-offline');
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Saved on this device');
  await openPanel(page, 'My projects');
  await expect(
    page.getByRole('button', { name: 'Save to my projects', exact: true }),
  ).toBeVisible();

  await page.context().setOffline(true);
  try {
    await page.getByRole('button', { name: 'Save to my projects', exact: true }).click();
    await expect(
      page.getByText(/Cloud projects are unavailable|Cloud save failed|Failed to fetch|NetworkError/),
    ).toBeVisible();
    await expect(
      page.getByRole('status', { name: 'Draft save status' }),
    ).toHaveText('Saved on this device');
    await expect(page.getByLabel('Document name', { exact: true })).toHaveValue(
      'cloud-offline',
    );
  } finally {
    await page.context().setOffline(false);
  }
});
