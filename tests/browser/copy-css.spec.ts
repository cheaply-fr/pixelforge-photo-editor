import { test, expect } from '@playwright/test';
import { selectTool } from './tool-selection';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value: string) => { (window as unknown as { copiedCss?: string }).copiedCss = value; } },
    });
  });
});

test('Copy CSS exports the active editable vector layer without changing the draft', async ({ page }) => {
  await selectTool(page, 'Polygon');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.65, { steps: 4 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Copy CSS', exact: true }).click();
  await expect(page.getByText('CSS copied from the editable layer', { exact: true })).toBeVisible();
  const css = await page.evaluate(() => (window as unknown as { copiedCss?: string }).copiedCss || '');
  expect(css).toMatch(/^\.pixelforge-layer-/);
  expect(css).toContain('border:');
  expect(css).toContain('transform: matrix(');
});

