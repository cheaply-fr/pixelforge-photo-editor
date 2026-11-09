/**
 * Pen-family tool options (Pen, Freeform Pen, Curvature Pen) and the per-tool
 * option sets shown for the pen and path-editing tools.
 *
 * These are bounded local approximations of Photoshop's Pen options: Shape
 * mode keeps PixelForge's filled path layers, Path mode creates an unfilled
 * hairline "work path" layer, Auto Add/Delete edits the active path on click
 * and Rubber Band previews the next segment. See docs/path-tool-contract.md.
 */

import { hitTestPathNode, type PathModel, type PathNode } from './paths.ts';
import type { PathAnchorEditMode } from './pathEditTools.ts';

export type PenMode = 'shape' | 'path';
export type PenOptions = {
  /** Shape: closed paths are filled layers. Path: unfilled hairline work paths. */
  mode: PenMode;
  /** Pen click on the active path: a segment adds an anchor, an anchor deletes it. */
  autoAddDelete: boolean;
  /** Preview the next segment from the last anchor to the pointer. */
  rubberBand: boolean;
};

export const DEFAULT_PEN_OPTIONS: Readonly<PenOptions> = Object.freeze({
  mode: 'shape',
  autoAddDelete: true,
  rubberBand: false,
});

/** Stroke width of a Path-mode work path; thin enough to read as an outline. */
export const WORK_PATH_STROKE_WIDTH = 1;

const PEN_OPTION_KEYS = ['mode', 'autoAddDelete', 'rubberBand'] as const;

/** Strict check used by draft validation: absent keys are fine, wrong types are not. */
export function validPenOptions(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).some((key) => !(PEN_OPTION_KEYS as readonly string[]).includes(key))) return false;
  if (candidate.mode !== undefined && candidate.mode !== 'shape' && candidate.mode !== 'path') return false;
  if (candidate.autoAddDelete !== undefined && typeof candidate.autoAddDelete !== 'boolean') return false;
  if (candidate.rubberBand !== undefined && typeof candidate.rubberBand !== 'boolean') return false;
  return true;
}

/** Fill missing or malformed keys with defaults (older drafts omit the object). */
export function normalizePenOptions(value: unknown): PenOptions {
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  return {
    mode: candidate.mode === 'path' ? 'path' : 'shape',
    autoAddDelete: typeof candidate.autoAddDelete === 'boolean' ? candidate.autoAddDelete : DEFAULT_PEN_OPTIONS.autoAddDelete,
    rubberBand: typeof candidate.rubberBand === 'boolean' ? candidate.rubberBand : DEFAULT_PEN_OPTIONS.rubberBand,
  };
}

/**
 * Appearance of a new pen-family path. Shape mode fills closed paths in the
 * foreground colour with a `strokeWidth` outline (open paths are stroked);
 * Path mode never fills and draws a hairline so the work path stays visible
 * and selectable without painting a shape.
 */
export function penPathStyle(
  mode: PenMode,
  closed: boolean,
  strokeWidth: number,
  color: string,
): Pick<PathModel, 'fill' | 'stroke' | 'strokeWidth' | 'fillColor' | 'strokeColor'> {
  const width = Number.isFinite(strokeWidth) ? Math.max(1, Math.min(100, strokeWidth)) : 1;
  return mode === 'path'
    ? { fill: false, stroke: true, strokeWidth: WORK_PATH_STROKE_WIDTH, fillColor: color, strokeColor: color }
    : { fill: closed, stroke: true, strokeWidth: width, fillColor: color, strokeColor: color };
}

export type PenFamilyTool = 'pen' | 'freeform-pen' | 'curvature-pen';

/** Layer name for a new pen-family path. Path mode names it a work path. */
export function penLayerName(tool: PenFamilyTool, mode: PenMode, index: number): string {
  if (mode === 'path') return `Work Path ${index}`;
  return `${tool === 'freeform-pen' ? 'Freeform Path' : tool === 'curvature-pen' ? 'Curvature Path' : 'Path'} ${index}`;
}

/** Status-bar text after a pen-family path is committed. */
export function penLayerNotice(tool: PenFamilyTool, mode: PenMode): string {
  if (mode === 'path') return 'Work path added (no fill)';
  return tool === 'freeform-pen'
    ? 'Editable freeform path layer added'
    : tool === 'curvature-pen'
      ? 'Editable curvature path layer added'
      : 'Editable path layer added';
}

/**
 * Which anchor edit a Pen press over the active path performs. Alt deletes and
 * Shift converts, whatever Auto Add/Delete says. Without modifiers and with
 * Auto Add/Delete on, a press on an anchor deletes it and anywhere else tries
 * to add one on a segment; with it off, an unmodified press never edits
 * (`null`), so it always starts a new path.
 */
export function penAutoEditMode(
  path: PathModel,
  point: PathNode,
  radius: number,
  modifiers: { altKey?: boolean; shiftKey?: boolean },
  autoAddDelete: boolean,
): PathAnchorEditMode | null {
  if (modifiers.altKey) return 'delete';
  if (modifiers.shiftKey) return 'convert';
  if (!autoAddDelete) return null;
  return hitTestPathNode(path, point, radius) !== null ? 'delete' : 'add';
}

/** Rubber Band preview: the placed anchors plus a provisional pointer anchor. */
export function rubberBandNodes(points: readonly PathNode[], pointer: PathNode | undefined): PathNode[] {
  const copy = points.map((node) => ({
    x: node.x,
    y: node.y,
    ...(node.inHandle ? { inHandle: { ...node.inHandle } } : {}),
    ...(node.outHandle ? { outHandle: { ...node.outHandle } } : {}),
  }));
  if (!pointer || !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y) || !copy.length) return copy;
  const last = copy[copy.length - 1];
  if (Math.hypot(pointer.x - last.x, pointer.y - last.y) < 0.5) return copy;
  return [...copy, { x: pointer.x, y: pointer.y }];
}

export type PathToolOption = 'mode' | 'autoAddDelete' | 'rubberBand' | 'strokeWidth' | 'pathPreset' | 'strokePath';
export type PathOptionTool =
  | PenFamilyTool
  | 'add-anchor'
  | 'delete-anchor'
  | 'convert-point'
  | 'path-select'
  | 'direct-select';

/**
 * Tool options each pen/path tool shows. Drawing tools get Mode (and the
 * stroke width in Shape mode); only the click-to-place tools get Rubber Band;
 * only the Pen auto-edits anchors. The anchor and selection tools keep the
 * path utilities (saved presets, Stroke Path) without drawing options.
 */
export function pathToolOptions(tool: PathOptionTool, mode: PenMode): PathToolOption[] {
  const utilities: PathToolOption[] = ['pathPreset', 'strokePath'];
  const drawing: PathToolOption[] = mode === 'shape' ? ['mode', 'strokeWidth'] : ['mode'];
  if (tool === 'pen') return [...drawing, 'autoAddDelete', 'rubberBand', ...utilities];
  if (tool === 'curvature-pen') return [...drawing, 'rubberBand', ...utilities];
  if (tool === 'freeform-pen') return [...drawing, ...utilities];
  return utilities;
}

/** One-line hint for each pen/path tool, shown in its Tool options. */
export const PATH_TOOL_HINTS: Readonly<Record<PathOptionTool, string>> = Object.freeze({
  pen: 'Click to place anchors (Shift-drag pulls a handle); click the first anchor to close.',
  'freeform-pen': 'Drag to draw; release to finish an open path.',
  'curvature-pen': 'Click to place smooth anchors; click the first anchor to close a smooth loop.',
  'add-anchor': 'Click a segment of the active path to add an anchor.',
  'delete-anchor': 'Click an anchor of the active path to delete it.',
  'convert-point': 'Click an anchor to toggle corner/smooth, or drag to pull handles.',
  'path-select': 'Drag the active path to move all of its anchors.',
  'direct-select': 'Drag an anchor or handle of the active path.',
});
