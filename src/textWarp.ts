/** Bounded, deterministic editable text-warp controls. */
export const TEXT_WARP_STYLES = ['none', 'arc', 'bulge', 'flag'] as const;
export type TextWarpStyle = (typeof TEXT_WARP_STYLES)[number];
export type TextWarp = {
  style: TextWarpStyle;
  bend: number;
  horizontal: number;
  vertical: number;
};

export const neutralTextWarp: TextWarp = {
  style: 'none',
  bend: 0,
  horizontal: 0,
  vertical: 0,
};

export function isTextWarp(value: unknown): value is TextWarp {
  if (!value || typeof value !== 'object') return false;
  const warp = value as Partial<TextWarp>;
  return TEXT_WARP_STYLES.includes(warp.style as TextWarpStyle) &&
    typeof warp.bend === 'number' && Number.isFinite(warp.bend) && warp.bend >= -100 && warp.bend <= 100 &&
    typeof warp.horizontal === 'number' && Number.isFinite(warp.horizontal) && warp.horizontal >= -100 && warp.horizontal <= 100 &&
    typeof warp.vertical === 'number' && Number.isFinite(warp.vertical) && warp.vertical >= -100 && warp.vertical <= 100;
}

export function normalizeTextWarp(value: unknown): TextWarp {
  if (!value || typeof value !== 'object') return { ...neutralTextWarp };
  const source = value as Partial<TextWarp>;
  return {
    style: TEXT_WARP_STYLES.includes(source.style as TextWarpStyle) ? source.style as TextWarpStyle : 'none',
    bend: Math.max(-100, Math.min(100, Number.isFinite(source.bend) ? source.bend as number : 0)),
    horizontal: Math.max(-100, Math.min(100, Number.isFinite(source.horizontal) ? source.horizontal as number : 0)),
    vertical: Math.max(-100, Math.min(100, Number.isFinite(source.vertical) ? source.vertical as number : 0)),
  };
}

/** Return a glyph's curve offset and rotation in canvas pixels/radians. */
export function textWarpTransform(
  style: TextWarpStyle,
  bend: number,
  t: number,
  fontSize: number,
): { x: number; y: number; rotation: number } {
  const clampedT = Math.max(0, Math.min(1, t));
  const amount = Math.max(-100, Math.min(100, bend)) / 100;
  const size = Math.max(1, fontSize);
  if (style === 'none' || amount === 0) return { x: 0, y: 0, rotation: 0 };
  const centered = clampedT * 2 - 1;
  if (style === 'bulge') {
    const y = amount * size * (1 - centered * centered);
    return { x: 0, y, rotation: -amount * centered * 0.55 };
  }
  if (style === 'flag') {
    const wave = Math.sin(clampedT * Math.PI * 2) * amount * size * 0.65;
    return { x: 0, y: wave, rotation: Math.cos(clampedT * Math.PI * 2) * amount * 0.6 };
  }
  const y = amount * size * centered * centered * 0.8;
  return { x: 0, y, rotation: amount * centered * 0.7 };
}
