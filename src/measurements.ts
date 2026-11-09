/**
 * Non-destructive sampling and measurement overlays.
 *
 * These records live on a Frame so a bookmarked/local/cloud draft keeps the
 * editor's working annotations. The renderer intentionally ignores them:
 * overlays are workspace aids and must never leak into an exported image.
 */
import { validAudioAnnotation, type AudioNoteAnnotation } from './audioAnnotations.ts';

export type MeasurementPoint = { x: number; y: number };

export type MeasurementAnnotation =
  | {
      id: string;
      kind: 'sample';
      x: number;
      y: number;
      color: string;
      alpha: number;
    }
  | {
      id: string;
      kind: 'ruler';
      start: MeasurementPoint;
      end: MeasurementPoint;
      pixels: number;
      angle: number;
    }
  | { id: string; kind: 'note'; x: number; y: number; text: string; color?: string }
  | {
      id: string;
      kind: 'count';
      x: number;
      y: number;
      index: number;
      /** Count group name; markers without one belong to DEFAULT_COUNT_GROUP. */
      group?: string;
      /** Marker colour for the group (#rrggbb). */
      color?: string;
    }
  | AudioNoteAnnotation;

const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

const point = (value: unknown, w: number, h: number): boolean =>
  Boolean(value) &&
  typeof value === 'object' &&
  finite((value as MeasurementPoint).x, 0, w) &&
  finite((value as MeasurementPoint).y, 0, h);

const id = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,96}$/.test(value);

const hexColor = (value: unknown): boolean =>
  typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value);

/** Count markers created before count groups existed belong to this group. */
export const DEFAULT_COUNT_GROUP = 'Count 1';
export const MAX_COUNT_GROUP_LENGTH = 40;

const safeNote = (value: string): boolean =>
  !Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return (code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
  });

/** Validate persisted overlays before adopting a draft. */
export function validMeasurements(
  value: unknown,
  w: number,
  h: number,
): value is MeasurementAnnotation[] {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > 512) return false;
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object' || !id((entry as { id?: unknown }).id))
      return false;
    const item = entry as Record<string, unknown>;
    if (item.kind === 'sample')
      return (
        point(item, w, h) &&
        typeof item.color === 'string' &&
        /^#[a-f\d]{6}$/i.test(item.color) &&
        finite(item.alpha, 0, 255)
      );
    if (item.kind === 'ruler')
      return (
        point(item.start, w, h) &&
        point(item.end, w, h) &&
        finite(item.pixels, 0, Math.hypot(w, h)) &&
        finite(item.angle, -180, 180)
      );
    if (item.kind === 'note')
      return (
        point(item, w, h) &&
        typeof item.text === 'string' &&
        item.text.length > 0 &&
        item.text.length <= 500 &&
        safeNote(item.text) &&
        (item.color === undefined || hexColor(item.color))
      );
    if (item.kind === 'audio') return validAudioAnnotation(item, w, h);
    if (item.kind === 'count')
      return (
        point(item, w, h) &&
        Number.isInteger(item.index) &&
        Number(item.index) >= 1 &&
        Number(item.index) <= 512 &&
        (item.group === undefined || validCountGroupName(item.group)) &&
        (item.color === undefined || hexColor(item.color))
      );
    return false;
  });
}

export function measurementDistance(start: MeasurementPoint, end: MeasurementPoint): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

export function measurementAngle(start: MeasurementPoint, end: MeasurementPoint): number {
  const degrees = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
  return Math.round(degrees * 10) / 10;
}

export function formatMeasurement(pixels: number, angle: number): string {
  return `${pixels.toFixed(1)} px · ${angle.toFixed(1)}°`;
}

/** A count group name: 1–40 printable characters after trimming. */
export function validCountGroupName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value === value.trim() &&
    value.length <= MAX_COUNT_GROUP_LENGTH &&
    safeNote(value) &&
    !/[\t\n\r]/.test(value)
  );
}

export function countGroupOf(item: { group?: string }): string {
  return item.group ?? DEFAULT_COUNT_GROUP;
}

/** Next index inside one count group (Photoshop numbers each group from 1). */
export function nextCountIndexInGroup(
  annotations: readonly MeasurementAnnotation[],
  group: string,
): number {
  return annotations.reduce(
    (highest, item) =>
      item.kind === 'count' && countGroupOf(item) === group ? Math.max(highest, item.index) : highest,
    0,
  ) + 1;
}

/** Marker totals per count group, in first-seen order. */
export function countGroupTotals(
  annotations: readonly MeasurementAnnotation[],
): { group: string; color?: string; count: number }[] {
  const totals = new Map<string, { group: string; color?: string; count: number }>();
  for (const item of annotations) {
    if (item.kind !== 'count') continue;
    const group = countGroupOf(item);
    const entry = totals.get(group) ?? { group, color: item.color, count: 0 };
    entry.count += 1;
    if (item.color) entry.color = item.color;
    totals.set(group, entry);
  }
  return [...totals.values()];
}

/**
 * Ruler angle in Photoshop's convention: degrees from the positive x axis,
 * counter-clockwise on screen, so a line rising to the right is positive.
 * Image y grows downwards, hence the sign flip. Rounded to 0.1°.
 */
export function photoshopAngle(start: MeasurementPoint, end: MeasurementPoint): number {
  const degrees = (Math.atan2(start.y - end.y, end.x - start.x) * 180) / Math.PI;
  const rounded = Math.round(degrees * 10) / 10;
  return Object.is(rounded, -0) || rounded === -180 ? Math.abs(rounded) : rounded;
}

export type RulerReadout = {
  length: number;
  /** Photoshop convention: up-right is positive. */
  angle: number;
  /** End minus start in image pixels (x right, y down). */
  dx: number;
  dy: number;
};

export function rulerReadout(start: MeasurementPoint, end: MeasurementPoint): RulerReadout {
  return {
    length: measurementDistance(start, end),
    angle: photoshopAngle(start, end),
    dx: end.x - start.x,
    dy: end.y - start.y,
  };
}

/**
 * Rotation in degrees (clockwise on screen, image y down) that makes the
 * ruler line horizontal with the smallest turn, in (-90, 90].
 */
export function straightenRotation(start: MeasurementPoint, end: MeasurementPoint): number {
  if (start.x === end.x && start.y === end.y) return 0;
  let rotation = -(Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
  while (rotation > 90) rotation -= 180;
  while (rotation <= -90) rotation += 180;
  return Math.abs(rotation) < 1e-9 ? 0 : rotation;
}

/** Affine matrix [a, b, c, d, e, f] rotating by `degrees` (clockwise on screen) about (cx, cy). */
export function rotationAboutPoint(
  degrees: number,
  cx: number,
  cy: number,
): [number, number, number, number, number, number] {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians),
    sin = Math.sin(radians);
  const clean = (value: number) => (Math.abs(value) < 1e-12 ? 0 : value);
  return [
    clean(cos),
    clean(sin),
    clean(-sin),
    clean(cos),
    clean(cx - cos * cx + sin * cy),
    clean(cy - sin * cx - cos * cy),
  ];
}

export function nextCountIndex(annotations: readonly MeasurementAnnotation[]): number {
  return annotations.reduce(
    (highest, item) => (item.kind === 'count' ? Math.max(highest, item.index) : highest),
    0,
  ) + 1;
}

export function newMeasurementId(): string {
  return `m-${crypto.randomUUID()}`;
}

/** Eyedropper sample sizes (square edge in image pixels); 1 is Point Sample. */
export const EYEDROPPER_SAMPLE_SIZES = [1, 3, 5, 11, 31, 51, 101] as const;
export type EyedropperSampleSize = (typeof EYEDROPPER_SAMPLE_SIZES)[number];

export type RgbaSample = { r: number; g: number; b: number; a: number };

/**
 * Average an RGBA buffer over a `size` × `size` square centred on (x, y),
 * clipped to the buffer. Colour is alpha-weighted (so transparent pixels do
 * not darken the result) and alpha is the plain mean of the pixels read.
 */
export function averageSample(
  data: ArrayLike<number>,
  width: number,
  height: number,
  x: number,
  y: number,
  size = 1,
): RgbaSample {
  if (!(width > 0 && height > 0) || data.length < width * height * 4)
    throw new Error('Sample buffer is invalid');
  const edge = Math.max(1, Math.floor(size));
  const cx = Math.floor(x),
    cy = Math.floor(y),
    half = Math.floor(edge / 2);
  const left = Math.max(0, cx - half),
    top = Math.max(0, cy - half),
    right = Math.min(width - 1, cx - half + edge - 1),
    bottom = Math.min(height - 1, cy - half + edge - 1);
  let r = 0, g = 0, b = 0, alpha = 0, pixels = 0;
  for (let row = top; row <= bottom; row += 1)
    for (let column = left; column <= right; column += 1) {
      const offset = (row * width + column) * 4,
        a = data[offset + 3];
      r += data[offset] * a;
      g += data[offset + 1] * a;
      b += data[offset + 2] * a;
      alpha += a;
      pixels += 1;
    }
  if (!pixels || !alpha) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: Math.round(r / alpha),
    g: Math.round(g / alpha),
    b: Math.round(b / alpha),
    a: Math.round(alpha / pixels),
  };
}

export function rgbHex(sample: { r: number; g: number; b: number }): string {
  return `#${[sample.r, sample.g, sample.b]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0'))
    .join('')}`;
}
