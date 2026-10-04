import { test, expect } from '@playwright/test';

async function project(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const download = await pending;
  const path = await download.path();
  return JSON.parse(
    await (await import('node:fs/promises')).readFile(path!, 'utf8'),
  ) as { history: unknown[]; index: number };
}

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
});

test('menus, transformations, undo and PNG export work', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(
    page.getByRole('application', { name: 'PixelForge photo editor' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'New transparent document', exact: true })
    .click();
  await expect(page.getByLabel('Document name')).toHaveValue(
    'untitled-transparent',
  );
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'width',
    '1200',
  );
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Rotate right', exact: true })
    .click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'width',
    '800',
  );
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'width',
    '1200',
  );
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download image', exact: true })
    .click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('untitled-transparent.png');
  expect(await download.failure()).toBeNull();
  expect(errors).toEqual([]);
});

test('PNG JPEG and WebP exports report bytes, quality and persist preferences', async ({
  page,
}) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Saved on this device');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'New transparent document', exact: true })
    .click();
  const readSignature = async (format: 'png' | 'jpeg' | 'webp') => {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByLabel('Export format').selectOption(format);
    if (format === 'jpeg')
      await expect(
        page.getByText('Transparent areas become white.', { exact: false }),
      ).toBeVisible();
    const bytes = page.getByLabel('Encoded file size');
    await expect(bytes).toHaveAttribute('data-bytes', /\d+/, {
      timeout: 15_000,
    });
    const pending = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Download image', exact: true })
      .click();
    const path = await (await pending).path();
    const buffer = await (await import('node:fs/promises')).readFile(path!);
    const encodedBytes = Number(await bytes.getAttribute('data-bytes'));
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    return { buffer, bytes: encodedBytes };
  };
  const png = await readSignature('png');
  expect(png.buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  const jpeg = await readSignature('jpeg');
  expect(jpeg.buffer.subarray(0, 2).toString('hex')).toBe('ffd8');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Export format').selectOption('webp');
  await page.getByLabel('Export quality').fill('20');
  const webpBytes = page.getByLabel('Encoded file size');
  await expect(webpBytes).toHaveAttribute('data-bytes', /\d+/, {
    timeout: 15_000,
  });
  const low = Number(await webpBytes.getAttribute('data-bytes'));
  await page.getByLabel('Export quality').fill('95');
  await expect(webpBytes).toHaveAttribute('data-bytes', /\d+/, {
    timeout: 15_000,
  });
  const high = Number(await webpBytes.getAttribute('data-bytes'));
  expect(high).not.toBe(low);
  await expect(
    page.getByText(
      'WebP uses lossy color compression and preserves transparency.',
      { exact: false },
    ),
  ).toBeVisible();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download image', exact: true })
    .click();
  const webpPath = await (await pending).path();
  const webp = await (await import('node:fs/promises')).readFile(webpPath!);
  expect(webp.subarray(0, 4).toString()).toBe('RIFF');
  expect(webp.subarray(8, 12).toString()).toBe('WEBP');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByLabel('Export format')).toHaveValue('webp');
  await expect(page.getByLabel('Export quality')).toHaveValue('95');
  await expect(page.getByLabel('Encoded file size')).toHaveAttribute(
    'data-bytes',
    /\d+/,
  );
});

test('lossy exports honor a persisted target-size budget without metadata', async ({
  page,
}) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Export format').selectOption('jpeg');
  const quality = page.getByLabel('Export quality');
  const size = page.getByLabel('Encoded file size');
  await quality.fill('1');
  await expect(size).toHaveAttribute('data-bytes', /\d+/);
  const minimum = Number(await size.getAttribute('data-bytes'));
  await quality.fill('100');
  await expect(size).toHaveAttribute('data-bytes', /\d+/);
  const maximum = Number(await size.getAttribute('data-bytes'));
  const targetKb = Math.max(1, Math.ceil((minimum + maximum) / 2 / 1024));
  const target = page.getByLabel('Target size (KB)');
  await target.fill(String(targetKb));
  await expect(target).toHaveValue(String(targetKb));
  await expect(
    page.getByText(/highest quality that fits the target/i),
  ).toBeVisible();
  await expect(size).toHaveAttribute('data-bytes', /\d+/);
  const jpegBytes = Number(await size.getAttribute('data-bytes'));
  expect(jpegBytes).toBeLessThanOrEqual(targetKb * 1024);
  await expect(size).toContainText(/target met at \d+% quality/);
  await expect(quality).toBeDisabled();

  const jpegDownload = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download image', exact: true })
    .click();
  const jpegPath = await (await jpegDownload).path();
  const jpeg = await (await import('node:fs/promises')).readFile(jpegPath!);
  expect(jpeg.subarray(0, 2).toString('hex')).toBe('ffd8');
  expect(jpeg.includes(Buffer.from('Exif'))).toBe(false);
  expect(jpeg.includes(Buffer.from('GPS'))).toBe(false);

  await page.getByLabel('Export format').selectOption('webp');
  await expect(size).toHaveAttribute('data-bytes', /\d+/);
  const webpBytes = Number(await size.getAttribute('data-bytes'));
  expect(webpBytes).toBeLessThanOrEqual(targetKb * 1024);
  await expect(size).toContainText(/target met at \d+% quality/);
  const webpDownload = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download image', exact: true })
    .click();
  const webpPath = await (await webpDownload).path();
  const webp = await (await import('node:fs/promises')).readFile(webpPath!);
  expect(webp.subarray(0, 4).toString()).toBe('RIFF');
  expect(webp.subarray(8, 12).toString()).toBe('WEBP');
  expect(webp.includes(Buffer.from('EXIF'))).toBe(false);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const projectDownload = page.waitForEvent('download');
  await page.keyboard.press('Control+Shift+s');
  const projectPath = await (await projectDownload).path();
  const project = JSON.parse(
    await (await import('node:fs/promises')).readFile(projectPath!, 'utf8'),
  ) as { settings: { exportTargetBytes?: number } };
  expect(project.settings.exportTargetBytes).toBe(targetKb * 1024);
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Saved on this device');

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByLabel('Export format')).toHaveValue('webp');
  await expect(page.getByLabel('Target size (KB)')).toHaveValue(
    String(targetKb),
  );
  await expect(page.getByLabel('Encoded file size')).toHaveAttribute(
    'data-bytes',
    /\d+/,
  );
  await expect(page.getByLabel('Encoded file size')).toContainText(
    /target met at \d+% quality/,
  );
});

test('target-size export rejects unsafe boundaries without changing the draft', async ({
  page,
}) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Export format').selectOption('webp');
  const target = page.getByLabel('Target size (KB)');
  await target.fill('0');
  await expect(page.getByRole('alert')).toContainText(
    'between 1 and 65,536 KB',
  );
  await target.fill('65537');
  await expect(page.getByRole('alert')).toContainText(
    'between 1 and 65,536 KB',
  );
  await target.fill('');
  await expect(target).toHaveValue('');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Download image', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByLabel('Export format')).toHaveValue('webp');
  await expect(page.getByLabel('Target size (KB)')).toHaveValue('');
});

test('imports a local image and exposes text controls', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await page.getByTestId('file-input').setInputFiles({
    name: 'sample.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByLabel('Document name')).toHaveValue('sample');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1');
  await page.getByRole('button', { name: 'Text tool', exact: true }).click();
  await expect(page.getByLabel('Text content')).toBeVisible();
});

test('anonymous draft survives reload and bookmark; discard returns home', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Start editing' }).click();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await page.getByLabel('Document name').fill('Recovery test');
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Rotate right', exact: true })
    .click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'width',
    '960',
  );
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Saved on this device');
  const bookmark = page.url();
  const pixels = await page
    .getByTestId('editor-canvas')
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.getByLabel('Document name')).toHaveValue('Recovery test');
  expect(
    await page
      .getByTestId('editor-canvas')
      .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
  ).toBe(pixels);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'width',
    '1440',
  );
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Saved on this device');
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('link', { name: 'Start editing' }).click();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  expect(page.url()).not.toBe(bookmark);
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Saved on this device');
  await page.goto(bookmark);
  await expect(page.getByLabel('Document name')).toHaveValue('Recovery test');
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Saved on this device');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Discard draft' }).click();
  await expect(page.getByLabel('Document name')).toHaveValue('Recovery test');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Discard draft' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('link', { name: 'Start editing' })).toBeVisible();
  await page.goto(bookmark);
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.getByLabel('Document name')).not.toHaveValue(
    'Recovery test',
  );
});

test('blocked local storage never reports a successful save', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      get() {
        throw new Error('Storage blocked');
      },
    });
  });
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Local save failed — export a copy');
  await expect(
    page.getByRole('button', { name: 'Export', exact: true }),
  ).toBeEnabled();
});

test('signed-in users save, revisit and continue cloud projects without automatic uploads', async ({
  page,
}) => {
  const member = {
    id: 'a6135ab2-0c9f-4f07-a78d-86648d6fb10a',
    name: 'Test member',
  };
  let saved: { id: string; generation: string; document: unknown } | undefined;
  let saves = 0;
  let rejectUpdate = false;
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (url.searchParams.get('action') === 'session')
        return route.fulfill({ json: { authenticated: true, user: member } });
      if (request.method() === 'POST') {
        const body = JSON.parse(request.postData()!);
        if (rejectUpdate && body.generation !== '0')
          return route.fulfill({
            status: 409,
            json: {
              error: 'This project changed elsewhere. Save a separate copy.',
            },
          });
        saves++;
        saved = {
          id: body.id,
          generation: String(saves),
          document: body.document,
        };
        return route.fulfill({
          json: { id: saved.id, generation: saved.generation },
        });
      }
      if (url.searchParams.has('id')) return route.fulfill({ json: saved });
      return route.fulfill({
        json: {
          projects: saved
            ? [
                {
                  id: saved.id,
                  name: 'My private art',
                  generation: saved.generation,
                  updatedAt: '2026-10-02T12:00:00Z',
                  bytes: 1000,
                },
              ]
            : [],
        },
      });
    },
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await page.getByLabel('Document name').fill('My private art');
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Saved on this device');
  expect(saves).toBe(0);
  await page.getByRole('button', { name: 'Save to my projects' }).click();
  await expect(
    page.getByText('Cloud copy saved.', { exact: false }),
  ).toBeVisible();
  expect(saves).toBe(1);
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Saved on this device');
  await page.getByRole('link', { name: 'View my projects' }).click();
  await expect(
    page.getByRole('heading', { name: 'My projects' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue editing' }).click();
  await expect(page.getByLabel('Document name')).toHaveValue('My private art');
  await page.getByLabel('Document name').fill('My private art continued');
  await page.getByRole('button', { name: 'Update cloud project' }).click();
  await expect(
    page.getByText('Cloud copy saved.', { exact: false }),
  ).toBeVisible();
  expect(saves).toBe(2);
  const oldId = saved!.id;
  rejectUpdate = true;
  await page.getByRole('button', { name: 'Update cloud project' }).click();
  await expect(
    page.getByText('This project changed elsewhere. Save a separate copy.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel('Document name')).toHaveValue(
    'My private art continued',
  );
  await page.getByRole('button', { name: 'Save as new cloud project' }).click();
  await expect(
    page.getByText('Cloud copy saved.', { exact: false }),
  ).toBeVisible();
  expect(saves).toBe(3);
  expect(saved!.id).not.toBe(oldId);
});

test('exact resizing and project file round-trip retain pixels, dimensions and undo', async ({
  page,
}) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await page.getByLabel('Document name').fill('Portable project');
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Resize image…' }).click();
  await page.getByLabel('Width (px)', { exact: true }).fill('720');
  await expect(page.getByLabel('Height (px)', { exact: true })).toHaveValue(
    '480',
  );
  await page.getByRole('button', { name: 'Apply resize' }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'width',
    '720',
  );
  const pixels = await page
    .getByTestId('editor-canvas')
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file' }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('Portable project.pixelforge');
  const path = await download.path();
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'New transparent document', exact: true })
    .click();
  await page.getByTestId('project-input').setInputFiles(path!);
  await expect(page.getByLabel('Document name')).toHaveValue(
    'Portable project',
  );
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'width',
    '720',
  );
  expect(
    await page
      .getByTestId('editor-canvas')
      .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
  ).toBe(pixels);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'width',
    '1440',
  );
});

test('flipping transparent artwork does not leave duplicate opaque pixels', async ({
  page,
}) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  const fixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 1, 1);
    return canvas.toDataURL().split(',')[1];
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'transparent.png',
    mimeType: 'image/png',
    buffer: Buffer.from(fixture, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '2');
  await page
    .getByRole('button', { name: 'Flip horizontal', exact: true })
    .click();
  const pixels = await page
    .getByTestId('editor-canvas')
    .evaluate((canvas: HTMLCanvasElement) =>
      Array.from(canvas.getContext('2d')!.getImageData(0, 0, 2, 1).data),
    );
  expect(pixels).toEqual([0, 0, 0, 0, 255, 0, 0, 255]);
});

test('Photoshop-style tool, color and selection shortcuts are implemented', async ({
  page,
}) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );

  const active = (label: string) =>
    page.getByRole('button', { name: `${label} tool`, exact: true });
  await page.keyboard.press('g');
  await expect(active('Gradient')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('g');
  await expect(active('Fill')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('b');
  await expect(active('Brush')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('b');
  await expect(active('Pencil')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('b');
  await expect(active('Color Replace')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('u');
  await expect(active('Shape')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('u');
  await expect(active('Ellipse')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('m');
  await expect(active('Select')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('m');
  await expect(active('Elliptical marquee')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('m');
  await expect(active('Single Row marquee')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('m');
  await expect(active('Single Column marquee')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const zoom = page.getByLabel('Zoom', { exact: true });
  await expect(zoom).toHaveValue('72');
  await page.keyboard.press('+');
  await expect(zoom).toHaveValue('82');
  await page.keyboard.press('1');
  await expect(zoom).toHaveValue('100');
  await page.keyboard.press('0');
  await expect(zoom).toHaveValue('72');

  const setColorInput = async (label: string, value: string) =>
    page.getByLabel(label).evaluate((input, next) => {
      const element = input as HTMLInputElement;
      // oxlint-disable-next-line typescript/unbound-method
      // oxlint-disable-next-line typescript/unbound-method
      const setter = Reflect.get(
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ?? {},
        'set',
      ) as ((this: HTMLInputElement, value: string) => void) | undefined;
      if (!setter) throw new Error('Input value setter is unavailable');
      Reflect.apply(setter, element, [next]);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  await setColorInput('Drawing color', '#123456');
  await setColorInput('Background color', '#abcdef');
  await expect(page.getByLabel('Drawing color')).toHaveValue('#123456');
  await page.keyboard.press('x');
  await expect(page.getByLabel('Drawing color')).toHaveValue('#abcdef');
  await expect(page.getByLabel('Background color')).toHaveValue('#123456');
  await page.keyboard.press('d');
  await expect(page.getByLabel('Drawing color')).toHaveValue('#000000');
  await expect(page.getByLabel('Background color')).toHaveValue('#ffffff');

  await expect(
    page.getByRole('button', { name: 'Clear selection', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Control+a');
  await expect(
    page.getByRole('button', { name: 'Clear selection', exact: true }),
  ).toBeEnabled();
  await page.keyboard.press('Control+i');
  const selectionProject = page.waitForEvent('download');
  await page.keyboard.press('Control+Shift+s');
  const selectionPath = await (await selectionProject).path();
  const selectionDraft = JSON.parse(
    await (await import('node:fs/promises')).readFile(selectionPath!, 'utf8'),
  ) as {
    history: Array<{ selection?: { inverted?: boolean } }>;
    index: number;
  };
  expect(selectionDraft.history[selectionDraft.index].selection?.inverted).toBe(
    true,
  );
  await page.keyboard.press('Control+Shift+i');
  const shiftedSelectionProject = page.waitForEvent('download');
  await page.keyboard.press('Control+Shift+s');
  const shiftedSelectionPath = await (await shiftedSelectionProject).path();
  const shiftedSelectionDraft = JSON.parse(
    await (
      await import('node:fs/promises')
    ).readFile(shiftedSelectionPath!, 'utf8'),
  ) as {
    history: Array<{ selection?: { inverted?: boolean } }>;
    index: number;
  };
  expect(
    shiftedSelectionDraft.history[shiftedSelectionDraft.index].selection
      ?.inverted,
  ).toBe(false);
  await page.keyboard.press('Control+d');
  await expect(
    page.getByRole('button', { name: 'Clear selection', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Control+Shift+a');
  await expect(
    page.getByRole('button', { name: 'Clear selection', exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.getByLabel('Drawing color')).toHaveValue('#000000');
  await expect(page.getByLabel('Background color')).toHaveValue('#ffffff');
});

test('Photoshop menu families expose working commands and label planned actions', async ({
  page,
}) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  for (const menu of [
    'File',
    'Edit',
    'Image',
    'Layer',
    'Type',
    'Select',
    'Filter',
    'View',
    'Plugins',
  ]) {
    await page.getByRole('button', { name: menu, exact: true }).click();
    await expect(
      page.getByRole('menu', { name: `${menu} menu` }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(
    page.getByRole('menuitem', { name: /^Copy Layer/ }),
  ).toBeEnabled();
  await expect(page.getByRole('menuitem', { name: /^Fill/ })).toBeEnabled();
  const generativeFill = page.getByRole('menuitem', {
    name: /^Generative Fill/,
  });
  await expect(generativeFill).toBeDisabled();
  await expect(generativeFill).toHaveAttribute(
    'title',
    'Planned for a later roadmap stage',
  );
  await expect(
    page.getByRole('menuitem', { name: /^Cut Layer/ }),
  ).toBeDisabled();
  await expect(
    page.getByRole('menuitem', { name: /^Paste Layer/ }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await expect(
    page.getByRole('menuitem', { name: 'Merge Visible', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('menuitem', { name: 'Flatten Image', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('menuitem', { name: 'Layer Mask', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect(
    page.getByRole('menuitem', { name: /^Gaussian Blur/ }),
  ).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Vivid', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Vivid filter', exact: true }),
  ).toHaveClass(/selected/);
});

test('Levels adjustment is nondestructive, undoable, persisted and pixel-accurate', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const setColorInput = async (value: string) =>
    page.getByLabel('Drawing color').evaluate((input, next) => {
      const element = input as HTMLInputElement;
      // oxlint-disable-next-line typescript/unbound-method
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      );
      const setter = Reflect.get(descriptor ?? {}, 'set') as
        | ((this: HTMLInputElement, value: string) => void)
        | undefined;
      if (!setter) throw new Error('color input setter unavailable');
      // oxlint-disable-next-line typescript/unbound-method
      Reflect.apply(setter, element, [next]);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  await setColorInput('#808080');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Fill/ }).click();
  const canvas = page.getByTestId('editor-canvas');
  const sample = () =>
    canvas.evaluate((item: HTMLCanvasElement) =>
      Array.from(item.getContext('2d')!.getImageData(600, 400, 1, 1).data),
    );
  const project = async () => {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page
      .getByRole('menuitem', { name: 'Download project file', exact: true })
      .click();
    const path = await (await download).path();
    return JSON.parse(
      await (await import('node:fs/promises')).readFile(path!, 'utf8'),
    ) as {
      assets: Record<string, unknown>;
      history: Array<{
        layers: Array<{ asset: string; adjustments: Record<string, number> }>;
      }>;
      index: number;
    };
  };
  await expect.poll(sample).toEqual([128, 128, 128, 255]);
  const sourceProject = await project(),
    sourceFrame = sourceProject.history[sourceProject.index],
    sourceLayer = sourceFrame.layers[sourceFrame.layers.length - 1];
  expect(sourceLayer.adjustments).toMatchObject({
    levelsBlack: 0,
    levelsWhite: 255,
    levelsGamma: 1,
  });

  await page.getByLabel('Levels black point', { exact: true }).fill('128');
  await expect.poll(sample).toEqual([0, 0, 0, 255]);
  let adjusted = await project();
  let layer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(layer.adjustments.levelsBlack).toBe(128);
  expect(layer.adjustments.levelsWhite).toBe(255);
  expect(layer.adjustments.levelsGamma).toBe(1);
  expect(adjusted.assets[sourceLayer.asset]).toEqual(sourceProject.assets[sourceLayer.asset]);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect.poll(sample).toEqual([128, 128, 128, 255]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await expect.poll(sample).toEqual([0, 0, 0, 255]);

  await page.getByLabel('Levels black point', { exact: true }).fill('0');
  await page.getByLabel('Levels white point', { exact: true }).fill('200');
  await expect.poll(() => sample().then((pixel) => pixel[0])).toBeGreaterThanOrEqual(162);
  await expect.poll(() => sample().then((pixel) => pixel[0])).toBeLessThanOrEqual(164);
  await page.getByLabel('Levels gamma', { exact: true }).fill('2');
  await expect.poll(() => sample().then((pixel) => pixel[0])).toBeGreaterThanOrEqual(203);
  await expect.poll(() => sample().then((pixel) => pixel[0])).toBeLessThanOrEqual(205);
  adjusted = await project();
  layer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(layer.adjustments).toMatchObject({ levelsBlack: 0, levelsWhite: 200, levelsGamma: 2 });

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Levels white point', { exact: true })).toHaveValue('200');
  await expect(page.getByLabel('Levels gamma', { exact: true })).toHaveValue('2');
  await expect.poll(() => sample().then((pixel) => pixel[0])).toBeGreaterThanOrEqual(203);
  await expect.poll(() => sample().then((pixel) => pixel[0])).toBeLessThanOrEqual(205);

  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Levels…', exact: true })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Levels…', exact: true }).click();
  await expect(
    page.getByText('Levels controls are available in Adjust selected layer', {
      exact: true,
    }),
  ).toBeVisible();
});

test('Edit Fill is undoable and menu selection commands persist', async ({
  page,
}) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'New transparent document', exact: true })
    .click();
  const canvas = page.getByTestId('editor-canvas');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Fill/ }).click();
  await expect
    .poll(() =>
      canvas.evaluate((item: HTMLCanvasElement) =>
        Array.from(item.getContext('2d')!.getImageData(12, 12, 1, 1).data),
      ),
    )
    .toEqual([255, 92, 53, 255]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect
    .poll(() =>
      canvas.evaluate(
        (item: HTMLCanvasElement) =>
          item.getContext('2d')!.getImageData(12, 12, 1, 1).data[3],
      ),
    )
    .toBe(0);

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: /^All Ctrl\+A$/ }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const path = await (await downloaded).path();
  const project = JSON.parse(
    await (await import('node:fs/promises')).readFile(path!, 'utf8'),
  );
  expect(project.history[project.index].selection).toMatchObject({
    shape: 'rectangle',
    w: 1200,
    h: 800,
  });
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Deselect Ctrl\+D$/ }).click();
  await expect(
    page.getByRole('button', { name: 'Mask from selection', exact: true }),
  ).toBeDisabled();
});

test('Edit Clear, Shift-F5 fill and Merge Visible preserve pixels and hidden layers', async ({
  page,
}) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /^New white document/ }).click();
  const canvas = page.getByTestId('editor-canvas');
  await expect
    .poll(() =>
      canvas.evaluate((item: HTMLCanvasElement) =>
        Array.from(item.getContext('2d')!.getImageData(12, 12, 1, 1).data),
      ),
    )
    .toEqual([255, 255, 255, 255]);
  await page.keyboard.press('Shift+F5');
  await expect
    .poll(() =>
      canvas.evaluate((item: HTMLCanvasElement) =>
        Array.from(item.getContext('2d')!.getImageData(12, 12, 1, 1).data),
      ),
    )
    .toEqual([255, 92, 53, 255]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Clear', exact: true }).click();
  await expect
    .poll(() =>
      canvas.evaluate(
        (item: HTMLCanvasElement) =>
          item.getContext('2d')!.getImageData(12, 12, 1, 1).data[3],
      ),
    )
    .toBe(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect
    .poll(() =>
      canvas.evaluate((item: HTMLCanvasElement) =>
        Array.from(item.getContext('2d')!.getImageData(12, 12, 1, 1).data),
      ),
    )
    .toEqual([255, 92, 53, 255]);

  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Duplicate Layer/ }).click();
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Hide Layers/ }).click();
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Merge Visible', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: /Layers/ })).toContainText(
    '2 /',
  );
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const path = await (await downloaded).path();
  const project = JSON.parse(
    await (await import('node:fs/promises')).readFile(path!, 'utf8'),
  );
  expect(project.history[project.index].layers).toHaveLength(2);
  expect(
    project.history[project.index].layers.filter(
      (layer: { visible: boolean }) => !layer.visible,
    ),
  ).toHaveLength(1);
});

test('layer menu copy, paste, hide and flatten preserve an undoable project', async ({
  page,
}) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Text Tool/ }).click();
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Copy Layer/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Paste Layer/ }).click();
  let downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  let path = await (await downloaded).path();
  let project = JSON.parse(
    await (await import('node:fs/promises')).readFile(path!, 'utf8'),
  );
  expect(project.history[project.index].layers).toHaveLength(3);

  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Hide Layers/ }).click();
  await expect(page.getByLabel('Visible', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Flatten Image', exact: true })
    .click();
  await expect
    .poll(() => page.getByRole('heading', { name: /Layers/ }).textContent())
    .toContain('1 /');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  path = await (await downloaded).path();
  project = JSON.parse(
    await (await import('node:fs/promises')).readFile(path!, 'utf8'),
  );
  expect(project.history[project.index].layers.length).toBe(3);
});

test('layer clipboard shortcuts guard locked and last layers and survive undo/reload', async ({
  page,
}) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.getByRole('heading', { name: /Layers/ })).toContainText(
    '1 /',
  );
  const canvas = page.getByTestId('editor-canvas');

  const downloadProject = async () => {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page
      .getByRole('menuitem', { name: 'Download project file', exact: true })
      .click();
    const path = await (await pending).path();
    return JSON.parse(
      await (await import('node:fs/promises')).readFile(path!, 'utf8'),
    ) as {
      history: Array<{
        layers: Array<{ id: string; name: string; kind: string }>;
      }>;
      index: number;
    };
  };

  // A document's last layer is protected from destructive cut/delete actions.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(
    page.getByRole('menuitem', { name: /^Cut Layer/ }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await canvas.click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Control+x');
  await expect(page.getByRole('heading', { name: /Layers/ })).toContainText(
    '1 /',
  );

  // Adding a second layer gives us a safe target for lock and cut checks.
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'New Paint Layer', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: /Layers/ })).toContainText(
    '2 /',
  );
  const lock = page.getByLabel('Lock layer', { exact: true });
  await lock.check();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(
    page.getByRole('menuitem', { name: /^Cut Layer/ }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await canvas.click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Control+x');
  await expect(page.getByRole('heading', { name: /Layers/ })).toContainText(
    '2 /',
  );
  await lock.uncheck();
  await canvas.click({ position: { x: 10, y: 10 } });

  // Keyboard copy/paste creates a new editable layer, and undo removes only the paste.
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(page.getByRole('heading', { name: /Layers/ })).toContainText(
    '3 /',
  );
  let project = await downloadProject();
  let frame = project.history[project.index];
  expect(frame.layers).toHaveLength(3);
  expect(new Set(frame.layers.map((layer) => layer.id)).size).toBe(3);
  expect(frame.layers.at(-1)?.name).toMatch(/copy$/);
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('heading', { name: /Layers/ })).toContainText(
    '2 /',
  );

  // Cut copies the active layer before removing it; undo and redo restore the exact count.
  await page.keyboard.press('Control+x');
  await expect(page.getByRole('heading', { name: /Layers/ })).toContainText(
    '1 /',
  );
  await page.keyboard.press('Control+v');
  await expect(page.getByRole('heading', { name: /Layers/ })).toContainText(
    '2 /',
  );
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('heading', { name: /Layers/ })).toContainText(
    '1 /',
  );
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('heading', { name: /Layers/ })).toContainText(
    '2 /',
  );
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByRole('heading', { name: /Layers/ })).toContainText(
    '1 /',
  );
  project = await downloadProject();
  frame = project.history[project.index];
  expect(frame.layers).toHaveLength(1);

  // Shortcut handling is disabled in text fields, so a document name remains intact.
  const name = page.getByLabel('Document name', { exact: true });
  await name.fill('Clipboard guard');
  await name.press('Control+x');
  await expect(name).toHaveValue('Clipboard guard');
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.getByRole('heading', { name: /Layers/ })).toContainText(
    '1 /',
  );
  await expect(page.getByLabel('Document name', { exact: true })).toHaveValue(
    'Clipboard guard',
  );
});

test('Photoshop-style document shortcuts drive existing actions and ignore text fields', async ({
  page,
}) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await page.keyboard.press('Control+g');
  await expect(
    page.getByRole('button', { name: /Collapse group Group 1/ }),
  ).toBeVisible();
  await page.keyboard.press('Control+j');
  await expect(page.getByText('Layers 2 / 32', { exact: true })).toBeVisible();
  await page.keyboard.press('Control+Shift+g');
  await expect(
    page.getByRole('button', { name: /Collapse group Group 1/ }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Rotate right', exact: true })
    .click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'width',
    '960',
  );
  await page.keyboard.press('Control+Alt+z');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'width',
    '1440',
  );
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'width',
    '960',
  );

  await page.getByRole('button', { name: 'File', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'File menu' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'File menu' })).toBeHidden();

  await page.keyboard.press('Control+Alt+i');
  await expect(
    page.getByRole('heading', { name: 'Resize image', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const projectDownload = page.waitForEvent('download');
  await page.keyboard.press('Control+Shift+s');
  const download = await projectDownload;
  expect(download.suggestedFilename()).toMatch(/\.pixelforge$/);

  await page.keyboard.press('b');
  await expect(
    page.getByRole('button', { name: 'Brush tool', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Document name').fill('Typing guard');
  await page.getByLabel('Document name').press('g');
  await expect(
    page.getByRole('button', { name: 'Brush tool', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('menus provide roving keyboard focus and restore the trigger on Escape', async ({
  page,
}) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );

  const file = page.getByRole('button', { name: 'File', exact: true });
  await file.focus();
  await page.keyboard.press('ArrowDown');
  const fileMenu = page.getByRole('menu', { name: 'File menu' });
  const fileItems = fileMenu.getByRole('menuitem');
  await expect(fileItems.nth(0)).toBeFocused();
  await expect(fileItems.nth(0)).toHaveAttribute('tabindex', '-1');

  // Arrow navigation wraps and Home/End skip disabled roadmap entries.
  await page.keyboard.press('ArrowDown');
  await expect(fileItems.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(fileItems.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(fileItems.nth(0)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(fileMenu).toBeHidden();
  await expect(file).toBeFocused();

  // ArrowUp from a trigger opens the last item, and disabled commands never
  // receive focus while moving through the menu.
  await page.keyboard.press('ArrowUp');
  await expect(fileItems.last()).toBeFocused();
  await page.keyboard.press('Escape');

  const edit = page.getByRole('button', { name: 'Edit', exact: true });
  await edit.press('Enter');
  const editMenu = page.getByRole('menu', { name: 'Edit menu' });
  // Undo/redo and the planned commands are disabled in a fresh document;
  // focus starts at the first enabled command, Copy Layer.
  await expect(
    editMenu.getByRole('menuitem', { name: /^Copy Layer/ }),
  ).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(
    editMenu.getByRole('menuitem', { name: 'Clear', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(
    editMenu.getByRole('menuitem', { name: /^Fill/ }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(edit).toBeFocused();
});

test('batch history export packages flattened snapshots with a privacy manifest', async ({
  page,
}) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');

  // Create a second editable history state without uploading a source file.
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rotate right', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');

  await page.getByRole('button', { name: 'File', exact: true }).click();
  const batch = page.getByRole('menuitem', { name: 'Batch export history…', exact: true });
  await expect(batch).toBeEnabled();
  await batch.click();
  await expect(page.getByRole('heading', { name: 'Batch export history', exact: true })).toBeVisible();
  await page.getByLabel('Batch export format', { exact: true }).selectOption('webp');
  await page.getByLabel('Batch export quality', { exact: true }).fill('80');
  await page.getByRole('button', { name: 'Build batch ZIP', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Batch export progress', exact: true })).toContainText('2 snapshots');

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download batch ZIP', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('coastline-edit-history.zip');
  const path = await download.path();
  const bytes = await (await import('node:fs/promises')).readFile(path!);
  expect(bytes.subarray(0, 4).toString('hex')).toBe('504b0304');

  const entries: { name: string; data: Buffer }[] = [];
  let offset = 0;
  while (offset + 4 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const size = bytes.readUInt32LE(offset + 18);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString();
    const start = offset + 30 + nameLength + extraLength;
    entries.push({ name, data: bytes.subarray(start, start + size) });
    offset = start + size;
  }
  expect(entries.map((entry) => entry.name)).toEqual([
    'coastline-edit-history-001.webp',
    'coastline-edit-history-002.webp',
    'coastline-edit-manifest.json',
  ]);
  const manifest = JSON.parse(entries[2].data.toString()) as {
    application: string;
    snapshotCount: number;
    format: string;
    metadata: string;
    entries: Array<{ historyIndex: number; bytes: number; width: number; height: number; file: string }>;
  };
  expect(manifest).toMatchObject({
    application: 'pixelforge-photo-editor',
    snapshotCount: 2,
    format: 'webp',
    metadata: 'rendered pixels only; source EXIF, GPS and color profiles omitted',
  });
  expect(manifest.entries.map((entry) => entry.historyIndex)).toEqual([0, 1]);
  expect(manifest.entries.every((entry) => entry.bytes > 0)).toBe(true);
  expect(manifest.entries.map((entry) => [entry.width, entry.height])).toEqual([
    [1440, 960],
    [960, 1440],
  ]);
  expect(manifest.entries.map((entry) => entry.file)).toEqual([
    'coastline-edit-history-001.webp',
    'coastline-edit-history-002.webp',
  ]);
  for (const entry of entries.slice(0, 2)) {
    const dimensions = await page.evaluate(async (payload) => {
      const blob = new Blob([new Uint8Array(payload)], { type: 'image/webp' });
      const url = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const pixel = context.getImageData(0, 0, 1, 1).data;
        return { width: image.naturalWidth, height: image.naturalHeight, energy: pixel[0] + pixel[1] + pixel[2] + pixel[3] };
      } finally {
        URL.revokeObjectURL(url);
      }
    }, [...entry.data]);
    expect(dimensions.width * dimensions.height).toBeGreaterThan(0);
    expect(dimensions.energy).toBeGreaterThan(0);
  }
  expect(bytes.includes(Buffer.from('data:image'))).toBe(false);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  const afterExport = await project(page);
  expect(afterExport.history).toHaveLength(2);
  expect(afterExport.index).toBe(1);
});

test('Escape cancels a running batch without mutating history', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  for (let count = 0; count < 8; count += 1) {
    await page.getByRole('button', { name: 'Image', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Rotate right', exact: true }).click();
    await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  }
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Batch export history…', exact: true }).click();
  await page.getByRole('button', { name: 'Build batch ZIP', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Batch export history', exact: true })).toBeHidden();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  const afterCancel = await project(page);
  expect(afterCancel.history).toHaveLength(9);
  expect(afterCancel.index).toBe(8);
});

test('Color Balance is nondestructive, pixel-visible, persisted and menu-addressable', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const setColorInput = async (value: string) =>
    page.getByLabel('Drawing color').evaluate((input, next) => {
      const element = input as HTMLInputElement;
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      const setter = Reflect.get(descriptor ?? {}, 'set') as ((this: HTMLInputElement, value: string) => void) | undefined;
      if (!setter) throw new Error('color input setter unavailable');
      Reflect.apply(setter, element, [next]);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  await setColorInput('#707070');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Fill/ }).click();
  const canvas = page.getByTestId('editor-canvas');
  const sample = () =>
    canvas.evaluate((item: HTMLCanvasElement) =>
      Array.from(item.getContext('2d')!.getImageData(600, 400, 1, 1).data),
    );
  await expect.poll(sample).toEqual([112, 112, 112, 255]);
  const source = await sample();
  await page.getByLabel('Midtones cyan/red', { exact: true }).fill('80');
  await expect.poll(sample).not.toEqual(source);
  const adjusted = await sample();
  expect(adjusted[0]).toBeGreaterThan(adjusted[1]);
  expect(adjusted[3]).toBe(255);
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Color Balance…', exact: true }).click();
  await expect(page.getByLabel('Midtones cyan/red', { exact: true })).toHaveValue('80');
  const projectDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const projectPath = await (await projectDownload).path();
  const project = JSON.parse(await (await import('node:fs/promises')).readFile(projectPath!, 'utf8')) as {
    history: Array<{ layers: Array<{ adjustments: { colorBalance: { midtonesCyanRed: number } } }> }>;
    index: number;
  };
  expect(project.history[project.index].layers.at(-1)!.adjustments.colorBalance.midtonesCyanRed).toBe(80);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Midtones cyan/red', { exact: true })).toHaveValue('80');
  await expect.poll(sample).toEqual(adjusted);
});

test('Sharpen and Noise controls preserve alpha, remain deterministic and round-trip', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('Drawing color').evaluate((input) => {
    const element = input as HTMLInputElement;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    const setter = Reflect.get(descriptor ?? {}, 'set') as ((this: HTMLInputElement, value: string) => void) | undefined;
    if (!setter) throw new Error('color input setter unavailable');
    Reflect.apply(setter, element, ['#707070']);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Fill/ }).click();
  const canvas = page.getByTestId('editor-canvas');
  const sample = () =>
    canvas.evaluate((item: HTMLCanvasElement) =>
      Array.from(item.getContext('2d')!.getImageData(600, 400, 1, 1).data),
    );
  const before = await sample();
  await page.getByLabel('Noise amount', { exact: true }).fill('35');
  await page.getByLabel('Noise seed', { exact: true }).fill('42');
  await page.getByLabel('Monochromatic noise', { exact: true }).check();
  await expect.poll(sample).not.toEqual(before);
  const adjusted = await sample();
  expect(adjusted[3]).toBe(before[3]);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Add Noise…', exact: true }).click();
  await expect(page.getByLabel('Noise amount', { exact: true })).toHaveValue('35');
  const projectDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const projectPath = await (await projectDownload).path();
  const project = JSON.parse(await (await import('node:fs/promises')).readFile(projectPath!, 'utf8')) as {
    history: Array<{ layers: Array<{ adjustments: { sharpenNoise: { noise: number; seed: number; monochromatic: boolean } } }> }>;
    index: number;
  };
  expect(project.history[project.index].layers.at(-1)!.adjustments.sharpenNoise).toMatchObject({
    noise: 35,
    seed: 42,
    monochromatic: true,
  });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Noise amount', { exact: true })).toHaveValue('35');
  await expect(page.getByLabel('Noise seed', { exact: true })).toHaveValue('42');
  await expect(page.getByLabel('Monochromatic noise', { exact: true })).toBeChecked();
  await expect.poll(sample).toEqual(adjusted);
});
