/**
 * Browser half of SVG import: turns an import plan into document layers.
 * Vector and text layers come straight from the plan; raster items are
 * rasterized by the browser's own SVG renderer at document size.
 */
import {
  addAsset,
  commonLayer,
  loadTextLayerFonts,
  measureTextLayerLayout,
  prepareTextContext,
  surface,
  type Assets,
  type Group,
  type Layer,
} from './document';
import { multiplyMatrix, planSvgImport, type SvgImportPlan } from './svgImport';

export type SvgImportResult = {
  w: number;
  h: number;
  /** Bottom-to-top. Group members carry `groupId`. */
  layers: Layer[];
  groups: Group[];
  plan: SvgImportPlan;
};

async function rasterize(markup: string, w: number, h: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
  } finally {
    URL.revokeObjectURL(url);
  }
  const canvas = surface(w, h);
  canvas.getContext('2d')!.drawImage(image, 0, 0, w, h);
  return canvas;
}

/** Shift middle/end-anchored point text so its anchor sits where SVG put it. */
async function anchorText(layer: Extract<Layer, { kind: 'text' }>, anchor: 'middle' | 'end'): Promise<Layer> {
  await loadTextLayerFonts(layer).catch(() => false);
  const context = surface(1, 1).getContext('2d');
  if (!context) return layer;
  prepareTextContext(context, layer);
  const layout = measureTextLayerLayout(context, layer);
  const widest = Math.max(0, ...layout.lines.map((line) => line.x + line.width));
  const shift = anchor === 'middle' ? widest / 2 : widest;
  return { ...layer, matrix: multiplyMatrix(layer.matrix, [1, 0, 0, 1, -shift, 0]) };
}

/**
 * Build editable layers from prepared SVG markup. Raster pieces are added to
 * `assets`. Throws when the browser cannot render a raster piece.
 */
export async function svgImportLayers(markup: string, assets: Assets, maxLayers: number): Promise<SvgImportResult> {
  const plan = planSvgImport(markup, { maxLayers });
  const layers: Layer[] = [];
  for (const item of plan.items) {
    if (item.kind === 'layer') {
      layers.push(item.anchor && item.layer.kind === 'text' ? await anchorText(item.layer, item.anchor) : item.layer);
      continue;
    }
    const canvas = await rasterize(item.markup, plan.w, plan.h);
    layers.push({
      ...commonLayer(item.name),
      kind: 'raster',
      asset: addAsset(assets, canvas),
      opacity: item.opacity,
      ...(item.groupId ? { groupId: item.groupId } : {}),
    });
  }
  return { w: plan.w, h: plan.h, layers, groups: plan.groups, plan };
}

/** The status line after an SVG import. */
export function svgImportNotice(plan: SvgImportPlan, placed: boolean): string {
  const parts: string[] = [];
  if (plan.vectorLayers) parts.push(`${plan.vectorLayers} vector`);
  if (plan.textLayers) parts.push(`${plan.textLayers} text`);
  if (plan.rasterLayers) parts.push(`${plan.rasterLayers} pixel`);
  const total = plan.vectorLayers + plan.textLayers + plan.rasterLayers;
  const what = parts.length ? `${parts.join(', ')} layer${total === 1 ? '' : 's'}` : 'no visible content';
  const pixel = plan.rasterLayers
    ? '; gradients, effects and embedded images are kept as pixel layers'
    : '';
  return `SVG ${placed ? 'placed' : 'opened'} as ${what}${pixel}`;
}
