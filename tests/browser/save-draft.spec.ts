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

test('the saved time stays readable after Save draft on every width', async ({ page }) => {
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(status(page)).toHaveText(/^Saved on this device · \d{2}:\d{2}$/);
  const notice = page.locator('footer > span').first();
  await expect(notice).toContainText(/^Draft saved on this device at \d{2}:\d{2}\.$/);
  const fit = (locator: ReturnType<typeof page.locator>) =>
    locator.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth, shown: (element as HTMLElement).innerText }));
  for (const target of [status(page), notice]) {
    const box = await fit(target);
    // Nothing is cut off, and the time itself is on screen.
    expect(box.scroll, box.shown).toBeLessThanOrEqual(box.client + 1);
    expect(box.shown).toMatch(/\d{2}:\d{2}/);
  }
  const phone = page.viewportSize()!.width <= 680;
  // Phones drop "on this device" visually; the text content is unchanged.
  expect((await fit(status(page))).shown).toMatch(phone ? /^Saved · \d{2}:\d{2}$/ : /^Saved on this device · \d{2}:\d{2}$/);
  expect((await fit(notice)).shown).toMatch(phone ? /Draft saved at \d{2}:\d{2}\./ : /Draft saved on this device at \d{2}:\d{2}\./);
});

test('doc bar draft actions are at least 24 px tall, 32 px or more on touch screens', async ({ page }, info) => {
  const touch = info.project.name === 'mobile';
  for (const control of [
    page.getByRole('button', { name: 'Save draft', exact: true }),
    page.getByRole('button', { name: 'Duplicate draft', exact: true }),
    page.getByRole('link', { name: 'Home', exact: true }),
    page.getByRole('button', { name: 'Discard draft', exact: true }),
  ]) {
    const box = (await control.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(touch ? 32 : 24);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    // The whole target takes taps: not clipped by the doc bar or covered.
    for (const y of [box.y + 2, box.y + box.height - 2]) {
      const hit = await page.evaluate(([x, py]) => {
        const element = document.elementFromPoint(x, py);
        return element?.closest('a, button')?.textContent?.trim() ?? null;
      }, [box.x + box.width / 2, y]);
      expect(hit).toBe((await control.textContent())!.trim());
    }
  }
  // The doc bar still fits without horizontal overflow.
  const overflow = await page.locator('.docbar').evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('after opening a photo, the status line and the document name are not cut off', async ({ page }) => {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 900;
    canvas.getContext('2d')!.fillRect(0, 0, 40, 40);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('file-input').setInputFiles({ name: 'sample-landscape.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1200');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByTestId('render-status')).toHaveText('Render ready');
  await expect(status(page)).toHaveText('Saved on this device');
  const phone = page.viewportSize()!.width <= 680;
  const fit = (locator: ReturnType<typeof page.locator>) =>
    locator.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth, shown: (element as HTMLElement).innerText.trim() }));
  // The statuses keep their whole text; phones say "Saved" (the text
  // content still reads "Saved on this device").
  for (const [target, shown] of [
    [page.getByTestId('render-status'), 'Render ready'],
    [status(page), phone ? 'Saved' : 'Saved on this device'],
  ] as const) {
    const box = await fit(target);
    expect(box.shown).toBe(shown);
    expect(box.scroll, shown).toBeLessThanOrEqual(box.client + 1);
  }
  // The status line itself does not overflow; Save JPEG is fully on screen.
  const footer = page.locator('.editor-shell footer');
  expect(await footer.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0);
  const save = (await footer.getByRole('button', { name: 'Save JPEG' }).boundingBox())!;
  expect(save.x + save.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  // The whole document name is shown; a name too long for its room ends in
  // an ellipsis instead of being clipped.
  const name = page.getByLabel('Document name');
  await expect(name).toHaveValue('sample-landscape');
  const field = await name.evaluate((element) => ({
    scroll: element.scrollWidth,
    client: element.clientWidth,
    overflow: getComputedStyle(element).textOverflow,
  }));
  expect(field.scroll).toBeLessThanOrEqual(field.client);
  expect(field.overflow).toBe('ellipsis');
  if (phone) {
    // On phones the name takes its row of the doc bar.
    const docbar = (await page.locator('.docbar').boundingBox())!;
    expect((await name.boundingBox())!.width).toBeGreaterThan(docbar.width * 0.7);
  }
});
