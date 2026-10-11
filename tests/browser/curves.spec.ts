import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

const beforeEachEditor = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Saved on this device');
};

async function project(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const download = await pending;
  const path = await download.path();
  return await downloadedProject(path!) as {
    history: Array<{
      layers: Array<{
        asset?: string;
        adjustments?: { curves?: { rgb: Array<[number, number]> } };
      }>;
    }>;
    index: number;
  };
}

async function setColor(page: Page, value: string) {
  await page
    .getByLabel('Drawing color', { exact: true })
    .evaluate((input, next) => {
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      );
      const setter = Reflect.get(descriptor ?? {}, 'set') as
        | ((this: HTMLInputElement, value: string) => void)
        | undefined;
      if (!setter) throw new Error('color input setter unavailable');
      Reflect.apply(setter, input, [next as string]);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
}

test.beforeEach(async ({ page }) => beforeEachEditor(page));

test('Curves menu and four channel editors are keyboard accessible and persisted', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  const item = page.getByRole('menuitem', { name: 'Curves…', exact: true });
  await expect(item).toBeEnabled();
  await item.click();
  await expect(
    page.getByText('Curves controls are available in Adjust selected layer', {
      exact: true,
    }),
  ).toBeVisible();
  for (const channel of ['RGB', 'Red', 'Green', 'Blue']) {
    await expect(
      page.getByRole('group', { name: `${channel} curve editor` }),
    ).toBeVisible();
    await expect(
      page.getByLabel(`${channel} midpoint`, { exact: true }),
    ).toBeVisible();
  }
});

test('RGB Curves changes representative pixels, keeps source editable, and survives undo/reload', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'New transparent document', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Add paint layer', exact: true })
    .click();
  await setColor(page, '#808080');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Fill/ }).click();
  const canvas = page.getByTestId('editor-canvas');
  const pixel = () =>
    canvas.evaluate((node: HTMLCanvasElement) =>
      Array.from(node.getContext('2d')!.getImageData(600, 400, 1, 1).data),
    );
  await expect.poll(pixel).toEqual([128, 128, 128, 255]);
  const source = await project(page);
  const sourceLayer = source.history[source.index].layers.at(-1)!;
  const beforeAsset = sourceLayer.asset;

  const midpoint = page.getByLabel('RGB midpoint', { exact: true });
  await midpoint.fill('220');
  await expect.poll(pixel).toEqual([220, 220, 220, 255]);
  const adjusted = await project(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.adjustments?.curves?.rgb).toContainEqual([128, 220]);
  expect(adjustedLayer.asset).toBe(beforeAsset);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect.poll(pixel).toEqual([128, 128, 128, 255]);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.getByLabel('RGB midpoint', { exact: true })).toHaveValue(
    '128',
  );
  await expect.poll(pixel).toEqual([128, 128, 128, 255]);
});

test('Curve graph supports pointer editing and a deterministic channel reset', async ({
  page,
}) => {
  const graph = page.getByRole('button', {
    name: 'RGB curve; drag to add or move points',
  });
  const midpoint = page.getByLabel('RGB midpoint', { exact: true });
  await midpoint.fill('210');
  await expect(midpoint).toHaveValue('210');
  const box = (await graph.boundingBox())!;
  const x = box.x + box.width * 0.5;
  await page.mouse.move(x, box.y + box.height * 0.18);
  await page.mouse.down();
  await page.mouse.move(x + box.width * 0.08, box.y + box.height * 0.28, {
    steps: 4,
  });
  await page.mouse.up();
  await expect
    .poll(async () => Number(await midpoint.inputValue()))
    .toBeGreaterThan(120);
  await page
    .getByRole('button', { name: 'Reset RGB curve', exact: true })
    .click();
  await expect(midpoint).toHaveValue('128');
});
