import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';
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

test('Select and Mask smooths and feathers an existing selection through reload', async ({ page }) => {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await selectTool(page, 'Select');
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByText('Rectangular selection created', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Select and Mask…', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Select and Mask' })).toBeVisible();
  await page.getByLabel('Select and Mask edge smoothing (px)', { exact: true }).fill('3');
  await page.getByLabel('Select and Mask feather (px)', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'Apply Select and Mask', exact: true }).click();
  await expect(page.getByText('Select and Mask applied (smooth 3 px, feather 8 px)', { exact: true })).toBeVisible();
  let saved = await project(page);
  expect(saved.history[saved.index].selection?.mask).toBeTruthy();
  await page.reload();
  saved = await project(page);
  expect(saved.history[saved.index].selection?.mask).toBeTruthy();
});
