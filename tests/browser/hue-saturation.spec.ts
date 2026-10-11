import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

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

async function setColor(page: Page, value: string) {
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

async function makeRedFill(page: Page) {
  await setColor(page, '#ff0000');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'New transparent document', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Fill/ }).click();
  const canvas = page.getByTestId('editor-canvas');
  await expect.poll(async () =>
    canvas.evaluate((item: HTMLCanvasElement) =>
      Array.from(item.getContext('2d')!.getImageData(600, 400, 1, 1).data),
    ),
  ).toEqual([255, 0, 0, 255]);
  return canvas;
}

async function downloadProject(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const path = await (await pending).path();
  return await downloadedProject(path!) as {
    assets: Record<string, unknown>;
    history: Array<{
      layers: Array<{ asset?: string; adjustments: Record<string, number> }>;
    }>;
    index: number;
  };
}

test('Hue/Saturation rotates pixels nondestructively with undo and project persistence', async ({
  page,
}) => {
  const canvas = await makeRedFill(page);
  const sample = () =>
    canvas.evaluate((item: HTMLCanvasElement) =>
      Array.from(item.getContext('2d')!.getImageData(600, 400, 1, 1).data),
    );
  const sourceProject = await downloadProject(page);
  const sourceFrame = sourceProject.history[sourceProject.index];
  const sourceLayer = sourceFrame.layers.at(-1)!;
  const sourceAsset = sourceLayer.asset!;
  expect(sourceLayer.adjustments.hue).toBe(0);

  await page.getByLabel('Hue', { exact: true }).fill('120');
  await expect
    .poll(async () => {
      const [red, green, blue, alpha] = await sample();
      return alpha === 255 && red <= 4 && green >= 248 && blue <= 4;
    })
    .toBe(true);
  let adjusted = await downloadProject(page);
  let layer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(layer.adjustments.hue).toBe(120);
  expect(adjusted.assets[sourceAsset]).toEqual(sourceProject.assets[sourceAsset]);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect.poll(sample).toEqual([255, 0, 0, 255]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await expect
    .poll(async () => {
      const [red, green, blue, alpha] = await sample();
      return alpha === 255 && red <= 4 && green >= 248 && blue <= 4;
    })
    .toBe(true);

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.getByLabel('Hue', { exact: true })).toHaveValue('120');
  await expect.poll(async () => {
    const pixel = await page.getByTestId('editor-canvas').evaluate(
      (item: HTMLCanvasElement) =>
        Array.from(item.getContext('2d')!.getImageData(600, 400, 1, 1).data),
    );
    return pixel[1];
  }).toBeGreaterThanOrEqual(248);
  adjusted = await downloadProject(page);
  layer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(layer.adjustments.hue).toBe(120);
  expect(adjusted.assets[sourceAsset]).toEqual(sourceProject.assets[sourceAsset]);
});

test('Hue bounds, reset and Image menu command remain keyboard and mobile safe', async ({
  page,
}) => {
  await makeRedFill(page);
  const hue = page.getByLabel('Hue', { exact: true });
  await hue.fill('-180');
  await expect
    .poll(async () => {
      const [red, green, blue, alpha] = await page
        .getByTestId('editor-canvas')
        .evaluate((item: HTMLCanvasElement) =>
          Array.from(item.getContext('2d')!.getImageData(600, 400, 1, 1).data),
        );
      return alpha === 255 && red <= 4 && green >= 248 && blue >= 248;
    })
    .toBe(true);
  await expect(hue).toHaveValue('-180');

  await page.getByRole('button', { name: 'Image', exact: true }).click();
  const command = page.getByRole('menuitem', {
    name: 'Hue/Saturation…',
    exact: true,
  });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText(
    'Hue/Saturation controls are available in Adjust selected layer',
    { exact: true },
  )).toBeVisible();

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Reset adjustments', exact: true }).click();
  await expect(hue).toHaveValue('0');
  await expect.poll(async () =>
    page.getByTestId('editor-canvas').evaluate((item: HTMLCanvasElement) =>
      Array.from(item.getContext('2d')!.getImageData(600, 400, 1, 1).data),
    ),
  ).toEqual([255, 0, 0, 255]);
});
