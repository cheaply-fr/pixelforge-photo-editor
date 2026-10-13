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
      value: { writeText: async (value: string) => { (window as unknown as { copiedSvg?: string }).copiedSvg = value; } },
    });
  });
});

test('Copy SVG exports the active editable work path without changing the draft on desktop/mobile', async ({ page }) => {
  await selectTool(page, 'Select');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.65, { steps: 4 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Create Work Path', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Layer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Copy SVG', exact: true }).click();
  await expect(page.getByText('SVG copied from the editable vector layer', { exact: true })).toBeVisible();
  const svg = await page.evaluate(() => (window as unknown as { copiedSvg?: string }).copiedSvg || '');
  expect(svg).toMatch(/^<svg xmlns=/);
  expect(svg).toContain('<path');
  expect(svg).toContain('M ');
});
