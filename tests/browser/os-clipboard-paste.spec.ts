import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

// 3×2 opaque PNG: red, green, blue / white, black, grey.
const PNG_3X2 =
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFUlEQVR4nGP4z8DAAMH//4PohoYGAEfPB3vT+rJCAAAAAElFTkSuQmCC';

type Project = {
  history: Array<{ layers: Array<{ kind: string; name?: string; asset?: string }> }>;
  index: number;
  assets: Record<string, { w: number; h: number }>;
};

const layersHeading = (page: Page, count: number) =>
  page.getByRole('heading', { name: new RegExp(`Layers ${count} /`) });

const prepare = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
};

/** Put a real image on the browser clipboard through the async Clipboard API. */
const writeClipboardImage = (page: Page, base64 = PNG_3X2) =>
  page.evaluate(async (encoded) => {
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) }),
    ]);
  }, base64);

const downloadProject = async (page: Page): Promise<Project> => {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const path = await (await pending).path();
  if (!path) throw new Error('Project download path unavailable');
  return (await downloadedProject(path)) as Project;
};

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await prepare(page);
});

test('Ctrl+V pastes an OS clipboard image as a layer even when focus is on the page body', async ({ page }) => {
  await writeClipboardImage(page);
  // Focus on <body> is the state after load or after a menu/dialog closes;
  // the paste event then targets the body, not the editor root.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');
  await page.keyboard.press('ControlOrMeta+V');
  await expect(layersHeading(page, 2)).toBeVisible();
  await expect(page.getByText('Image layer added', { exact: true })).toBeVisible();

  const project = await downloadProject(page);
  const pasted = project.history[project.index].layers.at(-1)!;
  expect(pasted.kind).toBe('raster');
  expect(pasted.name).toBe('Pasted image.png');
  expect(project.assets[pasted.asset!]).toMatchObject({ w: 3, h: 2 });
});

test('Ctrl+V after clicking the canvas pastes the clipboard image once', async ({ page }) => {
  await writeClipboardImage(page);
  await page.getByTestId('editor-canvas').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('ControlOrMeta+V');
  await expect(layersHeading(page, 2)).toBeVisible();
  // The keyboard fallback must not add a duplicate after the native paste.
  await page.waitForTimeout(600);
  await expect(layersHeading(page, 2)).toBeVisible();
});

test('the internal layer clipboard keeps priority over an OS clipboard image', async ({ page }) => {
  await writeClipboardImage(page);
  await page.getByTestId('editor-canvas').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('ControlOrMeta+C');
  await expect(page.getByText(/copied/i).first()).toBeVisible();
  await page.keyboard.press('ControlOrMeta+V');
  await expect(page.getByText('Layer pasted in place', { exact: true })).toBeVisible();
  await page.waitForTimeout(600);
  await expect(layersHeading(page, 2)).toBeVisible();
  const project = await downloadProject(page);
  const layers = project.history[project.index].layers;
  expect(layers.at(-1)?.name).not.toBe('Pasted image.png');
});

test('Edit → Paste Image from Clipboard reads the OS clipboard', async ({ page }) => {
  await writeClipboardImage(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Paste Image from Clipboard', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(layersHeading(page, 2)).toBeVisible();
  await expect(page.getByText('Image layer added', { exact: true })).toBeVisible();
});

test('Edit → Paste Image from Clipboard explains a clipboard without an image', async ({ page }) => {
  await page.evaluate(() => navigator.clipboard.writeText('just text'));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Paste Image from Clipboard', exact: true }).click();
  await expect(page.getByText('The clipboard does not contain an image.', { exact: true })).toBeVisible();
  await expect(layersHeading(page, 1)).toBeVisible();
});

test('a blocked clipboard read shows a permission-friendly message', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'read', {
      configurable: true,
      value: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')),
    });
  });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Paste Image from Clipboard', exact: true }).click();
  await expect(page.getByText(/Clipboard access was blocked/)).toBeVisible();
  await expect(layersHeading(page, 1)).toBeVisible();
});

test('Ctrl+V falls back to the async clipboard when the host delivers no paste event', async ({ page }) => {
  await writeClipboardImage(page);
  // Simulate an embedded browser that swallows the native paste event.
  await page.evaluate(() =>
    window.addEventListener('paste', (event) => event.stopImmediatePropagation(), true),
  );
  await page.getByTestId('editor-canvas').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('ControlOrMeta+V');
  await expect(layersHeading(page, 2)).toBeVisible();
  await expect(page.getByText('Image layer added', { exact: true })).toBeVisible();
});

test('text paste into a text field is left to the browser', async ({ page }) => {
  await writeClipboardImage(page);
  const name = page.getByRole('textbox').first();
  await name.click();
  await page.keyboard.press('ControlOrMeta+V');
  await page.waitForTimeout(600);
  await expect(layersHeading(page, 1)).toBeVisible();
});
