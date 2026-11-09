/**
 * Self-hosted font library registry (pure). The catalogue data is generated
 * from pinned npm font packages by `scripts/sync-font-library.mjs`; the woff2
 * files are copied to `/fonts/` at build time by `scripts/copy-fonts.mjs` and
 * are only fetched on demand through the FontFace API (see fontLoader.ts).
 * See docs/font-library-contract.md.
 */
import { FONT_ASSET_VERSION, FONT_UNICODE_RANGES, GENERATED_FONT_LIBRARY } from './fontLibrary.generated.ts';

export const SYSTEM_FONTS = ['Arial', 'Georgia', 'Courier New', 'Verdana'] as const;

export const FONT_CATEGORIES = [
  'sans',
  'serif',
  'slab',
  'display',
  'handwriting',
  'monospace',
  'condensed',
  'rounded',
  'decorative',
  'icons',
  'symbols',
] as const;
export type FontCategory = (typeof FONT_CATEGORIES)[number];

export const FONT_CATEGORY_LABELS: Record<FontCategory, string> = {
  sans: 'Sans serif',
  serif: 'Serif',
  slab: 'Slab serif',
  display: 'Display',
  handwriting: 'Handwriting & script',
  monospace: 'Monospace',
  condensed: 'Condensed',
  rounded: 'Rounded',
  decorative: 'Decorative',
  icons: 'Icons',
  symbols: 'Symbols & signs',
};

/** Only these licences are accepted into the bundled library. */
export const ALLOWED_FONT_LICENCES = ['OFL-1.1', 'Apache-2.0', 'UFL-1.0', 'CC0-1.0'] as const;
export type FontLicence = (typeof ALLOWED_FONT_LICENCES)[number];

export type LibraryFace = {
  /** Path below /fonts/. */
  file: string;
  /** CSS font-weight descriptor: "400", "700" or a variable range "100 900". */
  weight: string;
  style: 'normal' | 'italic';
  /** Fontsource subset name, or "all" for single-file icon/symbol fonts. */
  subset: string;
  /** CSS unicode-range descriptor; undefined for single-file fonts. */
  unicodeRange?: string;
  bytes: number;
  format: 'woff2' | 'woff';
};

export type IconIndexKind = 'named' | 'unicode-blocks';

export type LibraryFont = {
  family: string;
  id: string;
  category: FontCategory;
  tags: readonly string[];
  licence: FontLicence;
  /** Path below /fonts/ of the shipped licence text. */
  licenceFile: string;
  /** Copyright / attribution line shown in the UI and docs. */
  attribution: string;
  source: { package: string; version: string; upstream: string };
  /** Variable axes when the files are variable fonts. */
  axes?: readonly { tag: string; min: number; max: number }[];
  weights: readonly number[];
  italic: boolean;
  faces: readonly LibraryFace[];
  /** Preview glyphs for icon/symbol fonts (the family name has no glyphs there). */
  sample?: string;
  /** Icon/symbol metadata: how the Glyphs panel indexes this font. */
  icons?: { kind: IconIndexKind; count: number; attribution?: string };
};

type GeneratedFace = { f: string; w: string; s: string; u: string; r: number; b: number; t?: string };
type GeneratedFont = Omit<LibraryFont, 'faces' | 'licenceFile'> & { faces: readonly GeneratedFace[] };

function expandFont(font: GeneratedFont): LibraryFont {
  return {
    ...font,
    licenceFile: `licenses/${font.id}.txt`,
    faces: font.faces.map((face) => ({
      file: `${font.id}/${face.f}`,
      weight: face.w,
      style: face.s === 'italic' ? 'italic' : 'normal',
      subset: face.u,
      ...(face.r >= 0 ? { unicodeRange: FONT_UNICODE_RANGES[face.r] } : {}),
      bytes: face.b,
      format: face.t === 'woff' ? 'woff' : 'woff2',
    })),
  };
}

export const FONT_LIBRARY: readonly LibraryFont[] = (GENERATED_FONT_LIBRARY as unknown as readonly GeneratedFont[]).map(expandFont);
export { FONT_ASSET_VERSION };

const BY_FAMILY = new Map(FONT_LIBRARY.map((font) => [font.family.toLowerCase(), font]));

export function libraryFont(family: unknown): LibraryFont | undefined {
  return typeof family === 'string' ? BY_FAMILY.get(family.trim().toLowerCase()) : undefined;
}

export type FontFamilyKind = 'system' | 'library' | 'unknown';

export function fontFamilyKind(family: unknown): FontFamilyKind {
  if (typeof family !== 'string') return 'unknown';
  if ((SYSTEM_FONTS as readonly string[]).includes(family)) return 'system';
  return libraryFont(family) ? 'library' : 'unknown';
}

/** Whether a family can be chosen in pickers, presets and tool settings. */
export function isSelectableFontFamily(value: unknown): value is string {
  return fontFamilyKind(value) !== 'unknown';
}

/** Every family a user can choose, system families first. */
export const ALL_FONT_FAMILIES: readonly string[] = [...SYSTEM_FONTS, ...FONT_LIBRARY.map((font) => font.family)];

const FAMILY_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} _.'&+-]{0,79}$/u;

/**
 * Portable text-layer family names: any bounded, quote-free family is kept
 * so documents referencing fonts this build does not ship stay editable and
 * render with the browser fallback (docs/font-fallback-contract.md).
 */
export function isFontFamilyName(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && FAMILY_PATTERN.test(value);
}

/** Canvas/CSS font shorthand with a quoted family. */
export function fontShorthand(family: string, size: number, weight: number | string = 400, style: 'normal' | 'italic' = 'normal'): string {
  return `${style === 'italic' ? 'italic ' : ''}${weight} ${size}px "${family.replaceAll('"', '')}"`;
}

/** Absolute URL of a face file, versioned so caches can be immutable. */
export function fontFileUrl(file: string, base = '/fonts/'): string {
  return `${base}${file}?v=${FONT_ASSET_VERSION}`;
}

export type FaceRegistration = {
  family: string;
  source: string;
  descriptors: { weight: string; style: 'normal' | 'italic'; unicodeRange?: string; display: 'swap' };
  url: string;
};

/** FontFace constructor arguments for every face of a library family. */
export function fontFaceRegistrations(font: LibraryFont, base = '/fonts/'): FaceRegistration[] {
  return font.faces.map((face) => {
    const url = fontFileUrl(face.file, base);
    const unicodeRange = face.unicodeRange;
    return {
      family: font.family,
      url,
      source: `url(${url}) format("${face.format}")`,
      descriptors: { weight: face.weight, style: face.style, display: 'swap', ...(unicodeRange ? { unicodeRange } : {}) },
    };
  });
}

export function libraryBytes(font: LibraryFont): number {
  return font.faces.reduce((total, face) => total + face.bytes, 0);
}

function normalizedSearch(value: string): string {
  return value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export type FontSearchOptions = {
  query?: string;
  category?: FontCategory | 'all' | 'favourites' | 'recent';
  favourites?: readonly string[];
  recent?: readonly string[];
};

export type FontListItem = { family: string; category: FontCategory | 'system'; kind: 'system' | 'library' };

export function fontListItems(): FontListItem[] {
  return [
    ...SYSTEM_FONTS.map((family) => ({ family, category: 'system' as const, kind: 'system' as const })),
    ...FONT_LIBRARY.map((font) => ({ family: font.family, category: font.category, kind: 'library' as const })),
  ];
}

/** Filter the picker list by query, category, favourites or recent families. */
export function searchFonts(options: FontSearchOptions = {}): FontListItem[] {
  const query = normalizedSearch(options.query ?? '');
  const terms = query ? query.split(/\s+/) : [];
  let items = fontListItems();
  const category = options.category ?? 'all';
  if (category === 'favourites') {
    const set = new Set(options.favourites ?? []);
    items = items.filter((item) => set.has(item.family));
  } else if (category === 'recent') {
    const order = (options.recent ?? []).filter((family) => items.some((item) => item.family === family));
    items = order.map((family) => items.find((item) => item.family === family)!);
  } else if (category !== 'all') items = items.filter((item) => item.category === category);
  if (!terms.length) return items;
  return items.filter((item) => {
    const font = libraryFont(item.family);
    const haystack = normalizedSearch(
      [item.family, item.category, font ? FONT_CATEGORY_LABELS[font.category] : 'system', ...(font?.tags ?? [])].join(' '),
    );
    return terms.every((term) => haystack.includes(term));
  });
}

export const FAVOURITE_FONTS_KEY = 'pixelforge.fonts.favourites.v1';
export const RECENT_FONTS_KEY = 'pixelforge.fonts.recent.v1';
export const MAX_RECENT_FONTS = 12;
export const MAX_FAVOURITE_FONTS = 200;

/** Parse a stored family list, dropping malformed or duplicate entries. */
export function parseStoredFamilies(raw: unknown, limit: number): string[] {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const family of value) if (isFontFamilyName(family) && !out.includes(family) && out.length < limit) out.push(family);
  return out;
}

export function pushRecentFamily(recent: readonly string[], family: string): string[] {
  return [family, ...recent.filter((item) => item !== family)].slice(0, MAX_RECENT_FONTS);
}

export function toggleFavouriteFamily(favourites: readonly string[], family: string): string[] {
  return favourites.includes(family)
    ? favourites.filter((item) => item !== family)
    : [...favourites, family].slice(0, MAX_FAVOURITE_FONTS);
}

/** Simple windowing for the virtualised picker list. */
export function virtualWindow(total: number, scrollTop: number, viewport: number, rowHeight: number, overscan = 4): { start: number; end: number } {
  const safeRow = Math.max(1, rowHeight);
  const start = Math.min(total, Math.max(0, Math.floor(Math.max(0, scrollTop) / safeRow) - overscan));
  const end = Math.min(total, Math.ceil((Math.max(0, scrollTop) + Math.max(0, viewport)) / safeRow) + overscan);
  return { start, end: Math.max(start, end) };
}

/** Metadata JSON (coverage / icon names) for the Glyphs panel. */
export function fontMetaUrl(font: LibraryFont, base = '/fonts/'): string {
  return `${base}meta/${font.id}.json?v=${FONT_ASSET_VERSION}`;
}

/** Families (system + library) a document references that this build cannot render. */
export function missingFontFamilies(families: Iterable<string>): string[] {
  const missing = new Set<string>();
  for (const family of families) if (fontFamilyKind(family) === 'unknown') missing.add(family);
  return [...missing].sort();
}
