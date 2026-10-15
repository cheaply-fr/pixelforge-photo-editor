import { FONTS, TEXT_ALIGNS, TEXT_ORIENTATIONS, type Layer, type TextAlign, type TextOrientation } from './document.ts';

export type TypeStyle = {
  fontFamily: (typeof FONTS)[number];
  fontSize: number;
  color: string;
  bold: boolean;
  boxWidth: number;
  textAlign: TextAlign;
  lineHeight: number;
  letterSpacing: number;
  orientation: TextOrientation;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function typeStyleFromLayer(layer: Layer | undefined): TypeStyle | undefined {
  if (!layer || layer.kind !== 'text') return undefined;
  return {
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    color: layer.color,
    bold: layer.bold,
    boxWidth: layer.boxWidth,
    textAlign: layer.textAlign ?? 'left',
    lineHeight: layer.lineHeight,
    letterSpacing: layer.letterSpacing,
    orientation: layer.orientation ?? 'horizontal',
  };
}

export function validTypeStyle(value: unknown): value is TypeStyle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const style = value as Partial<TypeStyle>;
  return (
    FONTS.includes(style.fontFamily as (typeof FONTS)[number]) &&
    finite(style.fontSize) && style.fontSize >= 1 && style.fontSize <= 1000 &&
    typeof style.color === 'string' && /^#[a-f\d]{6}$/i.test(style.color) &&
    typeof style.bold === 'boolean' && finite(style.boxWidth) && style.boxWidth >= 1 && style.boxWidth <= 100000 &&
    TEXT_ALIGNS.includes(style.textAlign as TextAlign) &&
    finite(style.lineHeight) && style.lineHeight >= 0.25 && style.lineHeight <= 8 &&
    finite(style.letterSpacing) && style.letterSpacing >= -100 && style.letterSpacing <= 100 &&
    TEXT_ORIENTATIONS.includes(style.orientation as TextOrientation)
  );
}

export function normalizeTypeStyle(value: unknown): TypeStyle | undefined {
  if (value === undefined) return undefined;
  if (!validTypeStyle(value)) throw new Error('Invalid default type style');
  return { ...value };
}

export function applyTypeStyle<T extends Layer>(layer: T, style: TypeStyle): T {
  if (layer.kind !== 'text') throw new Error('Default type style requires a text layer');
  return { ...layer, ...style } as T;
}
