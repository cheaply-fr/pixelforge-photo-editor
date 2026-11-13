import { test, expect, type Page } from '@playwright/test';

// Doc bar "Save draft" flushes the local autosave on demand (IndexedDB only:
// no download, no cloud upload). "Duplicate draft" forks the open document
// into a new local bookmark while the original draft stays stored.

const status = (page: Page) =>
  page.getByRole('status', { name: 'Draft save status' });

const draftIdFromUrl = (url: string) =>
  new URL(url).hash.match(/draft=([^&]+)/)?.[1] ?? '';

async function storedDraftIds(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const request = indexedDB.open('pixelforge-documents');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const keys = db
            .transaction('drafts', 'readonly')
            .objectStore('drafts')
            .getAllKeys();
          keys.onerror = () => reject(keys.error);
          keys.onsuccess = () => {
            db.close();
            resolve(keys.result.map(String));
          };
        };
      }),
  );
}

let downloads = 0;
let writes: string[] = [];

test.beforeEach(async ({ page }) => {
  downloads = 0;
  writes = [];
  page.on('download', () => downloads++);
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.method() !== 'HEAD')
      writes.push(`${request.method()} ${request.url()}`);
  });
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(status(page)).toHaveText('Saved on this device');
});

test('Save draft saves on this device now without downloading or uploading, and reload restores it', async ({
  page,
}) => {
  const save = page.getByRole('button', { name: 'Save draft', exact: true });
  await expect(save).toBeVisible();
  await expect(save).toBeEnabled();
  await expect(save).toHaveAccessibleDescription(
    /Saves this draft in this browser now\. Nothing is downloaded or uploaded\./,
  );
  const bookmark = page.url();

  await page.getByLabel('Document name').fill('Hours of painting');
  await save.click();
  await expect(status(page)).toHaveText(/^Saved on this device · \d{2}:\d{2}$/);
  await expect(page.locator('footer > span').first()).toContainText(
    /Draft saved on this device at \d{2}:\d{2}\./,
  );
  // Saving again with no further edits still reports a fresh save.
  await save.click();
  await expect(status(page)).toHaveText(/^Saved on this device · \d{2}:\d{2}$/);

  expect(downloads).toBe(0);
  expect(writes).toEqual([]);
  expect(page.url()).toBe(bookmark);

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.getByLabel('Document name')).toHaveValue('Hours of painting');
  await expect(status(page)).toHaveText('Saved on this device');
  expect(downloads).toBe(0);
});

test('Duplicate draft opens a new draft id and keeps the original draft stored', async ({
  page,
}) => {
  await page.getByLabel('Document name').fill('Original work');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(status(page)).toHaveText(/^Saved on this device · /);
  const originalUrl = page.url();
  const originalId = draftIdFromUrl(originalUrl);
  expect(originalId).not.toBe('');

  const duplicate = page.getByRole('button', {
    name: 'Duplicate draft',
    exact: true,
  });
  await expect(duplicate).toHaveAccessibleDescription(
    /Keeps the original draft unchanged and continues on a new copy saved in this browser\./,
  );
  await expect(
    page.getByRole('button', { name: 'Save local copy', exact: true }),
  ).toHaveCount(0);
  await duplicate.click();
  await expect(page.locator('footer > span').first()).toContainText(
    'Draft duplicated.',
  );
  await expect.poll(() => draftIdFromUrl(page.url())).not.toBe(originalId);
  const copyId = draftIdFromUrl(page.url());
  expect(copyId).not.toBe('');
  await expect(status(page)).toHaveText('Saved on this device');

  await page.getByLabel('Document name').fill('Copy work');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(status(page)).toHaveText(/^Saved on this device · /);

  await expect
    .poll(() => storedDraftIds(page))
    .toEqual(expect.arrayContaining([originalId, copyId]));
  expect(downloads).toBe(0);
  expect(writes).toEqual([]);

  // A hash-only bookmark change makes the editor reopen that draft itself.
  await page.goto(originalUrl);
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.getByLabel('Document name')).toHaveValue('Original work');
});

test('doc bar draft actions fit without horizontal overflow', async ({ page }) => {
  const docbar = page.locator('.docbar');
  const overflow = await docbar.evaluate((node) => ({
    scroll: node.scrollWidth,
    client: node.clientWidth,
    page: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
  expect(overflow.page).toBeLessThanOrEqual(overflow.viewport);
  const viewport = page.viewportSize()!;
  for (const name of ['Save draft', 'Duplicate draft', 'Discard draft']) {
    const box = await page
      .getByRole('button', { name, exact: true })
      .boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 0.5);
  }
  const home = await page.getByRole('link', { name: 'Home', exact: true }).boundingBox();
  expect(home!.x + home!.width).toBeLessThanOrEqual(viewport.width + 0.5);
});
