import { downloadedProject } from './project-file';
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
});

const project = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const download = await pending;
  return (await downloadedProject((await download.path())!)) as {
    history: Array<{ selection?: { mask?: string } }>;
    assets: Record<string, { url: string; w: number; h: number }>;
    index: number;
  };
};

for (const kind of ['Subject', 'Sky'] as const) {
  test(`${kind} selection creates an offline mask and survives project reload`, async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await page.getByRole('menuitem', { name: kind, exact: true }).click();
    await expect(
      page.getByText(`${kind} selection created (local offline proxy)`, {
        exact: true,
      }),
    ).toBeVisible();
    let saved = await project(page);
    const frame = saved.history[saved.index];
    expect(frame.selection?.mask).toBeTruthy();
    const mask = saved.assets[frame.selection!.mask!];
    expect(mask.w).toBeGreaterThan(0);
    expect(mask.h).toBeGreaterThan(0);
    await page.reload();
    saved = await project(page);
    expect(saved.history[saved.index].selection?.mask).toBe(
      frame.selection?.mask,
    );
  });
}
