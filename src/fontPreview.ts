export const FONT_PREVIEW_SIZES = ['small', 'medium', 'large'] as const;
export type FontPreviewSize = (typeof FONT_PREVIEW_SIZES)[number];
export const DEFAULT_FONT_PREVIEW_SIZE: FontPreviewSize = 'medium';

export function normalizeFontPreviewSize(value: unknown): FontPreviewSize {
  return FONT_PREVIEW_SIZES.includes(value as FontPreviewSize)
    ? (value as FontPreviewSize)
    : DEFAULT_FONT_PREVIEW_SIZE;
}

export function nextFontPreviewSize(value: unknown): FontPreviewSize {
  const current = normalizeFontPreviewSize(value);
  const index = FONT_PREVIEW_SIZES.indexOf(current);
  return FONT_PREVIEW_SIZES[(index + 1) % FONT_PREVIEW_SIZES.length];
}

export function fontPreviewPixels(value: unknown): number {
  const size = normalizeFontPreviewSize(value);
  return size === 'small' ? 12 : size === 'large' ? 22 : 16;
}
