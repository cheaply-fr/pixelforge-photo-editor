/**
 * Built-in library for the Custom Shape tool.
 *
 * Every entry is authored as a compact SVG-like command list (M/L/C/Z) and
 * normalized once into the unit box: the hull of all anchors and Bezier
 * handles spans exactly 0..1 on both axes. Because a cubic Bezier stays inside
 * the hull of its control points, a shape scaled to a width × height box never
 * draws outside that box. Shapes become ordinary editable path layers; this
 * module is pure so geometry is testable without a browser.
 */
import { pathContours, serializePathData, validatePath, type PathContour, type PathModel, type PathNode } from './paths.ts';

export type CustomShapeLibraryEntry = {
  id: string;
  label: string;
  /** Normalized contours inside the unit box. */
  contours: readonly PathContour[];
  fillRule: 'nonzero' | 'evenodd';
};

type Point = { x: number; y: number };
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Parse `M x y`, `L x y`, `C x1 y1 x2 y2 x y` and `Z` into contours. */
export function parseShapeCommands(source: string): PathContour[] {
  const tokens = source.trim().split(/[\s,]+/).filter(Boolean);
  const contours: PathContour[] = [];
  let nodes: PathNode[] = [];
  let index = 0;
  const number = (): number => {
    const value = Number(tokens[index++]);
    if (!finite(value)) throw new Error(`Shape command data is invalid near token ${index}`);
    return value;
  };
  const finish = (closed: boolean) => {
    if (!nodes.length) return;
    if (closed && nodes.length > 1) {
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9) {
        // The closing segment ends on the first anchor: keep its incoming handle.
        if (last.inHandle) first.inHandle = last.inHandle;
        nodes.pop();
      }
    }
    contours.push({ nodes, closed });
    nodes = [];
  };
  while (index < tokens.length) {
    const command = tokens[index++];
    if (command === 'M') {
      finish(false);
      nodes.push({ x: number(), y: number() });
    } else if (command === 'L') {
      if (!nodes.length) throw new Error('Shape commands must start with M');
      nodes.push({ x: number(), y: number() });
    } else if (command === 'C') {
      const previous = nodes[nodes.length - 1];
      if (!previous) throw new Error('Shape commands must start with M');
      previous.outHandle = { x: number(), y: number() };
      const inHandle = { x: number(), y: number() };
      nodes.push({ x: number(), y: number(), inHandle });
    } else if (command === 'Z') finish(true);
    else throw new Error(`Unsupported shape command ${command}`);
  }
  finish(false);
  return contours;
}

const contourPoints = (contours: readonly PathContour[]): Point[] =>
  contours.flatMap((contour) =>
    contour.nodes.flatMap((node) => [node, ...(node.inHandle ? [node.inHandle] : []), ...(node.outHandle ? [node.outHandle] : [])]),
  );

/** Bounds of anchors and handles (the control hull) of a set of contours. */
export function controlBounds(contours: readonly PathContour[]) {
  const points = contourPoints(contours);
  if (!points.length) throw new Error('Shape has no points');
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
  const left = Math.min(...xs), top = Math.min(...ys), right = Math.max(...xs), bottom = Math.max(...ys);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

const mapContours = (contours: readonly PathContour[], map: (point: Point) => Point): PathContour[] =>
  contours.map((contour) => ({
    closed: contour.closed,
    nodes: contour.nodes.map((node) => ({
      ...map(node),
      ...(node.inHandle ? { inHandle: map(node.inHandle) } : {}),
      ...(node.outHandle ? { outHandle: map(node.outHandle) } : {}),
    })),
  }));

/** Scale contours so their control hull fills the unit box exactly. */
export function normalizeContours(contours: readonly PathContour[]): PathContour[] {
  const bounds = controlBounds(contours);
  if (bounds.width <= 0 || bounds.height <= 0) throw new Error('Shape needs a non-empty area');
  return mapContours(contours, (point) => ({
    x: (point.x - bounds.left) / bounds.width,
    y: (point.y - bounds.top) / bounds.height,
  }));
}

/** Closed star-like polygon: alternate outer/inner radius around (50, 50). */
const radialPolygon = (points: number, outer: number, inner: number): string => {
  const parts: string[] = [];
  for (let index = 0; index < points * 2; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI) / points;
    const radius = index % 2 === 0 ? outer : inner;
    parts.push(`${index === 0 ? 'M' : 'L'} ${(50 + Math.cos(angle) * radius).toFixed(4)} ${(50 + Math.sin(angle) * radius).toFixed(4)}`);
  }
  return `${parts.join(' ')} Z`;
};

/** Six rounded petals between inner anchors, plus a circular centre hole. */
const flowerCommands = (): string => {
  const petals = 6, inner = 20, outer = 62;
  const at = (radius: number, angle: number) =>
    `${(50 + Math.cos(angle) * radius).toFixed(4)} ${(50 + Math.sin(angle) * radius).toFixed(4)}`;
  const step = (Math.PI * 2) / petals;
  const parts = [`M ${at(inner, -Math.PI / 2 - step / 2)}`];
  for (let index = 0; index < petals; index += 1) {
    const centre = -Math.PI / 2 + index * step;
    parts.push(`C ${at(outer, centre - step / 2)} ${at(outer, centre + step / 2)} ${at(inner, centre + step / 2)}`);
  }
  parts.push('Z');
  // Centre hole as a four-arc circle (radius 9), cut out with even-odd fill.
  const r = 9, k = r * 0.5522847498307936;
  parts.push(`M 50 ${50 - r} C ${50 + k} ${50 - r} ${50 + r} ${50 - k} ${50 + r} 50 C ${50 + r} ${50 + k} ${50 + k} ${50 + r} 50 ${50 + r} C ${50 - k} ${50 + r} ${50 - r} ${50 + k} ${50 - r} 50 C ${50 - r} ${50 - k} ${50 - k} ${50 - r} 50 ${50 - r} Z`);
  return parts.join(' ');
};

const SOURCES: readonly { id: string; label: string; d: string; fillRule?: 'nonzero' | 'evenodd' }[] = [
  { id: 'arrow', label: 'Arrow', d: 'M 0 35 L 60 35 L 60 10 L 100 50 L 60 90 L 60 65 L 0 65 Z' },
  { id: 'heart', label: 'Heart', d: 'M 50 92 C 20 70 0 50 0 28 C 0 10 14 0 28 0 C 40 0 48 8 50 18 C 52 8 60 0 72 0 C 86 0 100 10 100 28 C 100 50 80 70 50 92 Z' },
  { id: 'starburst', label: 'Starburst', d: radialPolygon(16, 50, 36) },
  { id: 'speech-bubble', label: 'Speech Bubble', d: 'M 15 0 L 85 0 C 93 0 100 7 100 15 L 100 55 C 100 63 93 70 85 70 L 45 70 L 20 100 L 25 70 L 15 70 C 7 70 0 63 0 55 L 0 15 C 0 7 7 0 15 0 Z' },
  { id: 'checkmark', label: 'Checkmark', d: 'M 0 55 L 15 40 L 38 62 L 85 10 L 100 25 L 38 92 Z' },
  { id: 'cross', label: 'Cross', d: 'M 15 0 L 50 35 L 85 0 L 100 15 L 65 50 L 100 85 L 85 100 L 50 65 L 15 100 L 0 85 L 35 50 L 0 15 Z' },
  { id: 'plus', label: 'Plus', d: 'M 35 0 L 65 0 L 65 35 L 100 35 L 100 65 L 65 65 L 65 100 L 35 100 L 35 65 L 0 65 L 0 35 L 35 35 Z' },
  { id: 'lightning', label: 'Lightning', d: 'M 60 0 L 15 55 L 45 55 L 35 100 L 85 40 L 55 40 L 70 0 Z' },
  { id: 'flower', label: 'Flower', d: flowerCommands(), fillRule: 'evenodd' },
  { id: 'puzzle', label: 'Puzzle Piece', d: 'M 0 20 L 28 20 C 22 8 30 0 40 0 C 50 0 58 8 52 20 L 80 20 L 80 48 C 92 42 100 50 100 60 C 100 70 92 78 80 72 L 80 100 L 52 100 C 58 88 50 80 40 80 C 30 80 22 88 28 100 L 0 100 L 0 72 C 12 78 20 70 20 60 C 20 50 12 42 0 48 Z' },
  { id: 'drop', label: 'Drop', d: 'M 50 0 C 50 0 90 45 90 65 C 90 87 72 100 50 100 C 28 100 10 87 10 65 C 10 45 50 0 50 0 Z' },
  { id: 'cloud', label: 'Cloud', d: 'M 25 80 C 10 80 0 70 0 58 C 0 46 10 37 22 37 C 24 20 38 10 52 10 C 68 10 80 22 82 36 C 93 37 100 46 100 58 C 100 70 90 80 78 80 Z' },
  { id: 'house', label: 'House', d: 'M 50 0 L 100 45 L 85 45 L 85 100 L 15 100 L 15 45 L 0 45 Z' },
  { id: 'chevron', label: 'Chevron', d: 'M 0 0 L 55 0 L 100 50 L 55 100 L 0 100 L 45 50 Z' },
  { id: 'ribbon', label: 'Ribbon', d: 'M 0 0 L 100 0 L 85 50 L 100 100 L 0 100 L 15 50 Z' },
];

export const CUSTOM_SHAPE_LIBRARY: readonly CustomShapeLibraryEntry[] = SOURCES.map((source) => ({
  id: source.id,
  label: source.label,
  contours: normalizeContours(parseShapeCommands(source.d)),
  fillRule: source.fillRule ?? 'nonzero',
}));

export const CUSTOM_SHAPE_IDS = CUSTOM_SHAPE_LIBRARY.map((entry) => entry.id);
export const DEFAULT_CUSTOM_SHAPE_ID = 'heart';

export function customShapeEntry(id: unknown): CustomShapeLibraryEntry | undefined {
  return CUSTOM_SHAPE_LIBRARY.find((entry) => entry.id === id);
}

export function validCustomShapeId(value: unknown): boolean {
  return typeof value === 'string' && CUSTOM_SHAPE_IDS.includes(value);
}

/** Custom Shape tool choices persisted in settings: a library id or a path preset reference. */
export const PATH_PRESET_SHAPE_PREFIX = 'path-preset:';
export function validCustomShapeChoice(value: unknown): value is string {
  return validCustomShapeId(value) ||
    (typeof value === 'string' && /^path-preset:[0-9a-f-]{8,64}$/i.test(value));
}

/** Width/height ratio of a shape's normalized design, used by Shift-drag. */
export function customShapeAspect(id: unknown): number {
  const source = SOURCES.find((entry) => entry.id === id);
  if (!source) return 1;
  const bounds = controlBounds(parseShapeCommands(source.d));
  return bounds.width / bounds.height;
}

/**
 * Editable local path for a library shape scaled into a width × height box.
 * The result is filled with `color`, has no stroke and passes validatePath.
 */
export function customShapePath(id: unknown, width: number, height: number, color: string): PathModel {
  const entry = customShapeEntry(id);
  if (!entry) throw new Error('Unknown custom shape');
  if (!finite(width) || !finite(height) || width < 1 || height < 1 || width > 16000 || height > 16000)
    throw new Error('Custom shape size is invalid');
  const contours = mapContours(entry.contours, (point) => ({ x: point.x * width, y: point.y * height }));
  return contoursToPath(contours, entry.fillRule, color);
}

function contoursToPath(contours: PathContour[], fillRule: 'nonzero' | 'evenodd', color: string): PathModel {
  const [first] = contours;
  return validatePath({
    nodes: first.nodes,
    closed: first.closed,
    ...(contours.length > 1 ? { contours } : {}),
    fill: true,
    stroke: false,
    strokeWidth: 1,
    fillColor: color,
    strokeColor: color,
    fillRule,
  });
}

/**
 * Fit any saved closed path (for example a user path preset) into a box so it
 * can be drawn with the Custom Shape tool like a library entry.
 */
export function fitPathToBox(path: PathModel, width: number, height: number, color: string): PathModel {
  if (!finite(width) || !finite(height) || width < 1 || height < 1 || width > 16000 || height > 16000)
    throw new Error('Custom shape size is invalid');
  const normalized = normalizeContours(pathContours(path));
  if (!normalized.some((contour) => contour.closed && contour.nodes.length >= 3))
    throw new Error('Custom shapes need a closed path');
  const contours = mapContours(normalized, (point) => ({ x: point.x * width, y: point.y * height }));
  return contoursToPath(contours, validatePath(path).fillRule === 'evenodd' ? 'evenodd' : 'nonzero', color);
}

/** SVG path data in a 24 × 24 box for a picker thumbnail. */
export function customShapeThumbnailPath(id: unknown): string {
  return customShapeEntry(id) ? serializePathData(customShapePath(id, 24, 24, '#000000')) : '';
}
