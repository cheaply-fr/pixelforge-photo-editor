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
  | { id: string; kind: 'note'; x: number; y: number; text: string }
  | { id: string; kind: 'count'; x: number; y: number; index: number }
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
        safeNote(item.text)
      );
    if (item.kind === 'audio') return validAudioAnnotation(item, w, h);
    if (item.kind === 'count')
      return (
        point(item, w, h) &&
        Number.isInteger(item.index) &&
        Number(item.index) >= 1 &&
        Number(item.index) <= 512
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

export function nextCountIndex(annotations: readonly MeasurementAnnotation[]): number {
  return annotations.reduce(
    (highest, item) => (item.kind === 'count' ? Math.max(highest, item.index) : highest),
    0,
  ) + 1;
}

export function newMeasurementId(): string {
  return `m-${crypto.randomUUID()}`;
}
