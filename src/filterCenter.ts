import type { FilterEffectType } from './filterEffects.ts';

/**
 * Filters whose geometry is anchored at `centerX` / `centerY`. Centres are
 * layer-local fractions of the layer's pixel span: pixel = centre × (size − 1).
 */
export const CENTERED_FILTER_TYPES = [
  'pinch',
  'twirl',
  'liquify',
  'ripple',
  'spherize',
  'polar-coordinates',
  'lens-correction',
  'adaptive-wide-angle',
  'lens-flare',
  'iris-blur',
  'radial-blur',
  'spin-blur',
  'path-blur',
  'tilt-shift',
  'flame',
  'tree',
] as const satisfies readonly FilterEffectType[];

export function isCenteredFilter(type: string): boolean {
  return (CENTERED_FILTER_TYPES as readonly string[]).includes(type);
}

/** Stored precision: 1e-6 of the span, i.e. sub-pixel up to a 16,000 px layer. */
const CENTER_PRECISION = 1_000_000;

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5);

/** Round a centre fraction to stored precision. */
export function roundFilterCenter(value: number): number {
  return Math.round(clamp01(value) * CENTER_PRECISION) / CENTER_PRECISION;
}

/** Percentage shown by the centre sliders, with two decimals (0.01 % steps). */
export function filterCenterPercent(value: number): number {
  return Math.round(clamp01(value) * 10_000) / 100;
}

/** Convert a slider percentage back to a stored centre fraction. */
export function filterCenterFromPercent(percent: number): number {
  return roundFilterCenter(percent / 100);
}

type Matrix = readonly [number, number, number, number, number, number] | readonly number[];

/** Frame-space position of a layer-local filter centre. */
export function filterCenterToFrame(
  matrix: Matrix,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
): { x: number; y: number } {
  const x = clamp01(centerX) * Math.max(0, width - 1),
    y = clamp01(centerY) * Math.max(0, height - 1);
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  };
}

/**
 * Layer-local centre for a frame-space point (for example a pointer), clamped
 * to the layer and rounded to stored precision. Returns null for a
 * degenerate (non-invertible) layer transform.
 */
export function filterCenterFromFrame(
  matrix: Matrix,
  width: number,
  height: number,
  point: { x: number; y: number },
): { centerX: number; centerY: number } | null {
  const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2];
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return null;
  const dx = point.x - matrix[4],
    dy = point.y - matrix[5],
    localX = (matrix[3] * dx - matrix[2] * dy) / determinant,
    localY = (-matrix[1] * dx + matrix[0] * dy) / determinant;
  return {
    centerX: width > 1 ? roundFilterCenter(localX / (width - 1)) : 0.5,
    centerY: height > 1 ? roundFilterCenter(localY / (height - 1)) : 0.5,
  };
}

/**
 * Keyboard nudge for the on-canvas centre handle: arrow keys move one layer
 * pixel, Shift+arrow ten pixels, Home resets to the layer centre.
 */
export function nudgeFilterCenter(
  center: { centerX: number; centerY: number },
  width: number,
  height: number,
  key: string,
  large = false,
): { centerX: number; centerY: number } | null {
  if (key === 'Home') return { centerX: 0.5, centerY: 0.5 };
  const pixels = large ? 10 : 1,
    stepX = width > 1 ? pixels / (width - 1) : 0,
    stepY = height > 1 ? pixels / (height - 1) : 0;
  const delta =
    key === 'ArrowLeft' ? [-stepX, 0]
      : key === 'ArrowRight' ? [stepX, 0]
        : key === 'ArrowUp' ? [0, -stepY]
          : key === 'ArrowDown' ? [0, stepY]
            : undefined;
  if (!delta) return null;
  return {
    centerX: roundFilterCenter(center.centerX + delta[0]),
    centerY: roundFilterCenter(center.centerY + delta[1]),
  };
}
