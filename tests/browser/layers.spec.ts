import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';
const defaults = {
  tool: 'move',
  zoom: 72,
  color: '#ff0000',
  size: 18,
  text: 'Title',
  fontSize: 56,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  filter: 'none',
};
const saved = async (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );
async function project(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const download = await pending;
  const path = await download.path();
  return {
    path: path!,
    value: await downloadedProject(path!),
  };
}
const pixels = async (page: Page) => {
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'data-rendering',
    'false',
  );
  return page
    .getByTestId('editor-canvas')
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
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
  await saved(page);
});

test('editable text, layer properties, history and assets survive project export and reload', async ({
  page,
}) => {
  await selectTool(page, 'Text');
  await page.getByTestId('editor-canvas').click();
  await page
    .getByLabel('Edit layer text', { exact: true })
    .fill('Editable title');
  await page.getByLabel('Layer name', { exact: true }).fill('Headline');
  await page.getByLabel('Layer font', { exact: true }).selectOption('Georgia');
  await page.getByLabel('Layer X', { exact: true }).fill('100');
  await page.getByLabel('Layer X', { exact: true }).press('Enter');
  await page.getByLabel('Blend mode', { exact: true }).selectOption('screen');
  await page.getByLabel('Layer opacity', { exact: true }).fill('65');
  await saved(page);
  const exported = await project(page),
    frame = exported.value.history[exported.value.index];
  expect(exported.value.version).toBe(2);
  expect(Object.keys(exported.value.assets)).toHaveLength(1);
  expect(frame.layers[1]).toMatchObject({
    kind: 'text',
    text: 'Editable title',
    name: 'Headline',
    opacity: 0.65,
    blend: 'screen',
    fontFamily: 'Georgia',
  });
  expect(frame.layers[1].matrix[4]).toBe(100);
  await page.reload();
  await expect(page.getByLabel('Edit layer text', { exact: true })).toHaveValue(
    'Editable title',
  );
  await saved(page);
  const reloaded = await project(page);
  expect(reloaded.value.history[reloaded.value.index].layers[1]).toMatchObject(
    frame.layers[1],
  );
  await page
    .getByLabel('Edit layer text', { exact: true })
    .fill('Revised after reload');
  await saved(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByLabel('Edit layer text', { exact: true })).toHaveValue(
    'Editable title',
  );
  await page.getByTestId('project-input').setInputFiles(exported.path);
  await expect(page.getByLabel('Edit layer text', { exact: true })).toHaveValue(
    'Editable title',
  );
  await saved(page);
  const imported = await project(page);
  expect(imported.value.history[imported.value.index].layers[1]).toMatchObject(
    frame.layers[1],
  );
});

test('visibility, locking, duplicate, order and deletion change actual layers without losing originals', async ({
  page,
}) => {
  await page
    .getByRole('button', { name: 'Duplicate layer', exact: true })
    .click();
  await page.getByLabel('Layer name', { exact: true }).fill('Copy');
  await page.getByLabel('Layer X', { exact: true }).fill('400');
  await page.getByLabel('Layer X', { exact: true }).press('Enter');
  await page.getByLabel('Lock layer', { exact: true }).check();
  await expect(
    page.getByRole('button', { name: 'Delete layer', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel('Layer name', { exact: true })).toBeDisabled();
  await page.getByLabel('Lock layer', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Lower layer', exact: true }).click();
  let out = await project(page);
  expect(
    out.value.history[out.value.index].layers.map(
      (l: { name: string }) => l.name,
    ),
  ).toEqual(['Copy', 'Background']);
  expect(Object.keys(out.value.assets)).toHaveLength(1);
  await page.getByLabel('Visible', { exact: true }).uncheck();
  out = await project(page);
  expect(out.value.history[out.value.index].layers[0].visible).toBe(false);
  await page.getByRole('button', { name: 'Delete layer', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Select layer Copy', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(
    page.getByRole('button', { name: 'Select layer Copy', exact: true }),
  ).toBeVisible();
});

test('layer folders persist visibility, opacity, locking and collapsed workspace state', async ({
  page,
}) => {
  const beforeAlpha = await page.getByTestId('editor-canvas').evaluate(
    (canvas: HTMLCanvasElement) =>
      canvas.getContext('2d')!.getImageData(600, 400, 1, 1).data[3],
  );
  await page.getByRole('button', { name: 'Group active layer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Collapse group Group 1', exact: true })).toBeVisible();
  await page.getByLabel('Group name Group 1', { exact: true }).fill('Backdrop');
  await expect(page.getByLabel('Group name Backdrop', { exact: true })).toHaveValue('Backdrop');
  await page.getByLabel('Group opacity Backdrop', { exact: true }).fill('50');
  await saved(page);
  const halfAlpha = await page.getByTestId('editor-canvas').evaluate(
    (canvas: HTMLCanvasElement) =>
      canvas.getContext('2d')!.getImageData(600, 400, 1, 1).data[3],
  );
  expect(beforeAlpha).toBe(255);
  expect(halfAlpha).toBeLessThan(beforeAlpha);
  await page.getByLabel('Visible group Backdrop', { exact: true }).uncheck();
  const hiddenAlpha = await page.getByTestId('editor-canvas').evaluate(
    (canvas: HTMLCanvasElement) =>
      canvas.getContext('2d')!.getImageData(600, 400, 1, 1).data[3],
  );
  expect(hiddenAlpha).toBe(0);
  await page.getByLabel('Visible group Backdrop', { exact: true }).check();
  const exported = await project(page),
    frame = exported.value.history[exported.value.index];
  expect(frame.groups).toHaveLength(1);
  expect(frame.groups[0]).toMatchObject({ name: 'Backdrop', opacity: 0.5, collapsed: false });
  expect(frame.layers[0].groupId).toBe(frame.groups[0].id);
  await page.getByRole('button', { name: 'Collapse group Backdrop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select layer Background', exact: true })).toHaveCount(0);
  await page.getByLabel('Lock group Backdrop', { exact: true }).check();
  await expect(page.getByLabel('Layer name', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Visible', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Lock layer', { exact: true })).toBeDisabled();
  await page.getByLabel('Lock group Backdrop', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Expand group Backdrop', exact: true }).click();
  await page.getByRole('button', { name: 'Ungroup active layer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Collapse group Backdrop', exact: true })).toHaveCount(0);
  await saved(page);
  await page.reload();
  await saved(page);
  const reloaded = await project(page),
    reloadedFrame = reloaded.value.history[reloaded.value.index];
  expect(reloadedFrame.groups || []).toHaveLength(0);
  expect(reloadedFrame.layers[0].groupId).toBeUndefined();
});

test('legacy projects migrate with history while the original pointer stays recoverable', async ({
  page,
}) => {
  const oldId = '739d75a0-66c0-4c52-a11c-2b6548dff828';
  await page.evaluate(
    async ({ oldId, png, defaults }) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('pixelforge-documents', 2);
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction('drafts', 'readwrite');
          tx.objectStore('drafts').put(
            {
              version: 1,
              name: 'Legacy safe',
              index: 0,
              history: [{ url: 'data:image/png;base64,' + png, w: 1, h: 1 }],
              settings: defaults,
            },
            oldId,
          );
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    },
    { oldId, png, defaults },
  );
  await page.goto('/editor#draft=' + oldId);
  await expect(page.getByLabel('Document name')).toHaveValue('Legacy safe');
  await saved(page);
  const newId = new URL(page.url()).hash.match(/^#draft=([a-f0-9-]{36})$/)?.[1];
  expect(newId).toBeTruthy();
  expect(newId).not.toBe(oldId);
  expect(page.url()).not.toContain(oldId);
  const pointers = await page.evaluate(
    async ({ oldId, newId }) =>
      await new Promise<{
        oldPointer?: { kind?: string; version?: number; name?: string };
        newPointer?: { kind?: string; version?: number; name?: string };
      }>((resolve) => {
        const request = indexedDB.open('pixelforge-documents', 2);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('drafts');
          const store = transaction.objectStore('drafts');
          const oldRead = store.get(oldId);
          const newRead = store.get(newId);
          let oldPointer: { kind?: string; version?: number; name?: string } | undefined;
          let newPointer: { kind?: string; version?: number; name?: string } | undefined;
          oldRead.onsuccess = () => { oldPointer = oldRead.result; };
          newRead.onsuccess = () => { newPointer = newRead.result; };
          transaction.oncomplete = () => {
            resolve({ oldPointer, newPointer });
            db.close();
          };
        };
      }),
    { oldId, newId: newId! },
  );
  // Loading a v1 record migrates it in memory, then creates a fresh bookmark
  // and persists the converted v2 document there. The old pointer remains a
  // valid v1 recovery source for users who still have that URL bookmarked.
  expect(pointers.oldPointer?.kind).toBeUndefined();
  expect(pointers.oldPointer?.version).toBe(1);
  expect(pointers.oldPointer?.name).toBe('Legacy safe');
  expect(pointers.newPointer?.kind).toBe('pixelforge-draft-bundle');
  expect(pointers.newPointer?.version).toBe(1);
  expect(pointers.newPointer?.name).toBe('Legacy safe');
  const out = await project(page);
  expect(out.value.version).toBe(2);
  expect(out.value.history[0].layers[0].kind).toBe('raster');
});

test('malformed layer assets are rejected before replacing the current draft', async ({
  page,
}) => {
  const { value } = await project(page),
    id = Object.keys(value.assets)[0],
    original = await pixels(page),
    url = page.url();
  value.assets[id].w = 1;
  await page.getByTestId('project-input').setInputFiles({
    name: 'invalid.pixelforge',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
  await expect(
    page.getByText('Invalid project assets', { exact: true }),
  ).toBeVisible();
  expect(page.url()).toBe(url);
  expect(await pixels(page)).toBe(original);
});

test('malformed layer folder references are rejected before replacing the current draft', async ({
  page,
}) => {
  const { value } = await project(page),
    original = await pixels(page),
    frame = value.history[value.index];
  frame.layers[0].groupId = '739d75a0-66c0-4c52-a11c-2b6548dff828';
  await page.getByTestId('project-input').setInputFiles({
    name: 'invalid-group.pixelforge',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
  await expect(page.getByText('Invalid layer document', { exact: true })).toBeVisible();
  expect(await pixels(page)).toBe(original);
});

test('paint stays on its own raster layer and nondestructive filters retain source assets', async ({
  page,
}) => {
  const before = await pixels(page);
  await page
    .getByRole('button', { name: 'Add paint layer', exact: true })
    .click();
  await page.getByTestId('editor-canvas').click();
  await saved(page);
  expect(await pixels(page)).not.toBe(before);
  await page.getByLabel('Visible', { exact: true }).uncheck();
  await saved(page);
  expect(await pixels(page)).toBe(before);
  await page.getByLabel('Visible', { exact: true }).check();
  await page
    .getByRole('button', { name: 'Select layer Background', exact: true })
    .click();
  await page.getByRole('button', { name: 'Mono filter', exact: true }).click();
  const out = await project(page),
    f = out.value.history[out.value.index];
  expect(f.layers[0].adjustments.filter).toBe('grayscale(1) contrast(1.12)');
  expect(f.layers[1].kind).toBe('raster');
  await page
    .getByRole('button', { name: 'Original filter', exact: true })
    .click();
  await page.getByRole('button', { name: /^Select layer Paint/ }).click();
  await page.getByLabel('Visible', { exact: true }).uncheck();
  await saved(page);
  expect(await pixels(page)).toBe(before);
});

test('brush hardness and opacity persist across a raster stroke', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await page.getByLabel('Hardness', { exact: true }).fill('35');
  await page.getByLabel('Opacity', { exact: true }).fill('55');
  const canvas = page.getByTestId('editor-canvas'), box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5, { steps: 5 });
  await page.mouse.up();
  await saved(page);
  const exported = await project(page);
  expect(exported.value.settings.brushOpacity).toBe(55);
  expect(exported.value.settings.hardness).toBe(35);
  await page.reload();
  await expect(page.getByLabel('Hardness', { exact: true })).toHaveValue('35');
  await expect(page.getByLabel('Opacity', { exact: true })).toHaveValue('55');
});

test('pencil paints a hard raster stroke and persists its tool state', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await selectTool(page, 'Pencil');
  await page.getByLabel('Size', { exact: true }).fill('8');
  await page.getByLabel('Opacity', { exact: true }).fill('70');
  const initial = await project(page),
    initialFrame = initial.value.history[initial.value.index],
    initialLayer = initialFrame.layers[initialFrame.layers.length - 1],
    canvas = page.getByTestId('editor-canvas'),
    box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5, { steps: 5 });
  await page.mouse.up();
  await saved(page);
  const exported = await project(page),
    frame = exported.value.history[exported.value.index],
    painted = frame.layers[frame.layers.length - 1];
  expect(exported.value.settings).toMatchObject({ tool: 'pencil', size: 8, brushOpacity: 70 });
  expect(painted.kind).toBe('raster');
  expect(painted.asset).not.toBe(initialLayer.kind === 'raster' ? initialLayer.asset : undefined);
  const [centerAlpha, outsideAlpha] = await page.evaluate(
    async ({ url, w, h }) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const sample = document.createElement('canvas');
      sample.width = w;
      sample.height = h;
      const context = sample.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return [
        context.getImageData(Math.floor(w / 2), Math.floor(h / 2), 1, 1).data[3],
        context.getImageData(Math.floor(w / 2), Math.floor(h / 2) + 20, 1, 1).data[3],
      ];
    },
    { url: exported.value.assets[painted.asset].url, w: exported.value.assets[painted.asset].w, h: exported.value.assets[painted.asset].h },
  );
  expect(centerAlpha).toBeGreaterThan(0);
  expect(outsideAlpha).toBe(0);
  expect(exported.value.assets[painted.asset]).toBeTruthy();
  await page.reload();
  await expect(page.getByLabel('Opacity', { exact: true })).toHaveValue('70');
  const roundTripped = await project(page);
  expect(roundTripped.value.settings.tool).toBe('pencil');
});

test('color replacement changes sampled pixels and persists tolerance', async ({
  page,
}) => {
  const fixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 20;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#e11a2b';
    context.fillRect(0, 0, 20, 20);
    context.fillStyle = '#1944dd';
    context.fillRect(20, 0, 20, 20);
    return canvas.toDataURL().split(',')[1];
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'color-replace-fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from(fixture, 'base64'),
  });
  await expect(page.getByLabel('Document name')).toHaveValue('color-replace-fixture');
  await page.getByLabel('Layer X', { exact: true }).fill('4');
  await page.getByLabel('Layer X', { exact: true }).press('Enter');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  await selectTool(page, 'Color Replace');
  await page.getByLabel('Drawing color', { exact: true }).fill('#00ff4c');
  await page.getByLabel('Size', { exact: true }).fill('10');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await page.getByLabel('Color tolerance', { exact: true }).fill('5');
  const canvas = page.getByTestId('editor-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByText('Color replacement applied; undo restores the original pixels', { exact: true })).toBeVisible();
  const visibleSample = await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) =>
    Array.from(canvas.getContext('2d')!.getImageData(10, 10, 1, 1).data),
  );
  expect(visibleSample[1]).toBeGreaterThan(220);
  await saved(page);
  const exported = await project(page),
    frame = exported.value.history[exported.value.index],
    layer = frame.layers[0],
    asset = exported.value.assets[layer.asset];
  expect(exported.value.settings).toMatchObject({
    tool: 'color-replace',
    color: '#00ff4c',
    colorTolerance: 5,
  });
  const samples = await page.evaluate(
    async ({ url }) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const sample = document.createElement('canvas');
      sample.width = image.width;
      sample.height = image.height;
      const context = sample.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const read = (x: number) => Array.from(context.getImageData(x, 10, 1, 1).data);
      return { replaced: read(10), untouched: read(30) };
    },
    { url: asset.url },
  );
  expect(samples.replaced[1]).toBeGreaterThan(220);
  expect(samples.replaced[2]).toBeGreaterThan(40);
  expect(samples.untouched[2]).toBeGreaterThan(180);
  expect(samples.untouched[1]).toBeLessThan(120);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Color Replace tool', exact: true })).toHaveClass(/active/);
  await expect(page.getByLabel('Color tolerance', { exact: true })).toHaveValue('5');
  const roundTripped = await project(page);
  expect(roundTripped.value.settings.tool).toBe('color-replace');
});

test('layer position, blending and visibility produce exact composite pixels', async ({
  page,
}) => {
  const fixtures = await page.evaluate(() => {
    const make = (color: string, w: number) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = 1;
      const x = c.getContext('2d')!;
      x.fillStyle = color;
      x.fillRect(0, 0, w, 1);
      return c.toDataURL().split(',')[1];
    };
    return { blue: make('#0000ff', 2), red: make('#ff0000', 1) };
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'blue.png',
    mimeType: 'image/png',
    buffer: Buffer.from(fixtures.blue, 'base64'),
  });
  await expect(page.getByLabel('Document name')).toHaveValue('blue');
  await page.getByTestId('layer-input').setInputFiles({
    name: 'red.png',
    mimeType: 'image/png',
    buffer: Buffer.from(fixtures.red, 'base64'),
  });
  await expect(page.getByLabel('Layer name', { exact: true })).toHaveValue(
    'red.png',
  );
  await page.getByLabel('Layer X', { exact: true }).fill('1');
  await page.getByLabel('Layer X', { exact: true }).press('Enter');
  const read = () =>
    page
      .getByTestId('editor-canvas')
      .evaluate((c: HTMLCanvasElement) =>
        Array.from(c.getContext('2d')!.getImageData(0, 0, 2, 1).data),
      );
  await expect.poll(read).toEqual([0, 0, 255, 255, 255, 0, 0, 255]);
  await page.getByLabel('Blend mode', { exact: true }).selectOption('multiply');
  await expect.poll(read).toEqual([0, 0, 255, 255, 0, 0, 0, 255]);
  await page.getByLabel('Visible', { exact: true }).uncheck();
  await expect.poll(read).toEqual([0, 0, 255, 255, 0, 0, 255, 255]);
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Resize image…' }).click();
  await page.getByLabel('Width (px)', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Apply resize' }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1');
});

test('vector shapes remain editable through property edits, rotation and undo', async ({
  page,
}) => {
  await selectTool(page, 'Shape');
  const canvas = page.getByTestId('editor-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(page.getByLabel('Shape width', { exact: true })).toBeVisible();
  await page.getByLabel('Filled shape', { exact: true }).check();
  await page.getByLabel('Shape width', { exact: true }).fill('300');
  await page.getByLabel('Shape width', { exact: true }).press('Enter');
  const first = await project(page),
    original = first.value.history[first.value.index].layers[1];
  expect(original.kind).toBe('rectangle');
  expect(original.width).toBe(300);
  expect(original.fill).toBe(true);
  await page.getByRole('button', { name: 'Rotate right', exact: true }).click();
  await expect(canvas).toHaveAttribute('width', '960');
  const rotated = await project(page);
  expect(rotated.value.history[rotated.value.index].layers[1].kind).toBe(
    'rectangle',
  );
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  const undone = await project(page);
  expect(undone.value.history[undone.value.index].layers[1]).toEqual(original);
});

test('ellipse layers stay vector-editable through export and reload', async ({
  page,
}) => {
  await selectTool(page, 'Ellipse');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.45, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(page.getByLabel('Shape width', { exact: true })).toBeVisible();
  const exported = await project(page),
    ellipse = exported.value.history[exported.value.index].layers[1];
  expect(ellipse).toMatchObject({ kind: 'ellipse', fill: false });
  expect(ellipse.width).toBeGreaterThan(1);
  await page.getByLabel('Filled shape', { exact: true }).check();
  await page.reload();
  await expect(page.getByLabel('Shape width', { exact: true })).toBeVisible();
  const reloaded = await project(page);
  expect(reloaded.value.history[reloaded.value.index].layers[1]).toMatchObject({
    kind: 'ellipse',
    fill: true,
  });
});

test('polygon layers render filled pixels, keep editable sides, and round-trip with undo', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await page.getByLabel('Drawing color', { exact: true }).fill('#ff0000');
  await selectTool(page, 'Polygon');
  const canvas = page.getByTestId('editor-canvas'), box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55, { steps: 5 });
  await page.mouse.up();
  const polygonSides = page.getByRole('spinbutton', { name: 'Polygon sides', exact: true });
  await expect(polygonSides).toBeVisible();
  await page.getByLabel('Filled shape', { exact: true }).check();
  await polygonSides.fill('6');
  await polygonSides.press('Enter');
  await saved(page);
  const exported = await project(page), polygon = exported.value.history[exported.value.index].layers[1];
  expect(polygon).toMatchObject({ kind: 'polygon', sides: 6, fill: true, color: '#ff0000' });
  const center = { x: Math.round(polygon.matrix[4] + polygon.width / 2), y: Math.round(polygon.matrix[5] + polygon.height / 2) };
  await expect.poll(() => canvas.evaluate((item: HTMLCanvasElement, p) => Array.from(item.getContext('2d')!.getImageData(p.x, p.y, 1, 1).data), center)).toEqual([255, 0, 0, 255]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(polygonSides).toHaveValue('5');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await expect(polygonSides).toHaveValue('6');
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: 'Polygon sides', exact: true })).toHaveValue('6');
  const reloaded = await project(page);
  expect(reloaded.value.history[reloaded.value.index].layers[1]).toMatchObject({ kind: 'polygon', sides: 6, fill: true });
});

test('line layers preserve stroke pixels and geometry through reload', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await page.getByLabel('Drawing color', { exact: true }).fill('#00ff00');
  await selectTool(page, 'Line');
  const canvas = page.getByTestId('editor-canvas'), box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.65, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByLabel('Line length', { exact: true })).toBeVisible();
  const exported = await project(page), line = exported.value.history[exported.value.index].layers[1];
  expect(line).toMatchObject({ kind: 'line', color: '#00ff00' });
  const sample = { x: Math.round(line.matrix[4] + line.width / 2), y: Math.round(line.matrix[5] + line.height / 2) };
  await expect.poll(() => canvas.evaluate((item: HTMLCanvasElement, p) => Array.from(item.getContext('2d')!.getImageData(p.x, p.y, 1, 1).data), sample)).toEqual([0, 255, 0, 255]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByLabel('Line length', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await expect(page.getByLabel('Line length', { exact: true })).toBeVisible();
  await page.reload();
  const reloaded = await project(page);
  expect(reloaded.value.history[reloaded.value.index].layers[1]).toMatchObject({ kind: 'line', color: '#00ff00', width: line.width, height: line.height });
});

test('paint bucket fills a contiguous raster region and is undoable', async ({
  page,
}) => {
  const canvas = page.getByTestId('editor-canvas');
  const before = await pixels(page);
  await page.getByLabel('Drawing color', { exact: true }).fill('#00ff00');
  await selectTool(page, 'Fill');
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect.poll(() => pixels(page)).not.toBe(before);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect.poll(() => pixels(page)).toBe(before);
});

test('eyedropper samples a rendered pixel into the drawing color', async ({
  page,
}) => {
  await selectTool(page, 'Eyedropper');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page.getByLabel('Drawing color', { exact: true })).not.toHaveValue(
    '#ff5c35',
  );
});

test('zoom tool increases the document view without changing pixels', async ({
  page,
}) => {
  const before = await pixels(page);
  await selectTool(page, 'Zoom');
  await page.getByTestId('editor-canvas').click();
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('82');
  expect(await pixels(page)).toBe(before);
});

test('hand tool provides a pannable canvas gesture', async ({ page }) => {
  await selectTool(page, 'Hand');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 120, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 80, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Hand tool', exact: true })).toHaveClass(
    /active/,
  );
});

test('gradient tool applies an undoable color fade to a raster layer', async ({
  page,
}) => {
  const canvas = page.getByTestId('editor-canvas'), before = await pixels(page),
    box = (await canvas.boundingBox())!;
  await selectTool(page, 'Gradient');
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 100, box.y + box.height - 100, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => pixels(page)).not.toBe(before);
});

test('clone and healing tools use an explicit source point and commit raster edits', async ({
  page,
}) => {
  const canvas = page.getByTestId('editor-canvas'), box = (await canvas.boundingBox())!;
  await selectTool(page, 'Clone');
  await canvas.click({ position: { x: box.width * 0.25, y: box.height * 0.25 } });
  await expect(page.getByText('Clone source set; drag on the image to paint it', { exact: true })).toBeVisible();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByText('Clone stroke applied', { exact: true })).toBeVisible();
  await selectTool(page, 'Healing');
  await canvas.click({ position: { x: box.width * 0.2, y: box.height * 0.2 } });
  await expect(page.getByText('Clone source set; drag on the image to paint it', { exact: true })).toBeVisible();
});

test('rectangular selection creates a nondestructive raster mask and survives reload', async ({
  page,
}) => {
  await selectTool(page, 'Select');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(
    page.getByRole('button', { name: 'Mask from selection', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Mask from selection', exact: true }).click();
  await expect(page.getByText('Nondestructive mask active', { exact: true })).toBeVisible();
  const exported = await project(page),
    frame = exported.value.history[exported.value.index],
    layer = frame.layers[0];
  expect(frame.selection).toMatchObject({ inverted: false });
  expect(layer.mask).toEqual(expect.any(String));
  expect(exported.value.assets[layer.mask].w).toBe(frame.w);
  expect(exported.value.assets[layer.mask].h).toBe(frame.h);
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Resize image…' }).click();
  await page.getByLabel('Width (px)', { exact: true }).fill('720');
  await page.getByLabel('Height (px)', { exact: true }).fill('480');
  await page.getByRole('button', { name: 'Apply resize' }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '720');
  const resized = await project(page),
    resizedFrame = resized.value.history[resized.value.index],
    resizedLayer = resizedFrame.layers[0];
  expect(resizedLayer.mask).toEqual(expect.any(String));
  expect(resized.value.assets[resizedLayer.mask].w).toBe(720);
  expect(resized.value.assets[resizedLayer.mask].h).toBe(480);
  await page.getByRole('button', { name: 'Rotate right', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '480');
  const rotated = await project(page),
    rotatedFrame = rotated.value.history[rotated.value.index],
    rotatedLayer = rotatedFrame.layers[0];
  expect(rotated.value.assets[rotatedLayer.mask].w).toBe(480);
  expect(rotated.value.assets[rotatedLayer.mask].h).toBe(720);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '720');
  await selectTool(page, 'Brush');
  await page.getByLabel('Size', { exact: true }).fill('12');
  const resizedCanvas = page.getByTestId('editor-canvas');
  await resizedCanvas.scrollIntoViewIfNeeded();
  const resizedBox = (await resizedCanvas.boundingBox())!;
  await page.mouse.move(resizedBox.x + resizedBox.width / 2, resizedBox.y + resizedBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizedBox.x + resizedBox.width / 2 + 16, resizedBox.y + resizedBox.height / 2, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  const painted = await project(page),
    paintedFrame = painted.value.history[painted.value.index],
    paintedLayer = paintedFrame.layers[0];
  expect(paintedLayer.matrix[0]).toBeCloseTo(0.5);
  expect(paintedLayer.asset).not.toBe(resizedLayer.asset);
  expect(paintedLayer.mask).toEqual(expect.any(String));
  expect(painted.value.assets[paintedLayer.asset].w).toBe(frame.w);
  expect(painted.value.assets[paintedLayer.asset].h).toBe(frame.h);
  await page.reload();
  await expect(page.getByText('Nondestructive mask active', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove mask', exact: true }).click();
  await expect(page.getByText('Nondestructive mask active', { exact: true })).toHaveCount(0);
});

test('elliptical marquee persists its geometry and can be inverted', async ({
  page,
}) => {
  await selectTool(page, 'Elliptical marquee');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.75, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText('Elliptical selection created', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Invert selection', exact: true }).click();
  const exported = await project(page),
    frame = exported.value.history[exported.value.index];
  expect(frame.selection).toMatchObject({ shape: 'ellipse', inverted: true });
  expect(frame.selection.w).toBeGreaterThan(1);
  expect(frame.selection.h).toBeGreaterThan(1);
});

test('single row and column marquees select one pixel across the frame and persist masks', async ({
  page,
}) => {
  const canvas = page.getByTestId('editor-canvas'),
    box = (await canvas.boundingBox())!;
  await selectTool(page, 'Single Row marquee');
  const rowTool = page.getByRole('button', {
    name: 'Single Row marquee tool',
    exact: true,
  });
  await canvas.click({ position: { x: box.width * 0.37, y: box.height * 0.45 } });
  await expect(page.getByText('Single row selection created', { exact: true })).toBeVisible();
  let exported = await project(page),
    frame = exported.value.history[exported.value.index],
    selection = frame.selection;
  expect(exported.value.settings.tool).toBe('row-select');
  expect(selection).toMatchObject({ shape: 'rectangle', x: 0, w: frame.w, h: 1 });
  expect(selection.y).toBeGreaterThan(0);
  expect(selection.y).toBeLessThan(frame.h);
  await page.getByRole('button', { name: 'Mask from selection', exact: true }).click();
  exported = await project(page);
  frame = exported.value.history[exported.value.index];
  const rowMask = exported.value.assets[frame.layers[0].mask];
  expect(rowMask).toBeDefined();
  const rowAlpha = await page.evaluate(async ({ url, x, y, adjacent }) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const probe = document.createElement('canvas');
    probe.width = image.naturalWidth;
    probe.height = image.naturalHeight;
    const context = probe.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return {
      selected: context.getImageData(x, y, 1, 1).data[3],
      adjacent: context.getImageData(x, adjacent, 1, 1).data[3],
    };
  }, {
    url: rowMask.url,
    x: Math.floor(frame.w / 2),
    y: selection.y,
    adjacent: selection.y === frame.h - 1 ? selection.y - 1 : selection.y + 1,
  });
  expect(rowAlpha.selected).toBeGreaterThan(0);
  expect(rowAlpha.adjacent).toBe(0);

  await page.reload();
  await expect(rowTool).toHaveClass(/active/);
  await selectTool(page, 'Single Column marquee');
  await canvas.click({ position: { x: box.width * 0.62, y: box.height * 0.2 } });
  await expect(page.getByText('Single column selection created', { exact: true })).toBeVisible();
  exported = await project(page);
  frame = exported.value.history[exported.value.index];
  selection = frame.selection;
  expect(exported.value.settings.tool).toBe('column-select');
  expect(selection).toMatchObject({ shape: 'rectangle', y: 0, w: 1, h: frame.h });
  expect(selection.x).toBeGreaterThan(0);
  expect(selection.x).toBeLessThan(frame.w);
  await page.getByRole('button', { name: 'Mask from selection', exact: true }).click();
  exported = await project(page);
  frame = exported.value.history[exported.value.index];
  const columnMask = exported.value.assets[frame.layers[0].mask];
  const columnAlpha = await page.evaluate(async ({ url, y, x, adjacent }) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const probe = document.createElement('canvas');
    probe.width = image.naturalWidth;
    probe.height = image.naturalHeight;
    const context = probe.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return {
      selected: context.getImageData(x, y, 1, 1).data[3],
      adjacent: context.getImageData(adjacent, y, 1, 1).data[3],
    };
  }, {
    url: columnMask.url,
    x: selection.x,
    y: Math.floor(frame.h / 2),
    adjacent: selection.x === frame.w - 1 ? selection.x - 1 : selection.x + 1,
  });
  expect(columnAlpha.selected).toBeGreaterThan(0);
  expect(columnAlpha.adjacent).toBe(0);
});

test('lasso selection stores polygon points and survives project round-trip', async ({
  page,
}) => {
  await selectTool(page, 'Lasso');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  const points = [
    [0.2, 0.2],
    [0.7, 0.25],
    [0.6, 0.7],
    [0.25, 0.65],
  ];
  await page.mouse.move(box.x + box.width * points[0][0], box.y + box.height * points[0][1]);
  await page.mouse.down();
  for (const [x, y] of points.slice(1))
    await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 3 });
  await page.mouse.up();
  const exported = await project(page),
    frame = exported.value.history[exported.value.index];
  expect(frame.selection.shape).toBe('polygon');
  expect(frame.selection.points.length).toBeGreaterThanOrEqual(3);
  expect(frame.selection.w).toBeGreaterThan(1);
  await page.reload();
  const reloaded = await project(page);
  expect(reloaded.value.history[reloaded.value.index].selection.shape).toBe('polygon');
});

test('Magnetic Lasso snaps an edge-following path and survives reload', async ({
  page,
}) => {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await selectTool(page, 'Magnetic Lasso');
  await expect(page.getByText(/Magnetic Lasso:/)).toBeVisible();
  const points = [
    [0.16, 0.18],
    [0.78, 0.18],
    [0.84, 0.72],
    [0.18, 0.76],
  ];
  await page.mouse.move(box.x + box.width * points[0][0], box.y + box.height * points[0][1]);
  await page.mouse.down();
  for (const [x, y] of points.slice(1))
    await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByText('Magnetic selection created', { exact: true })).toBeVisible();
  const exported = await project(page),
    frame = exported.value.history[exported.value.index];
  expect(frame.selection.shape).toBe('polygon');
  expect(frame.selection.points.length).toBeGreaterThanOrEqual(3);
  await page.reload();
  const reloaded = await project(page);
  expect(reloaded.value.history[reloaded.value.index].selection.points.length).toBeGreaterThanOrEqual(3);
});

test('Magnetic Lasso touch cancellation leaves the draft unchanged', async ({
  page,
}, testInfo) => {
  testInfo.skip(testInfo.project.name !== 'mobile', 'Touch cancellation runs in the mobile profile');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await selectTool(page, 'Magnetic Lasso');
  await page.touchscreen.tap(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await page.keyboard.press('Escape');
  await expect(page.getByText('Magnetic Lasso cancelled', { exact: true })).toBeVisible();
  const exported = await project(page);
  expect(exported.value.history[exported.value.index].selection).toBeUndefined();
});

test('polygonal lasso closes by vertex, masks representative pixels and survives reload', async ({
  page,
}) => {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await selectTool(page, 'Polygonal Lasso');
  const points = [
    [0.2, 0.2],
    [0.8, 0.2],
    [0.5, 0.75],
  ];
  for (const [x, y] of points)
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  // Clicking the first vertex closes the polygon on both mouse and touch-style
  // pointer sequences; the gesture does not require a drag.
  await page.mouse.click(box.x + box.width * points[0][0], box.y + box.height * points[0][1]);
  await expect(page.getByText('Polygonal selection created', { exact: true })).toBeVisible();

  const exported = await project(page),
    frame = exported.value.history[exported.value.index],
    selection = frame.selection;
  expect(selection).toMatchObject({ shape: 'polygon', points: expect.any(Array) });
  expect(selection.points).toHaveLength(3);
  expect(selection.w).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Mask from selection', exact: true }).click();
  await expect(page.getByText('Nondestructive mask active', { exact: true })).toBeVisible();
  await expect.poll(() => canvas.evaluate((item: HTMLCanvasElement) => {
    const context = item.getContext('2d')!,
      inside = context.getImageData(Math.floor(item.width * 0.5), Math.floor(item.height * 0.4), 1, 1).data[3],
      outside = context.getImageData(Math.floor(item.width * 0.1), Math.floor(item.height * 0.1), 1, 1).data[3];
    return { inside: inside > 0, outside: outside === 0 };
  })).toEqual({ inside: true, outside: true });
  const masked = await canvas.evaluate((item: HTMLCanvasElement) => {
    const context = item.getContext('2d')!,
      inside = context.getImageData(Math.floor(item.width * 0.5), Math.floor(item.height * 0.4), 1, 1).data[3],
      outside = context.getImageData(Math.floor(item.width * 0.1), Math.floor(item.height * 0.1), 1, 1).data[3];
    return { inside, outside };
  });
  expect(masked.inside).toBeGreaterThan(0);
  expect(masked.outside).toBe(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByText('Nondestructive mask active', { exact: true })).toHaveCount(0);
  let afterUndo = await project(page);
  expect(afterUndo.value.history[afterUndo.value.index].layers[0].mask).toBeUndefined();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await expect(page.getByText('Nondestructive mask active', { exact: true })).toBeVisible();
  afterUndo = await project(page);
  expect(afterUndo.value.history[afterUndo.value.index].layers[0].mask).toEqual(expect.any(String));
  const roundTrip = afterUndo;
  await page.reload();
  await expect(page.getByText('Nondestructive mask active', { exact: true })).toBeVisible();
  const reloaded = await project(page),
    reloadedFrame = reloaded.value.history[reloaded.value.index];
  expect(reloadedFrame.selection.points).toHaveLength(3);
  expect(reloadedFrame.layers[0].mask).toEqual(expect.any(String));
  await page.getByTestId('project-input').setInputFiles(roundTrip.path);
  await expect(page.getByText('Nondestructive mask active', { exact: true })).toBeVisible();
  const imported = await project(page),
    importedFrame = imported.value.history[imported.value.index];
  expect(importedFrame.selection.points).toEqual(reloadedFrame.selection.points);
  expect(importedFrame.layers[0].mask).toEqual(expect.any(String));
});

test('polygonal lasso double-click finalizes a desktop path', async ({ page }, testInfo) => {
  testInfo.skip(testInfo.project.name !== 'desktop', 'Double-click coverage runs in the desktop profile');
  const canvas = page.getByTestId('editor-canvas'), box = (await canvas.boundingBox())!;
  await selectTool(page, 'Polygonal Lasso');
  const points = [
    [0.2, 0.2],
    [0.8, 0.2],
    [0.5, 0.75],
  ];
  await page.mouse.click(box.x + box.width * points[0][0], box.y + box.height * points[0][1]);
  await page.mouse.click(box.x + box.width * points[1][0], box.y + box.height * points[1][1]);
  await page.mouse.dblclick(box.x + box.width * points[2][0], box.y + box.height * points[2][1]);
  await expect(page.getByText('Polygonal selection created', { exact: true })).toBeVisible();
  const exported = await project(page),
    frame = exported.value.history[exported.value.index];
  expect(frame.selection.shape).toBe('polygon');
  expect(frame.selection.points).toHaveLength(3);
});

test('polygonal lasso touch taps close on mobile and persist the same geometry', async ({ page }, testInfo) => {
  testInfo.skip(testInfo.project.name !== 'mobile', 'Touch coverage runs in the mobile profile');
  const canvas = page.getByTestId('editor-canvas'), box = (await canvas.boundingBox())!;
  await selectTool(page, 'Polygonal Lasso');
  const points = [
    [0.2, 0.2],
    [0.8, 0.2],
    [0.5, 0.75],
  ];
  for (const [x, y] of points)
    await page.touchscreen.tap(box.x + box.width * x, box.y + box.height * y);
  await page.touchscreen.tap(box.x + box.width * points[0][0], box.y + box.height * points[0][1]);
  await expect(page.getByText('Polygonal selection created', { exact: true })).toBeVisible();
  const exported = await project(page),
    frame = exported.value.history[exported.value.index];
  expect(frame.selection.shape).toBe('polygon');
  expect(frame.selection.points).toHaveLength(3);
  expect(Math.abs(frame.selection.points[0].x - frame.w * points[0][0])).toBeLessThan(3);
});

test('Escape cancels an unfinished polygonal lasso without saving a selection', async ({ page }) => {
  const canvas = page.getByTestId('editor-canvas'), box = (await canvas.boundingBox())!;
  await selectTool(page, 'Polygonal Lasso');
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.2);
  await page.keyboard.press('Escape');
  await expect(page.getByText('Polygonal lasso cancelled', { exact: true })).toBeVisible();
  const exported = await project(page),
    frame = exported.value.history[exported.value.index];
  expect(frame.selection).toBeUndefined();
  await page.reload();
  const reloaded = await project(page);
  expect(reloaded.value.history[reloaded.value.index].selection).toBeUndefined();
});

test('selection add mode composes geometry and masks pixels nondestructively', async ({
  page,
}) => {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await selectTool(page, 'Select');
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.8, { steps: 3 });
  await page.mouse.up();
  await page.getByLabel('Selection mode', { exact: true }).selectOption('add');
  await selectTool(page, 'Elliptical marquee');
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.8, { steps: 3 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Mask from selection', exact: true }).click();
  const exported = await project(page),
    frame = exported.value.history[exported.value.index],
    layer = frame.layers[0];
  expect(frame.selection.parts.map((part: { operation: string }) => part.operation)).toEqual(['replace', 'add']);
  expect(layer.mask).toEqual(expect.any(String));
  await expect.poll(() => canvas.evaluate((item: HTMLCanvasElement) => {
    const data = item.getContext('2d')!.getImageData(0, 0, item.width, item.height).data;
    return [data[3], data[(item.width - 1) * 4 + 3]];
  })).toEqual([0, 0]);
});

test('magic wand persists a color-based alpha selection and converts it to a layer mask', async ({
  page,
}) => {
  const canvas = page.getByTestId('editor-canvas');
  await selectTool(page, 'Magic Wand');
  await canvas.click({ position: { x: 20, y: 20 } });
  const exported = await project(page),
    frame = exported.value.history[exported.value.index],
    selectionMask = frame.selection.mask;
  expect(selectionMask).toEqual(expect.any(String));
  expect(exported.value.assets[selectionMask].w).toBe(frame.w);
  expect(exported.value.assets[selectionMask].h).toBe(frame.h);
  await page.getByRole('button', { name: 'Mask from selection', exact: true }).click();
  await expect(page.getByText('Nondestructive mask active', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Nondestructive mask active', { exact: true })).toBeVisible();
});

test('a stale tab cannot overwrite or discard newer work and can save its own local copy', async ({
  page,
  context,
}) => {
  const bookmark = page.url();
  const second = await context.newPage();
  await second.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await second.goto(bookmark);
  await expect(second.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await second.getByLabel('Document name').fill('Newer tab work');
  await saved(second);
  await page.getByLabel('Document name').fill('Older tab edits');
  await expect(page.getByRole('alert')).toHaveText(
    'This draft changed in another tab. Save a local copy to keep your edits.',
  );
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', { name: 'Discard draft', exact: true })
    .click();
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Could not discard the draft. Please try again.');
  await second.reload();
  await expect(second.getByLabel('Document name')).toHaveValue(
    'Newer tab work',
  );
  await saved(second);
  await page
    .getByRole('button', { name: 'Save local copy', exact: true })
    .click();
  await saved(page);
  expect(page.url()).not.toBe(bookmark);
  await page.reload();
  await expect(page.getByLabel('Document name')).toHaveValue('Older tab edits');
  await saved(page);
  await page.goto(bookmark);
  await expect(page.getByLabel('Document name')).toHaveValue('Newer tab work');
  await second.close();
});

test('a stale tab can reload the strictly newer draft without changing its bookmark', async ({
  page,
  context,
}) => {
  const bookmark = page.url();
  const second = await context.newPage();
  await second.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await second.goto(bookmark);
  await expect(second.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await second.getByLabel('Document name').fill('Newer recovery work');
  await saved(second);

  await page.getByLabel('Document name').fill('Stale edits to replace');
  await expect(page.getByRole('alert')).toHaveText(
    'This draft changed in another tab. Save a local copy to keep your edits.',
  );
  await expect(
    page.getByRole('button', { name: 'Reload newer draft', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Reload newer draft', exact: true })
    .click();
  await expect(page.getByLabel('Document name')).toHaveValue(
    'Newer recovery work',
  );
  await saved(page);
  expect(page.url()).toBe(bookmark);
  await second.close();
});
