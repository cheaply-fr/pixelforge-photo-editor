/**
 * Layered SVG export.
 *
 * Shapes and paths are written as SVG vector elements, text as SVG text, and
 * layer groups as <g>. Pixel layers, and any layer whose look depends on
 * effects SVG cannot express (masks, layer styles, filters, adjustments),
 * are embedded as cropped PNG images in their place in the stack. Layers
 * that change the pixels below them (adjustment layers, clipping masks,
 * blend modes SVG has no equivalent for) cannot stay live in SVG, so
 * everything up to the topmost such layer is flattened into one base image.
 *
 * The planning and markup helpers are pure; `encodeSvgDocument` needs a
 * browser canvas to render pixel layers and to lay out text.
 */
import { artboardLayers } from './artboards.ts';
import { resolveArtboard } from './artboardRender.ts';
import {
  measureTextLayerLayout,
  neutral,
  prepareTextContext,
  renderFrame,
  surface,
  type Assets,
  type Frame,
  type Group,
  type Layer,
  type Matrix,
} from './document.ts';
import { isNeutralLayerStyles } from './layerStyles.ts';
import { pathContours, serializePathData, type PathModel } from './paths.ts';
import { baselineOffset, fontCss, renderedFontSize, type CharacterStyle } from './richText.ts';
import { shapeOutlineColor } from './shapeAppearance.ts';
import { clampCornerRadius, roundedRectNodes, shapePoints } from './vectorShapes.ts';

export const SVG_EXPORT_MIME = 'image/svg+xml';

/** Canvas blend modes SVG/CSS `mix-blend-mode` renders the same way. */
const CSS_BLENDS: Record<string, string> = {
  'source-over': 'normal', darken: 'darken', multiply: 'multiply', 'color-burn': 'color-burn',
  lighten: 'lighten', screen: 'screen', 'color-dodge': 'color-dodge', overlay: 'overlay',
  'soft-light': 'soft-light', 'hard-light': 'hard-light', difference: 'difference',
  exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity',
};

/** How one layer is written: live vector, live text, embedded image, or flattened. */
export type SvgLayerMode = 'vector' | 'text' | 'image' | 'flatten' | 'hidden';

const VECTOR_KINDS = new Set(['rectangle', 'ellipse', 'line', 'polygon', 'path']);
const CLEANUP_KEYS = ['smartFilters', 'spotHealing', 'patchStrokes', 'contentAwareFills', 'contentAwareMoves', 'contentAwareScales', 'matting'] as const;

function neutralAdjustments(layer: Layer): boolean {
  const adjustments = layer.adjustments as unknown as Record<string, unknown>;
  return Object.entries(neutral).every(([key, value]) => JSON.stringify(adjustments[key] ?? value) === JSON.stringify(value));
}

/** True when nothing but the layer's own geometry decides its pixels. */
function plainLayer(layer: Layer): boolean {
  if (!neutralAdjustments(layer)) return false;
  if (!isNeutralLayerStyles(layer.styles)) return false;
  if (layer.mask && layer.maskEnabled !== false) return false;
  if (layer.vectorMask?.enabled) return false;
  const record = layer as unknown as Record<string, unknown>;
  for (const key of CLEANUP_KEYS) {
    const value = record[key];
    if (Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null) return false;
  }
  return true;
}

/** Decide how each layer is written. Pure. */
export function svgLayerMode(layer: Layer, groups: readonly Group[] = []): SvgLayerMode {
  const group = layer.groupId ? groups.find((item) => item.id === layer.groupId) : undefined;
  if (!layer.visible || (group && !group.visible)) return 'hidden';
  if (layer.kind === 'adjustment' || layer.clippingTo) return 'flatten';
  if (!CSS_BLENDS[layer.blend]) return 'flatten';
  if (group && group.blend !== 'source-over') return 'flatten';
  if (!plainLayer(layer)) return 'image';
  if (VECTOR_KINDS.has(layer.kind)) return 'vector';
  if (layer.kind === 'text') {
    const warp = layer.warp?.style ?? 'none';
    const rtl = layer.languageOptions && JSON.stringify(layer.languageOptions).includes('rtl');
    return warp === 'none' && !layer.textPath && (layer.orientation ?? 'horizontal') === 'horizontal' && !rtl ? 'text' : 'image';
  }
  return 'image';
}

export type SvgExportPlan = { modes: SvgLayerMode[]; flattenThrough: number };

/** Modes for every layer, plus the index of the last layer to flatten (-1: none). */
export function planSvgExport(frame: Pick<Frame, 'layers' | 'groups'>): SvgExportPlan {
  const modes = frame.layers.map((layer) => svgLayerMode(layer, frame.groups ?? []));
  return { modes, flattenThrough: modes.lastIndexOf('flatten') };
}

// ------------------------------------------------------------------ markup

const num = (value: number) => Number(value.toFixed(4)).toString();
/** Escape text and double-quoted attribute values. */
export const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = (name: string, value: string | number | undefined) =>
  value === undefined ? '' : ` ${name}="${typeof value === 'number' ? num(value) : escapeXml(value)}"`;
const isIdentity = (m: Matrix) => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;

/** Paint attributes for a #rrggbb or #rrggbbaa color. */
function paint(name: 'fill' | 'stroke', color: string | undefined): string {
  if (!color) return attr(name, 'none');
  const hex = color.slice(0, 7);
  const alpha = color.length === 9 ? parseInt(color.slice(7), 16) / 255 : 1;
  return attr(name, hex) + (alpha < 1 ? attr(`${name}-opacity`, alpha) : '');
}

/** Attributes every layer element carries: name, placement, opacity, blend. */
export function layerAttributes(layer: Layer, options: { opacity?: boolean } = {}): string {
  const blend = CSS_BLENDS[layer.blend];
  return (
    attr('data-name', layer.name) +
    (isIdentity(layer.matrix) ? '' : attr('transform', `matrix(${layer.matrix.map(num).join(' ')})`)) +
    (options.opacity !== false && layer.opacity < 1 ? attr('opacity', layer.opacity) : '') +
    (blend && blend !== 'normal' ? attr('style', `mix-blend-mode:${blend}`) : '')
  );
}

function pathElement(path: PathModel, extra: string): string {
  const closed = pathContours(path).some((contour) => contour.closed);
  return (
    `<path${extra}${attr('d', serializePathData(path))}` +
    paint('fill', path.fill && closed ? path.fillColor : undefined) +
    (path.fill && closed && path.fillRule === 'evenodd' ? attr('fill-rule', 'evenodd') : '') +
    (path.stroke
      ? paint('stroke', path.strokeColor) + attr('stroke-width', path.strokeWidth) +
        attr('stroke-linejoin', path.lineJoin ?? 'round') + attr('stroke-linecap', path.lineCap ?? 'round')
      : '') +
    '/>'
  );
}

/** One live SVG element for a vector layer, matching the canvas renderer. Pure. */
export function vectorLayerSvg(layer: Layer): string {
  const base = layerAttributes(layer);
  // Canvas strokes default to a miter limit of 10.
  const miter = attr('stroke-miterlimit', 10);
  switch (layer.kind) {
    case 'rectangle': {
      // Right-angle corners look the same at any miter limit.
      const outline = shapeOutlineColor(layer);
      const stroke = outline ? paint('stroke', outline) + attr('stroke-width', layer.stroke) : '';
      if (clampCornerRadius(layer.cornerRadius, layer.width, layer.height) > 0) {
        const nodes = roundedRectNodes(layer.width, layer.height, layer.cornerRadius);
        const d = serializePathData({ nodes, closed: true, fill: true, stroke: false, strokeWidth: 0, fillColor: '#000000', strokeColor: '#000000' });
        return `<path${base}${attr('d', d)}${paint('fill', layer.fill ? layer.color : undefined)}${stroke}/>`;
      }
      return `<rect${base}${attr('width', layer.width)}${attr('height', layer.height)}${paint('fill', layer.fill ? layer.color : undefined)}${stroke}/>`;
    }
    case 'ellipse': {
      const outline = shapeOutlineColor(layer);
      return `<ellipse${base}${attr('cx', layer.width / 2)}${attr('cy', layer.height / 2)}${attr('rx', layer.width / 2)}${attr('ry', layer.height / 2)}${paint('fill', layer.fill ? layer.color : undefined)}${outline ? paint('stroke', outline) + attr('stroke-width', layer.stroke) : ''}/>`;
    }
    case 'line':
      return `<line${base}${attr('x1', 0)}${attr('y1', 0)}${attr('x2', layer.width)}${attr('y2', layer.height)}${paint('stroke', layer.color)}${attr('stroke-width', layer.stroke)}${attr('stroke-linecap', 'round')}/>`;
    case 'polygon': {
      const outline = shapeOutlineColor(layer);
      const points = shapePoints(
        Math.max(1, layer.width - layer.stroke),
        Math.max(1, layer.height - layer.stroke),
        layer.variant,
        layer.sides,
        layer.innerRadius,
      ).map((point) => `${num(point.x + layer.stroke / 2)},${num(point.y + layer.stroke / 2)}`);
      return `<polygon${base}${attr('points', points.join(' '))}${paint('fill', layer.fill ? layer.color : undefined)}${outline ? paint('stroke', outline) + attr('stroke-width', layer.stroke) + miter : ''}/>`;
    }
    case 'path':
      return pathElement(layer.path, base);
    default:
      throw new Error(`${layer.kind} layers are not vector layers`);
  }
}

/** One positioned piece of text, with its baseline already resolved. */
export type SvgTextRun = {
  x: number;
  y: number;
  text: string;
  family: string;
  size: number;
  weight: number;
  italic: boolean;
  color: string;
  anchor?: 'start' | 'middle' | 'end';
};
export type SvgTextDecoration = { x: number; y: number; w: number; h: number; color: string };

const familyList = (family: string) => `'${family.replace(/'/g, '')}', sans-serif`;

/** Live SVG text for a text layer's laid-out runs. Pure. */
export function textLayerSvg(layer: Layer, runs: readonly SvgTextRun[], decorations: readonly SvgTextDecoration[] = []): string {
  if (!runs.length && !decorations.length) return '';
  const first = runs[0];
  const sameStyle = (run: SvgTextRun) =>
    run.family === first.family && run.size === first.size && run.weight === first.weight && run.italic === first.italic && run.color === first.color;
  const uniform = runs.every(sameStyle);
  const style = (run: SvgTextRun) =>
    attr('font-family', familyList(run.family)) + attr('font-size', run.size) +
    (run.weight !== 400 ? attr('font-weight', Math.round(run.weight)) : '') +
    (run.italic ? attr('font-style', 'italic') : '') + paint('fill', run.color);
  const anchor = uniform && first.anchor && first.anchor !== 'start' ? attr('text-anchor', first.anchor) : '';
  const tspans = runs
    .map((run) => `<tspan${attr('x', run.x)}${attr('y', run.y)}${uniform ? '' : style(run)}${!uniform && run.anchor && run.anchor !== 'start' ? attr('text-anchor', run.anchor) : ''}>${escapeXml(run.text)}</tspan>`)
    .join('');
  const text = runs.length
    ? `<text${decorations.length ? '' : layerAttributes(layer)}${attr('x', first.x)}${attr('y', first.y)}${uniform ? style(first) : ''}${anchor} xml:space="preserve">${tspans}</text>`
    : '';
  if (!decorations.length) return text;
  const bars = decorations.map((bar) => `<rect${attr('x', bar.x)}${attr('y', bar.y)}${attr('width', bar.w)}${attr('height', bar.h)}${paint('fill', bar.color)}/>`).join('');
  return `<g${layerAttributes(layer)}>${text}${bars}</g>`;
}

export type SvgImagePart = { x: number; y: number; w: number; h: number; href: string };

/** An embedded image element for a pixel layer (its opacity is already in the pixels). Pure. */
export function imageLayerSvg(layer: Layer | undefined, image: SvgImagePart, name?: string): string {
  const base = layer
    ? attr('data-name', layer.name) + (CSS_BLENDS[layer.blend] && CSS_BLENDS[layer.blend] !== 'normal' ? attr('style', `mix-blend-mode:${CSS_BLENDS[layer.blend]}`) : '')
    : attr('data-name', name ?? 'Flattened layers');
  return `<image${base}${attr('x', image.x)}${attr('y', image.y)}${attr('width', image.w)}${attr('height', image.h)} preserveAspectRatio="none" xlink:href="${image.href}"/>`;
}

/** Wrap consecutive layer elements of the same group in <g>. Pure. */
export function groupedBody(entries: ReadonlyArray<{ groupId?: string; markup: string }>, groups: readonly Group[]): string {
  let body = '';
  let open: string | undefined;
  for (const entry of entries) {
    if (!entry.markup) continue;
    if (entry.groupId !== open) {
      if (open !== undefined) body += '</g>';
      open = entry.groupId;
      if (open !== undefined) {
        const group = groups.find((item) => item.id === open);
        body += `<g${attr('data-name', group?.name ?? 'Group')}${group && group.opacity < 1 ? attr('opacity', group.opacity) : ''}>`;
      }
    }
    body += entry.markup;
  }
  if (open !== undefined) body += '</g>';
  return body;
}

/** The complete SVG document. Pure. */
export function svgDocumentMarkup(options: { w: number; h: number; viewBox: [number, number, number, number]; title: string; body: string; background?: string }): string {
  const [x, y, w, h] = options.viewBox;
  const background = options.background
    ? `<rect${attr('x', x)}${attr('y', y)}${attr('width', w)}${attr('height', h)}${attr('fill', options.background)}/>`
    : '';
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1"` +
    `${attr('width', options.w)}${attr('height', options.h)} viewBox="${[x, y, w, h].map(num).join(' ')}">` +
    `<title>${escapeXml(options.title)}</title>${background}${options.body}</svg>\n`
  );
}

// ------------------------------------------------------------------ browser

/** Crop a canvas to its visible pixels; undefined when fully transparent. */
function croppedImage(canvas: HTMLCanvasElement): SvgImagePart | undefined {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('SVG export is unavailable in this browser.');
  const { width, height } = canvas;
  const data = context.getImageData(0, 0, width, height).data;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3] === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return undefined;
  const w = right - left + 1, h = bottom - top + 1;
  const out = surface(w, h);
  out.getContext('2d')!.drawImage(canvas, left, top, w, h, 0, 0, w, h);
  return { x: left, y: top, w, h, href: out.toDataURL('image/png') };
}

/** Distance from the canvas "top" text line to the alphabetic baseline. */
function baselineDrop(context: CanvasRenderingContext2D, style: CharacterStyle): number {
  const size = renderedFontSize(style);
  context.font = fontCss(style);
  context.textBaseline = 'top';
  const metrics = context.measureText('Hg') as TextMetrics & { alphabeticBaseline?: number };
  const value = Math.abs(metrics.alphabeticBaseline ?? NaN);
  if (Number.isFinite(value) && value > 0 && value < size * 2) return value;
  context.textBaseline = 'alphabetic';
  const ascent = context.measureText('Hg').fontBoundingBoxAscent;
  context.textBaseline = 'top';
  return Number.isFinite(ascent) && ascent > 0 ? ascent : size * 0.8;
}

/** Lay out a text layer like the canvas renderer and return SVG runs, or undefined to embed it as an image. */
export function textLayerRuns(layer: Extract<Layer, { kind: 'text' }>): { runs: SvgTextRun[]; decorations: SvgTextDecoration[] } | undefined {
  const context = surface(1, 1).getContext('2d');
  if (!context) return undefined;
  prepareTextContext(context, layer);
  const layout = measureTextLayerLayout(context, layer);
  if (layout.vertical) return undefined;
  const runs: SvgTextRun[] = [];
  const decorations: SvgTextDecoration[] = [];
  const runFor = (style: CharacterStyle, x: number, top: number, text: string): SvgTextRun => ({
    x,
    y: top + baselineDrop(context, style),
    text,
    family: style.fontFamily,
    size: renderedFontSize(style),
    weight: style.fontWeight,
    italic: style.italic,
    color: style.color,
  });
  const lineAnchors: Array<{ start: number; end: number; uniform: boolean }> = [];
  for (const line of layout.lines) {
    if (layout.boxHeight !== undefined && line.y + line.height > layout.boxHeight + 0.5 && line.end > line.start) break;
    if (line.marker) {
      const size = renderedFontSize(line.marker.style);
      runs.push(runFor(line.marker.style, line.marker.x, line.y + (line.size - size) * 0.8, line.marker.text));
    }
    const lineStart = runs.length;
    for (const segment of line.segments) {
      const style = segment.style;
      const size = renderedFontSize(style);
      const top = line.y + (line.size - size) * 0.8 + baselineOffset(style);
      if (style.scaleX !== 100 || style.scaleY !== 100 || style.caps === 'small-caps') return undefined;
      if (segment.perGlyph) for (const glyph of segment.glyphs) runs.push(runFor(style, glyph.x, top, glyph.text));
      else runs.push(runFor(style, segment.x, top, segment.text));
      const thickness = Math.max(1, size / 15);
      if (style.underline) decorations.push({ x: segment.x, y: top + size * 0.92, w: segment.width, h: thickness, color: style.color });
      if (style.strikethrough) decorations.push({ x: segment.x, y: top + size * 0.52, w: segment.width, h: thickness, color: style.color });
    }
    lineAnchors.push({ start: lineStart, end: runs.length, uniform: line.segments.length === 1 && !line.segments[0].perGlyph && !line.marker });
  }
  // Single-run lines that share an alignment edge are written with
  // text-anchor so the text stays aligned when edited in other apps.
  const align = layer.textAlign ?? 'left';
  if (align !== 'left' && lineAnchors.length && lineAnchors.every((item) => item.uniform && item.end - item.start === 1)) {
    const widths = layout.lines.slice(0, lineAnchors.length).map((line) => line.segments[0]?.width ?? 0);
    const edges = lineAnchors.map((item, index) => runs[item.start].x + (align === 'center' ? widths[index] / 2 : widths[index]));
    if (edges.every((edge) => Math.abs(edge - edges[0]) < 0.5))
      lineAnchors.forEach((item, index) => {
        runs[item.start].x = edges[index];
        runs[item.start].anchor = align === 'center' ? 'middle' : 'end';
      });
  }
  return { runs: runs.filter((run) => run.text.length > 0), decorations };
}

export type SvgEncodeOptions = { artboardId?: string; title?: string };

/** Render the document as a layered SVG file. Browser only. */
export async function encodeSvgDocument(frame: Frame, assets: Assets, options: SvgEncodeOptions = {}): Promise<Blob> {
  const artboard = resolveArtboard(frame, options.artboardId);
  const membership = artboard.layerIds === undefined ? { layers: frame.layers, groups: frame.groups ?? [] } : artboardLayers(frame, artboard);
  const source: Frame = { ...frame, layers: membership.layers, groups: membership.groups };
  const groups = source.groups ?? [];
  const plan = planSvgExport(source);
  const entries: Array<{ groupId?: string; markup: string }> = [];
  const renderAlone = (layer: Layer) =>
    renderFrame({ ...source, layers: [{ ...layer, groupId: undefined, blend: 'source-over' } as Layer], groups: [], active: layer.id, selectedLayerIds: [layer.id] }, assets);
  if (plan.flattenThrough >= 0) {
    // Everything up to the last layer that edits pixels below it, as one image.
    const below = source.layers.slice(0, plan.flattenThrough + 1);
    const canvas = await renderFrame({ ...source, layers: below, active: below[below.length - 1].id, selectedLayerIds: [] }, assets);
    const image = croppedImage(canvas);
    if (image) entries.push({ markup: imageLayerSvg(undefined, image) });
  }
  for (let index = plan.flattenThrough + 1; index < source.layers.length; index++) {
    const layer = source.layers[index];
    let mode = plan.modes[index];
    if (mode === 'hidden') continue;
    let markup = '';
    if (mode === 'vector') markup = vectorLayerSvg(layer);
    else if (mode === 'text' && layer.kind === 'text') {
      const laid = textLayerRuns(layer);
      if (laid) markup = textLayerSvg(layer, laid.runs, laid.decorations);
      else mode = 'image';
    }
    if (mode === 'image') {
      const image = croppedImage(await renderAlone(layer));
      if (image) markup = imageLayerSvg(layer, image);
    }
    entries.push({ groupId: layer.groupId, markup });
  }
  const markup = svgDocumentMarkup({
    w: artboard.w,
    h: artboard.h,
    viewBox: [artboard.x, artboard.y, artboard.w, artboard.h],
    title: options.title || 'PixelForge export',
    body: groupedBody(entries, groups),
    background: artboard.background,
  });
  return new Blob([markup], { type: SVG_EXPORT_MIME });
}
