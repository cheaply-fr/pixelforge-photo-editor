import { readPortableBundle } from '../../src/portableBundle';
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';

/** Read the current .pixelforge download, regardless of its temporary path. */
export async function downloadedProject(path: string): Promise<ReturnType<typeof JSON.parse>> {
  const bytes = await readFile(path);
  return await readPortableBundle(new Blob([bytes])) as ReturnType<typeof JSON.parse>;
}

type PlacedAsset = { url: string; w: number; h: number };

/**
 * A paint layer's pixels in canvas coordinates. Paint layers are stored at
 * their content bounds and positioned by an integer translation, so tests
 * that sample a layer at canvas fractions draw the stored asset at its offset
 * into a canvas-sized surface first.
 */
export async function placedAsset(
  page: Page,
  project: {
    history: Array<{ w: number; h: number; layers: Array<{ asset?: string; matrix?: number[] }> }>;
    index: number;
    assets: Record<string, PlacedAsset>;
  },
  layer: { asset?: string; matrix?: number[] },
): Promise<PlacedAsset> {
  const frame = project.history[project.index];
  const asset = project.assets[layer.asset!];
  const matrix = layer.matrix ?? [1, 0, 0, 1, 0, 0];
  return page.evaluate(
    async ({ asset, matrix, w, h }) => {
      const image = new Image();
      image.src = asset.url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext('2d')!;
      context.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
      context.drawImage(image, 0, 0);
      return { url: canvas.toDataURL(), w, h };
    },
    { asset, matrix, w: frame.w, h: frame.h },
  );
}
