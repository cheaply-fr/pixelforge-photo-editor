/**
 * File → New… document settings: presets, background contents and the same
 * dimension limits as Canvas Size (whole pixels, ≤16,000 per side, ≤16 MP).
 */

export const MAX_DOCUMENT_SIDE = 16000;
export const MAX_DOCUMENT_PIXELS = 16_000_000;

export type NewDocumentBackground = 'white' | 'black' | 'background-color' | 'transparent';

export const NEW_DOCUMENT_BACKGROUNDS: ReadonlyArray<[NewDocumentBackground, string]> = [
  ['white', 'White'],
  ['black', 'Black'],
  ['background-color', 'Background colour'],
  ['transparent', 'Transparent'],
];

export type NewDocumentPreset = { id: string; label: string; width: number; height: number };

export const NEW_DOCUMENT_PRESETS: readonly NewDocumentPreset[] = [
  { id: 'default', label: 'Default (1200 × 800)', width: 1200, height: 800 },
  { id: 'hd', label: 'HD (1920 × 1080)', width: 1920, height: 1080 },
  { id: 'uhd', label: '4K UHD (3840 × 2160)', width: 3840, height: 2160 },
  { id: 'square', label: 'Square (2048 × 2048)', width: 2048, height: 2048 },
  { id: 'social-portrait', label: 'Social portrait (1080 × 1350)', width: 1080, height: 1350 },
  { id: 'poster-2-3', label: 'Poster 2:3 (2646 × 4096)', width: 2646, height: 4096 },
  { id: 'a4-300', label: 'A4 at 300 ppi (2480 × 3508)', width: 2480, height: 3508 },
];

export type NewDocumentRequest = {
  name: string;
  width: number;
  height: number;
  background: NewDocumentBackground;
};

export type NewDocumentProblem = 'width' | 'height' | 'pixels' | 'name' | null;

/** Parse a dimension field: whole numbers only, no units or exponents. */
export function parseDimension(text: string): number | undefined {
  const trimmed = text.trim();
  if (!/^\d{1,5}$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

export function newDocumentProblem(width: number | undefined, height: number | undefined, name = 'untitled'): NewDocumentProblem {
  const side = (value: number | undefined) =>
    value !== undefined && Number.isInteger(value) && value >= 1 && value <= MAX_DOCUMENT_SIDE;
  if (!side(width)) return 'width';
  if (!side(height)) return 'height';
  if (width! * height! > MAX_DOCUMENT_PIXELS) return 'pixels';
  if (!name.trim() || name.length > 160) return 'name';
  return null;
}

export function presetFor(width: number, height: number): NewDocumentPreset | undefined {
  return NEW_DOCUMENT_PRESETS.find((preset) => preset.width === width && preset.height === height);
}

/** CSS fill for the background contents, or undefined for transparent. */
export function backgroundFill(background: NewDocumentBackground, backgroundColor: string): string | undefined {
  if (background === 'transparent') return undefined;
  if (background === 'black') return '#000000';
  if (background === 'background-color') return /^#[0-9a-f]{6}$/i.test(backgroundColor) ? backgroundColor : '#ffffff';
  return '#ffffff';
}

export function megapixels(width: number, height: number): string {
  return `${((width * height) / 1_000_000).toFixed(1)} MP`;
}
