/**
 * Shared Fill / Stroke / Stroke width / W×H options for the U-family shape
 * tools (Rectangle, Rounded Rectangle, Ellipse, Line, Polygon, Custom Shape).
 *
 * Default: filled with the foreground colour, no stroke. Parametric
 * rectangle/ellipse/polygon layers keep their legacy encoding (`fill` +
 * `color` + `stroke` width) and gain an optional `strokeColor`: when present
 * an outline is drawn in it in addition to any fill; when absent an unfilled
 * shape is outlined in `color` exactly as older drafts were. See
 * docs/shape-tools-contract.md.
 */

import type { PathModel } from './paths.ts';

export type ShapePaintSource = 'foreground' | 'background' | 'custom' | 'none';
export type ShapeAppearanceSettings = {
  fill: ShapePaintSource;
  fillColor: string;
  stroke: ShapePaintSource;
  strokeColor: string;
  /** Outline width in px (1–100); also the Line tool's thickness. */
  strokeWidth: number;
  /** Numeric "Create W×H" size in px (1–16,000). */
  createWidth: number;
  createHeight: number;
};

export const SHAPE_STROKE_WIDTH_MIN = 1;
export const SHAPE_STROKE_WIDTH_MAX = 100;
export const SHAPE_CREATE_MIN = 1;
export const SHAPE_CREATE_MAX = 16000;

export const DEFAULT_SHAPE_APPEARANCE: Readonly<ShapeAppearanceSettings> = Object.freeze({
  fill: 'foreground',
  fillColor: '#000000',
  stroke: 'none',
  strokeColor: '#000000',
  strokeWidth: 4,
  createWidth: 200,
  createHeight: 200,
});

const SOURCES: readonly ShapePaintSource[] = ['foreground', 'background', 'custom', 'none'];
const KEYS = Object.keys(DEFAULT_SHAPE_APPEARANCE);
const hex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const source = (value: unknown): value is ShapePaintSource =>
  typeof value === 'string' && (SOURCES as readonly string[]).includes(value);
const bounded = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** Strict draft validation: absent keys are fine, malformed values are not. */
export function validShapeAppearance(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const c = value as Record<string, unknown>;
  if (Object.keys(c).some((key) => !KEYS.includes(key))) return false;
  return (c.fill === undefined || source(c.fill))
    && (c.stroke === undefined || source(c.stroke))
    && (c.fillColor === undefined || hex(c.fillColor))
    && (c.strokeColor === undefined || hex(c.strokeColor))
    && (c.strokeWidth === undefined || bounded(c.strokeWidth, SHAPE_STROKE_WIDTH_MIN, SHAPE_STROKE_WIDTH_MAX))
    && (c.createWidth === undefined || bounded(c.createWidth, SHAPE_CREATE_MIN, SHAPE_CREATE_MAX))
    && (c.createHeight === undefined || bounded(c.createHeight, SHAPE_CREATE_MIN, SHAPE_CREATE_MAX));
}

/** Fill missing or malformed keys with the documented defaults. */
export function normalizeShapeAppearance(value: unknown): ShapeAppearanceSettings {
  const c = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const d = DEFAULT_SHAPE_APPEARANCE;
  const size = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : fallback;
  return {
    fill: source(c.fill) ? c.fill : d.fill,
    fillColor: hex(c.fillColor) ? c.fillColor.toLowerCase() : d.fillColor,
    stroke: source(c.stroke) ? c.stroke : d.stroke,
    strokeColor: hex(c.strokeColor) ? c.strokeColor.toLowerCase() : d.strokeColor,
    strokeWidth: size(c.strokeWidth, d.strokeWidth, SHAPE_STROKE_WIDTH_MIN, SHAPE_STROKE_WIDTH_MAX),
    createWidth: size(c.createWidth, d.createWidth, SHAPE_CREATE_MIN, SHAPE_CREATE_MAX),
    createHeight: size(c.createHeight, d.createHeight, SHAPE_CREATE_MIN, SHAPE_CREATE_MAX),
  };
}

/** Resolve a paint source against the current swatches; `null` means none. */
export function resolveShapePaint(
  paint: ShapePaintSource,
  custom: string,
  foreground: string,
  background: string,
): string | null {
  if (paint === 'none') return null;
  const value = paint === 'foreground' ? foreground : paint === 'background' ? background : custom;
  return hex(value) ? value.toLowerCase() : null;
}

export type ParametricShapeAppearance = {
  color: string;
  fill: boolean;
  stroke: number;
  strokeColor?: string;
};

/**
 * Encode the options for a parametric rectangle/ellipse/polygon layer, or
 * `null` when both fill and stroke are None (nothing would be visible).
 * A stroke-only shape uses the legacy outline encoding (no `strokeColor`).
 */
export function parametricShapeAppearance(
  settings: ShapeAppearanceSettings,
  foreground: string,
  background: string,
): ParametricShapeAppearance | null {
  const fill = resolveShapePaint(settings.fill, settings.fillColor, foreground, background);
  const stroke = resolveShapePaint(settings.stroke, settings.strokeColor, foreground, background);
  const width = Math.max(SHAPE_STROKE_WIDTH_MIN, Math.min(SHAPE_STROKE_WIDTH_MAX, settings.strokeWidth));
  if (fill && stroke) return { color: fill, fill: true, stroke: width, strokeColor: stroke };
  if (fill) return { color: fill, fill: true, stroke: width };
  if (stroke) return { color: stroke, fill: false, stroke: width };
  return null;
}

/** The Line tool has no interior: it uses the stroke colour, or the foreground when Stroke is None. */
export function lineShapeAppearance(
  settings: ShapeAppearanceSettings,
  foreground: string,
  background: string,
): { color: string; stroke: number } {
  const color = resolveShapePaint(settings.stroke, settings.strokeColor, foreground, background) ?? foreground;
  return { color, stroke: Math.max(SHAPE_STROKE_WIDTH_MIN, Math.min(SHAPE_STROKE_WIDTH_MAX, settings.strokeWidth)) };
}

/** Path-layer appearance for a Custom Shape, or `null` when nothing would show. */
export function pathShapeAppearance(
  settings: ShapeAppearanceSettings,
  foreground: string,
  background: string,
): Pick<PathModel, 'fill' | 'stroke' | 'strokeWidth' | 'fillColor' | 'strokeColor'> | null {
  const fill = resolveShapePaint(settings.fill, settings.fillColor, foreground, background);
  const stroke = resolveShapePaint(settings.stroke, settings.strokeColor, foreground, background);
  if (!fill && !stroke) return null;
  return {
    fill: Boolean(fill),
    stroke: Boolean(stroke),
    strokeWidth: Math.max(SHAPE_STROKE_WIDTH_MIN, Math.min(SHAPE_STROKE_WIDTH_MAX, settings.strokeWidth)),
    fillColor: fill ?? stroke!,
    strokeColor: stroke ?? fill!,
  };
}

type ParametricLike = { fill: boolean; color: string; stroke: number; strokeColor?: string };

/** Outline colour a parametric shape draws, or `undefined` for none. */
export function shapeOutlineColor(layer: ParametricLike): string | undefined {
  if (typeof layer.strokeColor === 'string') return layer.strokeColor;
  return layer.fill ? undefined : layer.color;
}

/** Path-model style equivalent of a parametric shape, for SVG/CSS/booleans. */
export function parametricShapePathStyle(
  layer: ParametricLike,
): Pick<PathModel, 'fill' | 'stroke' | 'strokeWidth' | 'fillColor' | 'strokeColor'> {
  const outline = shapeOutlineColor(layer);
  return {
    fill: layer.fill,
    stroke: Boolean(outline) || !layer.fill,
    strokeWidth: layer.stroke,
    fillColor: layer.color,
    strokeColor: outline ?? layer.color,
  };
}

export type ShapeToolId = 'rectangle' | 'rounded-rectangle' | 'ellipse' | 'line' | 'polygon' | 'custom-shape';
export const SHAPE_TOOL_IDS: readonly ShapeToolId[] = ['rectangle', 'rounded-rectangle', 'ellipse', 'line', 'polygon', 'custom-shape'];
export const isShapeToolId = (value: unknown): value is ShapeToolId =>
  typeof value === 'string' && (SHAPE_TOOL_IDS as readonly string[]).includes(value);

const SHAPE_NAMES: Readonly<Record<Exclude<ShapeToolId, 'custom-shape'>, string>> = Object.freeze({
  rectangle: 'Rectangle',
  'rounded-rectangle': 'Rounded Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  polygon: 'Polygon',
});

/** "Rectangle 3", "Ellipse 4"…; Custom Shape layers are named after the shape. */
export function shapeLayerName(tool: ShapeToolId, index: number, customLabel = 'Custom Shape'): string {
  return `${tool === 'custom-shape' ? customLabel : SHAPE_NAMES[tool]} ${index}`;
}

/** A W×H box centred on the document, clamped to the shape size bounds. */
export function centeredShapeBox(
  documentWidth: number,
  documentHeight: number,
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } {
  const clamp = (value: number) =>
    Number.isFinite(value) ? Math.max(SHAPE_CREATE_MIN, Math.min(SHAPE_CREATE_MAX, Math.round(value))) : SHAPE_CREATE_MIN;
  const w = clamp(width), h = clamp(height);
  return { left: Math.round((documentWidth - w) / 2), top: Math.round((documentHeight - h) / 2), width: w, height: h };
}
