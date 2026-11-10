/**
 * Reference / guide image.
 *
 * A reference image is a document-level overlay used for tracing, colour
 * matching or composition. It is stored on the frame (`frame.reference`), so
 * it is undoable and persists in local drafts and `.pixelforge` projects, but
 * it is never a layer: export, flatten, merge, Copy Merged, artboard renders
 * and the layer pixel budget all work on `frame.layers` and therefore never
 * include it. The editor shows it as a non-interactive overlay above the
 * canvas, fitted to the canvas, and the Eyedropper can optionally sample it.
 */

export const REFERENCE_FITS = ['contain', 'cover', 'stretch'] as const;
export type ReferenceFit = (typeof REFERENCE_FITS)[number];

export type ReferenceImage = {
  /** Asset id of the reference bitmap (PNG data URL in the document assets). */
  asset: string;
  /** Source filename, shown in the Reference panel. */
  name: string;
  /** Overlay opacity, 0–1. */
  opacity: number;
  visible: boolean;
  /** A locked reference cannot be replaced, refitted, retuned or removed. */
  locked: boolean;
  fit: ReferenceFit;
  /** When true, the Eyedropper samples the reference instead of the artwork. */
  sample: boolean;
};

/**
 * References are guides, so they are stored downscaled to this longest edge.
 * That keeps drafts and projects small without affecting exported pixels.
 */
export const REFERENCE_MAX_EDGE = 2048;

export const REFERENCE_DISCLOSURE =
  'Reference images are guides only. They are never exported, flattened, merged or counted toward the layer pixel budget, but they are saved with drafts and .pixelforge projects.';

type AssetMap = Record<string, { w: number; h: number }>;

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Strict validation for persisted reference metadata. */
export function validReferenceImage(value: unknown, assets: AssetMap): value is ReferenceImage {
  if (!record(value)) return false;
  const keys = Object.keys(value);
  const allowed = ['asset', 'name', 'opacity', 'visible', 'locked', 'fit', 'sample'];
  return (
    keys.every((key) => allowed.includes(key)) &&
    typeof value.asset === 'string' &&
    /^[a-f0-9-]{36}$/.test(value.asset) &&
    Object.hasOwn(assets, value.asset) &&
    Math.max(assets[value.asset].w, assets[value.asset].h) <= REFERENCE_MAX_EDGE &&
    typeof value.name === 'string' &&
    value.name.length <= 160 &&
    typeof value.opacity === 'number' &&
    Number.isFinite(value.opacity) &&
    value.opacity >= 0 &&
    value.opacity <= 1 &&
    typeof value.visible === 'boolean' &&
    typeof value.locked === 'boolean' &&
    typeof value.sample === 'boolean' &&
    REFERENCE_FITS.includes(value.fit as ReferenceFit)
  );
}

/** Dimensions to store a reference at: never upscaled, longest edge ≤ max. */
export function referenceStoredSize(
  width: number,
  height: number,
  maxEdge = REFERENCE_MAX_EDGE,
): { w: number; h: number } {
  if (!(width > 0 && height > 0)) throw new Error('Invalid reference dimensions');
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    w: Math.max(1, Math.round(width * scale)),
    h: Math.max(1, Math.round(height * scale)),
  };
}

/** Document-space rectangle covered by the reference for a fit mode. */
export function referenceRect(
  fit: ReferenceFit,
  frameW: number,
  frameH: number,
  sourceW: number,
  sourceH: number,
): { x: number; y: number; w: number; h: number } {
  if (fit === 'stretch') return { x: 0, y: 0, w: frameW, h: frameH };
  const scale =
    fit === 'contain'
      ? Math.min(frameW / sourceW, frameH / sourceH)
      : Math.max(frameW / sourceW, frameH / sourceH);
  const w = sourceW * scale,
    h = sourceH * scale;
  return { x: (frameW - w) / 2, y: (frameH - h) / 2, w, h };
}

/**
 * Map a document point to the reference's source pixel, or null when the
 * point lies outside the visible reference (letterbox area or off canvas).
 */
export function referenceSourcePixel(
  fit: ReferenceFit,
  frameW: number,
  frameH: number,
  sourceW: number,
  sourceH: number,
  x: number,
  y: number,
): { x: number; y: number } | null {
  if (x < 0 || y < 0 || x >= frameW || y >= frameH) return null;
  const rect = referenceRect(fit, frameW, frameH, sourceW, sourceH);
  const u = (x - rect.x) / rect.w,
    v = (y - rect.y) / rect.h;
  if (u < 0 || v < 0 || u >= 1 || v >= 1) return null;
  return {
    x: Math.min(sourceW - 1, Math.floor(u * sourceW)),
    y: Math.min(sourceH - 1, Math.floor(v * sourceH)),
  };
}

/** CSS `object-fit` value that renders the same placement as {@link referenceRect}. */
export function referenceObjectFit(fit: ReferenceFit): 'contain' | 'cover' | 'fill' {
  return fit === 'stretch' ? 'fill' : fit;
}

/** A new, visible, unlocked reference at half opacity. */
export function createReferenceImage(asset: string, name: string): ReferenceImage {
  return {
    asset,
    name: name.slice(0, 160) || 'Reference',
    opacity: 0.5,
    visible: true,
    locked: false,
    fit: 'contain',
    sample: false,
  };
}
