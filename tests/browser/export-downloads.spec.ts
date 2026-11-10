import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readPortableBundle } from '../../src/portableBundle';

type DownloadProbe = {
  created: Array<{ url: string; type: string; size: number }>;
  clicks: Array<{ href: string; download: string; connected: boolean }>;
  revoked: string[];
  remaining: number;
};

type PickerProbe = {
  options: Array<{ suggestedName: string; types: Array<{ accept: Record<string, string[]> }> }>;
  written: number[][];
};

/** Record object URLs, anchor clicks and revocations made by the page. */
const instrumentDownloads = (page: Page) =>
  page.addInitScript(() => {
    const probe = { created: [], clicks: [], revoked: [], remaining: 0 } as unknown as DownloadProbe;
    (window as unknown as { __downloads: DownloadProbe }).__downloads = probe;
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      const url = create(blob);
      if (blob instanceof Blob) probe.created.push({ url, type: blob.type, size: blob.size });
      return url;
    };
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url: string) => {
      probe.revoked.push(url);
      revoke(url);
    };
    const click = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'click')!.value as (this: HTMLElement) => void;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.download)
        probe.clicks.push({ href: this.href, download: this.download, connected: this.isConnected });
      return click.call(this);
    };
  });

/** Replace the File System Access picker with an in-page fake. */
const mockPicker = (page: Page, mode: 'save' | 'cancel' | 'blocked') =>
  page.addInitScript((pickerMode) => {
    const probe = { options: [], written: [] } as unknown as PickerProbe;
    (window as unknown as { __picker: PickerProbe }).__picker = probe;
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async (options: PickerProbe['options'][number]) => {
        probe.options.push(options);
        if (pickerMode === 'cancel') throw new DOMException('Cancelled', 'AbortError');
        if (pickerMode === 'blocked') throw new DOMException('Blocked', 'SecurityError');
        return {
          createWritable: async () => ({
            write: async (data: Blob) => {
              probe.written.push(Array.from(new Uint8Array(await data.arrayBuffer())));
            },
            close: async () => undefined,
          }),
        };
      },
    });
  }, mode);

const removePicker = (page: Page) =>
  page.addInitScript(() => {
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });

const prepare = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
};

const openExport = async (page: Page, format: string) => {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Export format').selectOption(format);
  await expect(page.getByLabel('Encoded file size')).toHaveAttribute('data-bytes', /\d+/, {
    timeout: 15_000,
  });
};

const probe = (page: Page) =>
  page.evaluate(() => {
    const value = (window as unknown as { __downloads: DownloadProbe }).__downloads;
    return { ...value, remaining: document.querySelectorAll('a[download]').length };
  });

const SIGNATURES: Record<string, { ext: string; mime: string; magic: number[] }> = {
  png: { ext: 'png', mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47] },
  jpeg: { ext: 'jpg', mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  webp: { ext: 'webp', mime: 'image/webp', magic: [0x52, 0x49, 0x46, 0x46] },
  psd: { ext: 'psd', mime: 'image/vnd.adobe.photoshop', magic: [0x38, 0x42, 0x50, 0x53] },
  pdf: { ext: 'pdf', mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46] },
};

test.describe('anchor downloads', () => {
  test.beforeEach(async ({ page }) => {
    await instrumentDownloads(page);
    await prepare(page);
  });

  for (const [format, expected] of Object.entries(SIGNATURES)) {
    test(`${format.toUpperCase()} export downloads with filename, MIME type and an attached anchor`, async ({ page }) => {
      await openExport(page, format);
      const pending = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download image', exact: true }).click();
      const download = await pending;
      expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${expected.ext}$`));
      const bytes = await readFile((await download.path())!);
      expect(Array.from(bytes.subarray(0, expected.magic.length))).toEqual(expected.magic);

      const state = await probe(page);
      const click = state.clicks.at(-1)!;
      expect(click.download).toBe(download.suggestedFilename());
      expect(click.connected).toBe(true);
      expect(state.remaining).toBe(0);
      const blob = state.created.find((item) => item.url === click.href)!;
      expect(blob.type).toBe(expected.mime);
      expect(blob.size).toBe(bytes.length);
      // The download URL is not revoked immediately after the click.
      expect(state.revoked).not.toContain(click.href);
      await expect(page.getByText(/export downloaded \(/)).toBeVisible();
      // Closing the dialog (which revokes its preview URL) must not revoke the download URL.
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      expect((await probe(page)).revoked).not.toContain(click.href);
    });
  }

  test('project downloads use application/zip and an attached anchor', async ({ page }) => {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(/\.pixelforge$/);
    const bytes = await readFile((await download.path())!);
    const project = (await readPortableBundle(new Blob([bytes]))) as { history: unknown[] };
    expect(project.history.length).toBeGreaterThan(0);
    const state = await probe(page);
    const click = state.clicks.at(-1)!;
    expect(click.connected).toBe(true);
    expect(state.created.find((item) => item.url === click.href)?.type).toBe('application/zip');
    expect(state.revoked).not.toContain(click.href);
    await expect(page.locator('footer')).toContainText('Editable project file downloaded');
  });
});

test.describe('file picker', () => {
  test('Save with file picker writes the encoded PNG without an anchor download', async ({ page }) => {
    await instrumentDownloads(page);
    await mockPicker(page, 'save');
    await prepare(page);
    await openExport(page, 'png');
    await expect(page.getByTestId('export-picker-note')).toBeVisible();
    await page.getByRole('button', { name: 'Save with file picker…', exact: true }).click();
    await expect(page.getByText(/PNG export saved with the file picker/)).toBeVisible();
    const picker = await page.evaluate(() => (window as unknown as { __picker: PickerProbe }).__picker);
    expect(picker.options[0].suggestedName).toMatch(/\.png$/);
    expect(picker.options[0].types[0].accept).toEqual({ 'image/png': ['.png'] });
    expect(picker.written[0].slice(0, 4)).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect((await probe(page)).clicks).toHaveLength(0);
  });

  test('a cancelled picker writes nothing and starts no download', async ({ page }) => {
    await instrumentDownloads(page);
    await mockPicker(page, 'cancel');
    await prepare(page);
    await openExport(page, 'jpeg');
    await page.getByRole('button', { name: 'Save with file picker…', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save with file picker…', exact: true })).toBeEnabled();
    const picker = await page.evaluate(() => (window as unknown as { __picker: PickerProbe }).__picker);
    expect(picker.options).toHaveLength(1);
    expect(picker.written).toHaveLength(0);
    expect((await probe(page)).clicks).toHaveLength(0);
  });

  test('a blocked picker falls back to the anchor download', async ({ page }) => {
    await instrumentDownloads(page);
    await mockPicker(page, 'blocked');
    await prepare(page);
    await openExport(page, 'webp');
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save with file picker…', exact: true }).click();
    expect((await pending).suggestedFilename()).toMatch(/\.webp$/);
    await expect(page.getByText(/blocked the file picker.*downloaded instead/)).toBeVisible();
  });

  test('File → Save project with file picker writes a readable project', async ({ page }) => {
    await mockPicker(page, 'save');
    await prepare(page);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Save project with file picker…', exact: true }).click();
    await expect(page.locator('footer')).toContainText('Editable project file saved with the file picker');
    const picker = await page.evaluate(() => (window as unknown as { __picker: PickerProbe }).__picker);
    expect(picker.options[0].suggestedName).toMatch(/\.pixelforge$/);
    const project = (await readPortableBundle(new Blob([new Uint8Array(picker.written[0])]))) as {
      history: unknown[];
    };
    expect(project.history.length).toBeGreaterThan(0);
  });

  test('without the File System Access API the picker button is hidden and the project menu downloads', async ({ page }) => {
    await removePicker(page);
    await prepare(page);
    await openExport(page, 'png');
    await expect(page.getByRole('button', { name: 'Save with file picker…' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Save project with file picker…', exact: true }).click();
    expect((await pending).suggestedFilename()).toMatch(/\.pixelforge$/);
    await expect(page.locator('footer')).toContainText('downloaded instead');
  });
});
