import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

type Project = {
  assets: Record<string, unknown>;
  history: Array<{
    layers: Array<{
      asset?: string;
      adjustments: {
        auto?: { tone?: boolean; contrast?: boolean; color?: boolean };
      };
    }>;
  }>;
  index: number;
};

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

async function project(page: Page): Promise<Project> {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const path = await (await pending).path();
  return await downloadedProject(path!) as Project;
}

async function importPixels(page: Page, pixels: number[][]) {
  const encoded = await page.evaluate((values) => {
    const canvas = document.createElement('canvas');
    canvas.width = values.length;
    canvas.height = 1;
    const context = canvas.getContext('2d')!;
    const data = context.createImageData(values.length, 1);
    values.flat().forEach((value, index) => {
      data.data[index] = value;
    });
    context.putImageData(data, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  }, pixels);
  await page.getByTestId('file-input').setInputFiles({
    name: 'auto-correction-fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'data-rendering',
    'false',
  );
}

async function pixel(page: Page, x: number) {
  return page
    .getByTestId('editor-canvas')
    .evaluate(
      (canvas: HTMLCanvasElement, xCoordinate) =>
        Array.from(
          canvas.getContext('2d')!.getImageData(xCoordinate, 0, 1, 1).data,
        ),
      x,
    );
}

const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );

const varied = [
  [25, 40, 80, 255],
  [125, 90, 160, 128],
  [225, 140, 240, 255],
  [10, 20, 30, 0],
];

for (const mode of ['tone', 'contrast', 'color'] as const) {
  const title = `Auto ${mode[0].toUpperCase()}${mode.slice(1)}`;
  test(`${title} menu command is pixel-visible, undoable, persisted and source-safe`, async ({
    page,
  }) => {
    await importPixels(page, varied);
    const before = await project(page),
      beforeFrame = before.history[before.index],
      sourceLayer = beforeFrame.layers.at(-1)!,
      sourceAsset = sourceLayer.asset,
      beforePixel = await pixel(page, 1),
      command = page.getByRole('menuitem', {
        name: mode === 'tone' ? /^Auto Tone/ : title,
        exact: mode !== 'tone',
      });

    await page.getByRole('button', { name: 'Image', exact: true }).click();
    await expect(command).toBeEnabled();
    await command.click();
    await expect(
      page.getByText(`${title} applied; the correction remains editable`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect.poll(() => pixel(page, 1)).not.toEqual(beforePixel);
    expect((await pixel(page, 3))[3]).toBe(0);

    const adjusted = await project(page),
      adjustedFrame = adjusted.history[adjusted.index],
      adjustedLayer = adjustedFrame.layers.at(-1)!;
    expect(adjustedLayer.adjustments.auto).toEqual({
      tone: mode === 'tone',
      contrast: mode === 'contrast',
      color: mode === 'color',
    });
    expect(adjustedLayer.asset).toBe(sourceAsset);
    expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Undo/ }).click();
    await expect.poll(() => pixel(page, 1)).toEqual(beforePixel);
    const undone = await project(page);
    expect(
      undone.history[undone.index].layers.at(-1)!.adjustments.auto,
    ).toEqual({
      tone: false,
      contrast: false,
      color: false,
    });

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Redo/ }).click();
    await expect.poll(() => pixel(page, 1)).not.toEqual(beforePixel);
    await saved(page);
    await page.reload();
    await expect(page.getByRole('application')).toHaveAttribute(
      'aria-busy',
      'false',
    );
    await expect.poll(() => pixel(page, 1)).not.toEqual(beforePixel);
    const reloaded = await project(page);
    expect(
      reloaded.history[reloaded.index].layers.at(-1)!.adjustments.auto,
    ).toEqual({
      tone: mode === 'tone',
      contrast: mode === 'contrast',
      color: mode === 'color',
    });
    expect(reloaded.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
    expect(reloaded.history[reloaded.index].layers.at(-1)!.asset).toBe(
      sourceAsset,
    );
  });
}

test('Auto Tone follows its Photoshop shortcut and disables safely for locked layers', async ({
  page,
}) => {
  await importPixels(page, varied);
  const before = await project(page);
  await page.getByLabel('Lock layer', { exact: true }).check();
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await expect(
    page.getByRole('menuitem', { name: /^Auto Tone/ }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+L');
  await expect(
    page.getByText(
      'Unlock and show this layer before applying an automatic correction',
      { exact: true },
    ),
  ).toBeVisible();
  const after = await project(page);
  expect(after.history.length).toBe(before.history.length + 1);

  await page.getByLabel('Lock layer', { exact: true }).uncheck();
  await page.getByLabel('Visible', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await expect(
    page.getByRole('menuitem', { name: 'Auto Contrast', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'New transparent document', exact: true })
    .click();
  await selectTool(page, 'Text');
  await page
    .getByTestId('editor-canvas')
    .click({ position: { x: 120, y: 120 } });
  await page.getByLabel('Edit layer text', { exact: true }).fill('Pixel');
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await expect(
    page.getByRole('menuitem', { name: 'Auto Color', exact: true }),
  ).toBeDisabled();
});

test('Auto Tone is an explicit no-op on a flat visible image', async ({
  page,
}) => {
  await importPixels(page, [
    [90, 110, 130, 255],
    [90, 110, 130, 255],
    [90, 110, 130, 255],
    [0, 0, 0, 0],
  ]);
  const before = await project(page);
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Auto Tone/ }).click();
  await expect(
    page.getByText('Auto tone found no usable tonal range', { exact: true }),
  ).toBeVisible();
  const after = await project(page);
  expect(after.history.length).toBe(before.history.length);
  expect(await pixel(page, 0)).toEqual([90, 110, 130, 255]);
});
