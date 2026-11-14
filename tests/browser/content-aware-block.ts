import { expect, type Page } from '@playwright/test';
import { selectTool } from './tool-selection';

/** Open a white 200×200 image with a red 60×60 block at (70,70). */
export async function openRedBlock(page: Page) {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 200, 200);
    context.fillStyle = '#ff0000';
    context.fillRect(70, 70, 60, 60);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('file-input').setInputFiles({ name: 'red-block.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '200');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
}

/** Lower the shared brush opacity, which content-aware commands must ignore. */
export async function lowerBrushOpacity(page: Page, percent: number) {
  await selectTool(page, 'Brush');
  await page.getByLabel('Opacity', { exact: true }).fill(String(percent));
  await page.getByLabel('Opacity', { exact: true }).press('Tab');
}

/** Drag a rectangular marquee between two document points. */
export async function marquee(page: Page, from: [number, number], to: [number, number]) {
  await selectTool(page, 'Select');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  const point = ([x, y]: [number, number]) => [box.x + (x / 200) * box.width, box.y + (y / 200) * box.height] as const;
  await page.mouse.move(...point(from));
  await page.mouse.down();
  await page.mouse.move(...point(to), { steps: 4 });
  await page.mouse.up();
  await expect(page.getByText('Rectangular selection created', { exact: true })).toBeVisible();
}

export async function documentPixel(page: Page, x: number, y: number) {
  const canvas = page.getByTestId('editor-canvas');
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  return canvas.evaluate((element, [px, py]) => Array.from((element as HTMLCanvasElement).getContext('2d')!.getImageData(px, py, 1, 1).data), [x, y]);
}
