import { expect, test } from '@playwright/test';
import { selectTool } from './tool-selection';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

async function drawShape(page: import('@playwright/test').Page, x: number, y: number) {
  await selectTool(page, 'Shape');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * (x + 0.08), box.y + box.height * (y + 0.06), { steps: 3 });
  await page.mouse.up();
}

test('Find Layers searches names, metadata and visible results without changing selection', async ({ page }) => {
  await drawShape(page, 0.08, 0.1);
  await drawShape(page, 0.3, 0.2);
  await drawShape(page, 0.55, 0.3);
  const active = page.getByRole('button', { name: 'Select layer Rectangle 3', exact: true });
  await expect(active).toHaveAttribute('data-selected', 'true');

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Find Layers/ }).click();
  const search = page.getByRole('searchbox', { name: 'Find layers', exact: true });
  await expect(search).toBeFocused();
  await search.fill('rectangle 2');
  await expect(page.getByRole('button', { name: 'Select layer Rectangle 2', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select layer Rectangle 1', exact: true })).toHaveCount(0);
  await expect(page.getByText('1 of 4 layers match', { exact: true })).toBeVisible();
  await expect(active).toHaveCount(0);

  await search.fill('visible rectangle');
  await expect(page.getByText('3 of 4 layers match', { exact: true })).toBeVisible();
  await expect(active).toHaveAttribute('data-selected', 'true');
  await search.fill('does-not-exist');
  await expect(page.getByText('No layers match this search.', { exact: true })).toBeVisible();
});
