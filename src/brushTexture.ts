/** Bounded deterministic opacity texture for raster brush-family stamps. */
export const BRUSH_TEXTURE_MIN = 0;
export const BRUSH_TEXTURE_MAX = 100;
export const BRUSH_TEXTURE_DEFAULT = 0;

export function normalizeBrushTexture(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return BRUSH_TEXTURE_DEFAULT;
  return Math.max(BRUSH_TEXTURE_MIN, Math.min(BRUSH_TEXTURE_MAX, Math.round(value)));
}

/** Return a deterministic opacity multiplier for one dab position. */
export function brushTextureOpacity(x: number, y: number, amount: number): number {
  const texture = normalizeBrushTexture(amount);
  if (texture === 0) return 1;
  const seed = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  const noise = seed - Math.floor(seed);
  return 1 - (texture / BRUSH_TEXTURE_MAX) * 0.55 * (0.35 + noise * 0.65);
}
