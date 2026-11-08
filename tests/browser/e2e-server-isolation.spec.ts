import { expect, test } from '@playwright/test';
import { playwrightServerSettings } from '../../playwright.settings.mjs';

// W4-10: the suite must talk to the preview server this run started, on the
// configured port, not to a server left running by another worktree.
test('the suite runs against the preview server on the configured port', async ({ page, baseURL }) => {
  const settings = playwrightServerSettings(process.env);
  expect(baseURL).toBe(settings.baseURL);
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  expect(new URL(page.url()).port).toBe(String(settings.port));
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const release = await page.request.get('/release.json');
  expect(release.ok()).toBe(true);
  expect(typeof (await release.json())).toBe('object');
});
