import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect } from '@playwright/test';

async function saved(page: import('@playwright/test').Page) {
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );
}

async function project(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending,
    path = await download.path();
  return await downloadedProject(path!) as {
    history: Array<{
      layers: Array<Record<string, unknown>>;
      active: string;
    }>;
    index: number;
  };
}

async function greenBounds(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'data-rendering',
    'false',
  );
  return page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width,
      right = -1,
      top = canvas.height,
      bottom = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const i = (y * canvas.width + x) * 4;
        if (data[i + 1] > 150 && data[i] < 120 && data[i + 2] < 120 && data[i + 3] > 0) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    }
    return { left, right, top, bottom };
  });
}

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await saved(page);
});

test('typography alignment, tracking and line height render pixels and round-trip on desktop and mobile', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await selectTool(page, 'Text');
  await page.getByTestId('editor-canvas').click({ position: { x: 120, y: 120 } });
  await page.getByLabel('Edit layer text', { exact: true }).fill('AA\nAA');
  await page.getByLabel('Layer text color', { exact: true }).fill('#00ff00');
  await page.getByLabel('Text alignment', { exact: true }).selectOption('left');
  await page.getByLabel('Text box width', { exact: true }).fill('520');
  await page.getByLabel('Text box width', { exact: true }).press('Enter');
  await page.getByLabel('Line height', { exact: true }).fill('2');
  await page.getByLabel('Line height', { exact: true }).press('Enter');
  await page.getByLabel('Letter spacing', { exact: true }).fill('12');
  await page.getByLabel('Letter spacing', { exact: true }).press('Enter');
  await saved(page);
  const left = await greenBounds(page);
  expect(left.left).toBeLessThan(left.right);
  expect(left.bottom - left.top).toBeGreaterThan(70);
  const beforeRight = left.left;
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Align Right', exact: true })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Align Right', exact: true }).click();
  await saved(page);
  const right = await greenBounds(page);
  expect(right.left).toBeGreaterThan(beforeRight + 80);

  const exported = await project(page),
    frame = exported.history[exported.index],
    text = frame.layers.find((layer) => layer.kind === 'text');
  expect(text).toMatchObject({
    text: 'AA\nAA',
    textAlign: 'right',
    boxWidth: 520,
    lineHeight: 2,
    letterSpacing: 12,
  });
  await page.reload();
  await expect(page.getByLabel('Text alignment', { exact: true })).toHaveValue('right');
  await expect(page.getByLabel('Text box width', { exact: true })).toHaveValue('520');
  await expect(page.getByLabel('Line height', { exact: true })).toHaveValue('2');
  await expect(page.getByLabel('Letter spacing', { exact: true })).toHaveValue('12');
  const reloaded = await greenBounds(page);
  expect(reloaded.left).toBeGreaterThan(beforeRight + 80);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByLabel('Text alignment', { exact: true })).toHaveValue('left');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await expect(page.getByLabel('Text alignment', { exact: true })).toHaveValue('right');
});

test('legacy text layers migrate presentation defaults without flattening', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await selectTool(page, 'Text');
  await page.getByTestId('editor-canvas').click({ position: { x: 140, y: 140 } });
  await page.getByLabel('Edit layer text', { exact: true }).fill('Legacy');
  await saved(page);
  const current = await project(page);
  const legacy = structuredClone(current) as typeof current;
  const text = legacy.history[legacy.index].layers.find((layer) => layer.kind === 'text')!;
  delete text.textAlign;
  delete text.boxWidth;
  delete text.lineHeight;
  delete text.letterSpacing;
  await page.getByTestId('project-input').setInputFiles({
    name: 'legacy.pixelforge',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      version: 2,
      ...legacy,
      settings: {
        tool: 'move',
        zoom: 72,
        color: '#ff5c35',
        size: 18,
        text: 'Legacy',
        fontSize: 56,
        brightness: 100,
        contrast: 100,
        saturation: 100,
        blur: 0,
        filter: 'none',
      },
    })),
  });
  await expect(page.getByLabel('Text alignment', { exact: true })).toHaveValue('left');
  await expect(page.getByLabel('Line height', { exact: true })).toHaveValue('1.2');
  await expect(page.getByLabel('Letter spacing', { exact: true })).toHaveValue('0');
  const migrated = await project(page);
  const migratedText = migrated.history[migrated.index].layers.find((layer) => layer.kind === 'text');
  expect(migratedText).toMatchObject({ textAlign: 'left', lineHeight: 1.2, letterSpacing: 0 });
  expect(Number(migratedText?.boxWidth)).toBeGreaterThan(0);
});

test('Warp Text stays editable, changes the raster, and persists across reload', async ({ page }) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await selectTool(page, 'Text');
  await page.getByTestId('editor-canvas').click({ position: { x: 120, y: 160 } });
  await page.getByLabel('Edit layer text', { exact: true }).fill('Warped text');
  await page.getByLabel('Layer text color', { exact: true }).fill('#00ff00');
  await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => {
    (canvas as HTMLCanvasElement).dataset.beforeWarp = String(canvas.toDataURL().length);
  });
  const prompts = ['arc', '65', '20'];
  page.on('dialog', async (dialog) => await dialog.accept(prompts.shift()!));
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Warp Text…', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  await saved(page);
  const exported = await project(page), frame = exported.history[exported.index];
  const text = frame.layers.find((layer) => layer.kind === 'text');
  expect(text).toMatchObject({ text: 'Warped text', warp: { style: 'arc', bend: 65, vertical: 20 } });
  await page.reload();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  const reloaded = await project(page), reloadedText = reloaded.history[reloaded.index].layers.find((layer) => layer.kind === 'text');
  expect(reloadedText).toMatchObject({ warp: { style: 'arc', bend: 65, vertical: 20 } });
});

test('Text on Path stays editable, follows a vector path, and survives reload', async ({ page }) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await selectTool(page, 'Pen');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  for (const [x, y] of [[0.2, 0.3], [0.75, 0.3], [0.45, 0.3], [0.2, 0.3]])
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await expect(page.locator('footer')).toContainText('Editable path layer added');
  const before = await project(page);
  const path = before.history[before.index].layers.find((layer) => layer.kind === 'path') as { id: string };
  const imported = structuredClone(before) as typeof before;
  const frame = imported.history[imported.index] as { layers: Array<Record<string, unknown>>; active: string };
  const textId = '8f8f8f8f-8f8f-4f8f-8f8f-8f8f8f8f8f8f';
  const textLayer = { ...frame.layers[0] };
  delete textLayer.asset;
  delete textLayer.fillColor;
  Object.assign(textLayer, {
    id: textId,
    name: 'Path Text',
    kind: 'text',
    text: 'PATH',
    color: '#00ff00',
    fontSize: 48,
    fontFamily: 'Arial',
    bold: false,
    boxWidth: 300,
    textAlign: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    orientation: 'horizontal',
    textPath: { pathLayerId: path.id, offset: 0, reverse: false },
  });
  frame.layers.push(textLayer);
  frame.active = textId;
  await page.getByTestId('project-input').setInputFiles({
    name: 'text-on-path.pixelforge', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)),
  });
  await expect(page.getByLabel('Edit layer text', { exact: true })).toHaveValue('PATH');
  const prompts = [path.id, '0'];
  page.on('dialog', async (dialog) => {
    if (dialog.type() === 'confirm') await dialog.accept();
    else await dialog.accept(prompts.shift()!);
  });
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Text on Path…', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  await saved(page);
  const attached = await project(page);
  const text = attached.history[attached.index].layers.find((layer) => layer.kind === 'text');
  expect(text).toMatchObject({ text: 'PATH', textPath: { pathLayerId: path.id, offset: 0, reverse: true } });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const reloaded = await project(page);
  expect(reloaded.history[reloaded.index].layers.find((layer) => layer.kind === 'text')).toMatchObject({
    textPath: { pathLayerId: path.id, offset: 0, reverse: true },
  });
});
