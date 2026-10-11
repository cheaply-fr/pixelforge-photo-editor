import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

async function setColor(page: import('@playwright/test').Page, value: string) {
  await page.getByLabel('Drawing color').evaluate((input, next) => {
    const element = input as HTMLInputElement;
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    );
    const setter = Reflect.get(descriptor ?? {}, 'set') as
      | ((this: HTMLInputElement, value: string) => void)
      | undefined;
    if (!setter) throw new Error('color input setter unavailable');
    Reflect.apply(setter, element, [next]);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function openFilledDocument(page: import('@playwright/test').Page) {
  await setColor(page, '#808080');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Fill/ }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
}

async function sample(page: import('@playwright/test').Page) {
  return page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) =>
    Array.from(canvas.getContext('2d')!.getImageData(600, 400, 1, 1).data),
  );
}

async function downloadProject(page: import('@playwright/test').Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const path = await (await pending).path();
  return await downloadedProject(path!) as {
    history: Array<{ layers: Array<{ asset?: string; adjustments?: Record<string, number> }> }>;
    index: number;
    assets: Record<string, unknown>;
  };
}

async function undo(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
}

test('Levels output range is source-safe, undoable and survives reload/project round trip', async ({ page }) => {
  await openFilledDocument(page);
  const source = await downloadProject(page);
  const sourceLayer = source.history[source.index].layers.at(-1)!;
  await page.getByLabel('Levels output black', { exact: true }).fill('32');
  await page.getByLabel('Levels output white', { exact: true }).fill('200');
  await expect.poll(() => sample(page)).toEqual([116, 116, 116, 255]);
  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.adjustments).toMatchObject({
    levelsOutputBlack: 32,
    levelsOutputWhite: 200,
  });
  expect(adjustedLayer.asset).toBe(sourceLayer.asset);
  expect(adjusted.assets[sourceLayer.asset!]).toEqual(source.assets[sourceLayer.asset!]);

  await undo(page);
  await undo(page);
  await expect.poll(() => sample(page)).toEqual([128, 128, 128, 255]);
  await page.getByLabel('Levels output black', { exact: true }).fill('32');
  await page.getByLabel('Levels output white', { exact: true }).fill('200');
  await expect.poll(() => sample(page)).toEqual([116, 116, 116, 255]);
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Levels output black', { exact: true })).toHaveValue('32');
  await expect(page.getByLabel('Levels output white', { exact: true })).toHaveValue('200');
  await expect.poll(() => sample(page)).toEqual([116, 116, 116, 255]);
  const reloaded = await downloadProject(page);
  expect(reloaded.history[reloaded.index].layers.at(-1)?.adjustments).toMatchObject({
    levelsOutputBlack: 32,
    levelsOutputWhite: 200,
  });
});
