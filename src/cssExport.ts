import type { Layer, Matrix } from './document.ts';
import { serializePathData, validatePath, type PathModel } from './paths.ts';
import { shapePoints } from './vectorShapes.ts';

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const px = (value: number): string => `${Number(value.toFixed(3))}px`;

const matrix = (value: Matrix): string =>
  `matrix(${value.map((entry) => Number(entry.toFixed(6))).join(', ')})`;

const cssString = (value: string): string =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\A ')}"`;

const color = (value: unknown, fallback = '#000000'): string =>
  typeof value === 'string' && /^#[0-9a-f]{6,8}$/i.test(value) ? value.toLowerCase() : fallback;

type ExportableVector = Extract<Layer, { kind: 'rectangle' | 'ellipse' | 'line' | 'polygon' | 'path' }>;

const isExportableVector = (layer: Layer): layer is ExportableVector =>
  layer.kind === 'rectangle' || layer.kind === 'ellipse' || layer.kind === 'line' ||
  layer.kind === 'polygon' || layer.kind === 'path';

function pathForVector(layer: ExportableVector): PathModel | undefined {
  if (layer.kind === 'path') return validatePath(layer.path);
  const points = layer.kind === 'rectangle'
    ? [{ x: 0, y: 0 }, { x: layer.width, y: 0 }, { x: layer.width, y: layer.height }, { x: 0, y: layer.height }]
    : layer.kind === 'ellipse'
      ? Array.from({ length: 64 }, (_, index) => {
          const angle = index * Math.PI * 2 / 64;
          return { x: layer.width / 2 + Math.cos(angle) * layer.width / 2, y: layer.height / 2 + Math.sin(angle) * layer.height / 2 };
        })
      : layer.kind === 'polygon'
        ? shapePoints(layer.width, layer.height, layer.variant, layer.sides, layer.innerRadius)
        : [{ x: 0, y: 0 }, { x: layer.width, y: layer.height }];
  const nodes = points.map((point) => ({ x: point.x, y: point.y }));
  return validatePath({
    nodes,
    closed: layer.kind !== 'line',
    fill: layer.kind !== 'line' && layer.fill,
    stroke: true,
    strokeWidth: layer.stroke,
    fillColor: color(layer.color),
    strokeColor: color(layer.color),
  });
}

function vectorRule(layer: ExportableVector): string {
  const path = pathForVector(layer);
  if (!path) return '';
  const d = serializePathData(path).replace(/'/g, "\\'");
  const fill = path.fill ? color(path.fillColor) : 'transparent';
  const stroke = path.stroke ? `${px(path.strokeWidth)} solid ${color(path.strokeColor)}` : 'none';
  const clip = path.fill ? `\n  clip-path: path('${d}');` : '';
  return `  width: ${px('width' in layer && finite(layer.width) ? layer.width : 1)};\n  height: ${px('height' in layer && finite(layer.height) ? layer.height : 1)};\n  background: ${fill};\n  border: ${stroke};${clip}`;
}

/**
 * Serialize an editable layer as a deterministic, standalone CSS rule.
 *
 * This is intentionally a CSS handoff format rather than a Photoshop or
 * browser-document exporter. Raster, smart-object and adjustment layers are
 * rejected because their source pixels cannot be represented faithfully as
 * CSS without silently flattening or uploading local assets.
 */
export function layerToCss(layer: Layer, canvasWidth: number, canvasHeight: number): string {
  if (!finite(canvasWidth) || !finite(canvasHeight) || canvasWidth < 1 || canvasHeight < 1)
    throw new Error('CSS canvas dimensions are invalid');
  if (!layer || (layer.kind !== 'text' && !isExportableVector(layer)))
    throw new Error('CSS export supports editable text and vector layers only');

  const declarations = [
    'position: absolute;',
    'box-sizing: border-box;',
    `transform: ${matrix(layer.matrix)};`,
    'transform-origin: 0 0;',
    `opacity: ${(Math.max(0, Math.min(100, layer.opacity)) / 100).toFixed(3)};`,
  ];
  if (layer.kind === 'text') {
    if (!finite(layer.fontSize) || !finite(layer.boxWidth) || !finite(layer.lineHeight) || !finite(layer.letterSpacing))
      throw new Error('CSS text metrics are invalid');
    declarations.push(
      `width: ${px(layer.boxWidth)};`,
      `color: ${color(layer.color)};`,
      `font-family: ${cssString(layer.fontFamily)};`,
      `font-size: ${px(layer.fontSize)};`,
      `font-weight: ${layer.bold ? 700 : 400};`,
      `line-height: ${layer.lineHeight.toFixed(3)};`,
      `letter-spacing: ${px(layer.letterSpacing)};`,
      `text-align: ${layer.textAlign};`,
      `writing-mode: ${layer.orientation === 'vertical' ? 'vertical-rl' : 'horizontal-tb'};`,
      `--pixelforge-text: ${cssString(layer.text)};`,
    );
  } else {
    declarations.push(vectorRule(layer));
  }
  const body = declarations.flatMap((entry) => entry.split('\n')).map((entry) => `  ${entry.trim()}`).join('\n');
  return `.pixelforge-layer-${layer.id} {\n${body}\n}`;
}

/** Build a CSS export without accepting a mutable layer reference. */
export function cloneLayerCss(layer: Layer, canvasWidth: number, canvasHeight: number): string {
  return layerToCss(structuredClone(layer), canvasWidth, canvasHeight);
}

