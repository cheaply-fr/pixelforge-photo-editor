import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

type SavedLayer = {
  kind: string;
  text?: string;
  path?: { nodes?: unknown[]; contours?: { nodes?: unknown[]; closed?: boolean }[]; fillRule?: string };
};

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

test('Convert to Shape vectorizes editable text, persists contours and undo restores text on desktop/mobile', async ({ page }) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await selectTool(page, 'Text');
  await page.getByTestId('editor-canvas').click({ position: { x: 140, y: 120 } });
  await page.getByLabel('Edit layer text', { exact: true }).fill('Shape');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  const beforeAlpha = await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 16) count += 1;
    return count;
  });
  expect(beforeAlpha).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Convert to Shape', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText(/Text converted to \d+ editable shape contour/, { exact: false })).toBeVisible();
  const afterAlpha = await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 16) count += 1;
    return count;
  });
  expect(afterAlpha).toBeGreaterThan(0);
  expect(Math.abs(afterAlpha - beforeAlpha) / beforeAlpha).toBeLessThan(0.35);

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  const layers = project.history[project.index].layers as SavedLayer[];
  const shape = layers.find((layer) => layer.kind === 'path');
  expect(shape?.path?.contours?.length).toBeGreaterThan(0);
  expect(shape?.path?.contours?.every((contour) => contour.closed !== false)).toBe(true);
  expect(shape?.path?.fillRule).toBe('evenodd');
  expect(layers.some((layer) => layer.kind === 'text')).toBe(false);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByLabel('Edit layer text', { exact: true })).toHaveValue('Shape');
});
