import { expect, test } from '@playwright/test';

test.describe('history timeline', () => {
  test('shows committed states and restores a prior state locally', async ({ page }) => {
    await page.route(
      'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
      (route) => route.fulfill({ json: { authenticated: false } }),
    );
    await page.goto('/editor?new=1');
    await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
    const history = page.getByRole('region', { name: 'History' });
    await expect(history).toBeVisible();
    await expect(history.getByLabel('History position')).toHaveText(/1 \/ 1/);
    await page.getByRole('button', { name: 'Add paint layer' }).click();
    await expect(history.getByLabel('History position')).toHaveText(/2 \/ 2/);
    await history.getByRole('button', { name: /Restore history step 1:/ }).click();
    await expect(history.getByLabel('History position')).toHaveText(/1 \/ 2/);
    await expect(page.getByLabel('Draft save status')).not.toHaveText('Conflict');
  });
});
