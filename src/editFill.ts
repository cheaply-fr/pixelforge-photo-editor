import { NATIVE_CANVAS_BLEND_MODES, type LayerBlendMode } from './blendModes.ts';

/** Edit > Fill contents (a bounded subset of the common editor Fill dialog). */
export const EDIT_FILL_CONTENTS = [
  { value: 'foreground', label: 'Foreground Color' },
  { value: 'background', label: 'Background Color' },
  { value: 'color', label: 'Color…' },
  { value: 'black', label: 'Black' },
  { value: 'white', label: 'White' },
  { value: 'gray', label: '50% Gray' },
] as const;

export type EditFillContents = (typeof EDIT_FILL_CONTENTS)[number]['value'];

export type EditFillOptions = {
  contents: EditFillContents;
  /** Only used when `contents` is 'color'. */
  color: string;
  /** Percent, 1–100. */
  opacity: number;
  /** A blend mode the Canvas 2D compositor implements natively. */
  mode: LayerBlendMode;
};

const HEX = /^#[0-9a-f]{6}$/i;

/** The #rrggbb colour a Fill with these contents paints. */
export function editFillColor(
  contents: EditFillContents,
  colors: { foreground: string; background: string; color: string },
): string {
  const pick = (value: string, fallback: string) => (HEX.test(value) ? value.toLowerCase() : fallback);
  switch (contents) {
    case 'foreground':
      return pick(colors.foreground, '#000000');
    case 'background':
      return pick(colors.background, '#ffffff');
    case 'color':
      return pick(colors.color, pick(colors.foreground, '#000000'));
    case 'black':
      return '#000000';
    case 'white':
      return '#ffffff';
    case 'gray':
      return '#808080';
  }
}

/**
 * Validate dialog input. Returns null for anything the Fill cannot apply
 * exactly (unknown contents, non-native blend modes, opacity out of range).
 */
export function normalizeEditFillOptions(value: {
  contents: string;
  color?: string;
  opacity: number | string;
  mode: string;
}): EditFillOptions | null {
  const contents = EDIT_FILL_CONTENTS.find((item) => item.value === value.contents)?.value;
  const opacity = typeof value.opacity === 'number' ? value.opacity : Number(String(value.opacity).trim());
  if (
    !contents ||
    !Number.isFinite(opacity) ||
    !Number.isInteger(opacity) ||
    opacity < 1 ||
    opacity > 100 ||
    !NATIVE_CANVAS_BLEND_MODES.has(value.mode as LayerBlendMode)
  )
    return null;
  const color = HEX.test(value.color ?? '') ? value.color!.toLowerCase() : '#000000';
  return { contents, color, opacity, mode: value.mode as LayerBlendMode };
}
