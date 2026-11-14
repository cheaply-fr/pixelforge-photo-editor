import { test, expect } from '@playwright/test';

/* The sub-tool corner triangle must not cover any tool label text, on desktop or phones. */

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

test('sub-tool arrows never overlap tool label text', async ({ page }) => {
  const report = await page.evaluate(() => {
    const overlaps: string[] = [];
    let checked = 0;
    for (const button of document.querySelectorAll<HTMLButtonElement>('.toolbar button')) {
      const arrow = button.querySelector('.tool-subtool-arrow');
      if (!arrow) continue;
      const a = arrow.getBoundingClientRect();
      if (!a.width && !a.height) continue;
      checked += 1;
      // The triangle's border box (8 px square), shrunk by a hair for anti-aliasing.
      const box = { left: a.left + 0.5, right: a.right - 0.5, top: a.top + 0.5, bottom: a.bottom - 0.5 };
      for (const label of button.querySelectorAll('span:not(.tool-icon):not(.tool-subtool-arrow), kbd')) {
        if (getComputedStyle(label).display === 'none') continue;
        const range = document.createRange();
        range.selectNodeContents(label);
        for (const rect of range.getClientRects()) {
          if (!rect.width || !rect.height) continue;
          if (rect.left < box.right && box.left < rect.right && rect.top < box.bottom && box.top < rect.bottom)
            overlaps.push(`${button.getAttribute('aria-label')}: "${label.textContent}"`);
        }
      }
    }
    return { checked, overlaps };
  });
  expect(report.checked).toBeGreaterThan(5);
  expect(report.overlaps).toEqual([]);
});
