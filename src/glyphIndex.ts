/**
 * Pure glyph indexing for the Glyphs panel: Unicode blocks for symbol and
 * text fonts, and name/tag search for named icon fonts (Material Symbols,
 * Font Awesome, Weather Icons). Metadata comes from /fonts/meta/<id>.json,
 * generated at build time from each font's cmap (and GSUB/icon metadata).
 */

/** Unicode blocks (inclusive ranges) relevant to the bundled fonts. */
export const UNICODE_BLOCKS: readonly (readonly [number, number, string])[] = [
  [0x0020, 0x007f, 'Basic Latin'],
  [0x0080, 0x00ff, 'Latin-1 Supplement'],
  [0x0100, 0x017f, 'Latin Extended-A'],
  [0x0180, 0x024f, 'Latin Extended-B'],
  [0x0250, 0x02af, 'IPA Extensions'],
  [0x02b0, 0x02ff, 'Spacing Modifier Letters'],
  [0x0300, 0x036f, 'Combining Diacritical Marks'],
  [0x0370, 0x03ff, 'Greek and Coptic'],
  [0x0400, 0x04ff, 'Cyrillic'],
  [0x0500, 0x052f, 'Cyrillic Supplement'],
  [0x1d00, 0x1d7f, 'Phonetic Extensions'],
  [0x1e00, 0x1eff, 'Latin Extended Additional'],
  [0x1f00, 0x1fff, 'Greek Extended'],
  [0x2000, 0x206f, 'General Punctuation'],
  [0x2070, 0x209f, 'Superscripts and Subscripts'],
  [0x20a0, 0x20cf, 'Currency Symbols'],
  [0x20d0, 0x20ff, 'Combining Marks for Symbols'],
  [0x2100, 0x214f, 'Letterlike Symbols'],
  [0x2150, 0x218f, 'Number Forms'],
  [0x2190, 0x21ff, 'Arrows'],
  [0x2200, 0x22ff, 'Mathematical Operators'],
  [0x2300, 0x23ff, 'Miscellaneous Technical'],
  [0x2400, 0x243f, 'Control Pictures'],
  [0x2440, 0x245f, 'Optical Character Recognition'],
  [0x2460, 0x24ff, 'Enclosed Alphanumerics'],
  [0x2500, 0x257f, 'Box Drawing'],
  [0x2580, 0x259f, 'Block Elements'],
  [0x25a0, 0x25ff, 'Geometric Shapes'],
  [0x2600, 0x26ff, 'Miscellaneous Symbols'],
  [0x2700, 0x27bf, 'Dingbats'],
  [0x27c0, 0x27ef, 'Miscellaneous Mathematical Symbols-A'],
  [0x27f0, 0x27ff, 'Supplemental Arrows-A'],
  [0x2800, 0x28ff, 'Braille Patterns'],
  [0x2900, 0x297f, 'Supplemental Arrows-B'],
  [0x2980, 0x29ff, 'Miscellaneous Mathematical Symbols-B'],
  [0x2a00, 0x2aff, 'Supplemental Mathematical Operators'],
  [0x2b00, 0x2bff, 'Miscellaneous Symbols and Arrows'],
  [0x2c60, 0x2c7f, 'Latin Extended-C'],
  [0x2e00, 0x2e7f, 'Supplemental Punctuation'],
  [0x3000, 0x303f, 'CJK Symbols and Punctuation'],
  [0x4dc0, 0x4dff, 'Yijing Hexagram Symbols'],
  [0xa720, 0xa7ff, 'Latin Extended-D'],
  [0xe000, 0xf8ff, 'Private Use Area'],
  [0xfb00, 0xfb4f, 'Alphabetic Presentation Forms'],
  [0xfe00, 0xfe0f, 'Variation Selectors'],
  [0xfe30, 0xfe4f, 'CJK Compatibility Forms'],
  [0xff00, 0xffef, 'Halfwidth and Fullwidth Forms'],
  [0xfff0, 0xffff, 'Specials'],
  [0x10100, 0x1013f, 'Aegean Numbers'],
  [0x10140, 0x1018f, 'Ancient Greek Numbers'],
  [0x10190, 0x101cf, 'Ancient Symbols'],
  [0x101d0, 0x101ff, 'Phaistos Disc'],
  [0x1d000, 0x1d0ff, 'Byzantine Musical Symbols'],
  [0x1d100, 0x1d1ff, 'Musical Symbols'],
  [0x1d200, 0x1d24f, 'Ancient Greek Musical Notation'],
  [0x1d2e0, 0x1d2ff, 'Mayan Numerals'],
  [0x1d300, 0x1d35f, 'Tai Xuan Jing Symbols'],
  [0x1d360, 0x1d37f, 'Counting Rod Numerals'],
  [0x1d400, 0x1d7ff, 'Mathematical Alphanumeric Symbols'],
  [0x1ee00, 0x1eeff, 'Arabic Mathematical Alphabetic Symbols'],
  [0x1f000, 0x1f02f, 'Mahjong Tiles'],
  [0x1f030, 0x1f09f, 'Domino Tiles'],
  [0x1f0a0, 0x1f0ff, 'Playing Cards'],
  [0x1f100, 0x1f1ff, 'Enclosed Alphanumeric Supplement'],
  [0x1f200, 0x1f2ff, 'Enclosed Ideographic Supplement'],
  [0x1f300, 0x1f5ff, 'Miscellaneous Symbols and Pictographs'],
  [0x1f600, 0x1f64f, 'Emoticons'],
  [0x1f650, 0x1f67f, 'Ornamental Dingbats'],
  [0x1f680, 0x1f6ff, 'Transport and Map Symbols'],
  [0x1f700, 0x1f77f, 'Alchemical Symbols'],
  [0x1f780, 0x1f7ff, 'Geometric Shapes Extended'],
  [0x1f800, 0x1f8ff, 'Supplemental Arrows-C'],
  [0x1f900, 0x1f9ff, 'Supplemental Symbols and Pictographs'],
  [0x1fa00, 0x1fa6f, 'Chess Symbols'],
  [0x1fa70, 0x1faff, 'Symbols and Pictographs Extended-A'],
  [0x1fb00, 0x1fbff, 'Symbols for Legacy Computing'],
];

export function unicodeBlockOf(cp: number): string {
  let low = 0;
  let high = UNICODE_BLOCKS.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const [start, end, name] = UNICODE_BLOCKS[mid];
    if (cp < start) high = mid - 1;
    else if (cp > end) low = mid + 1;
    else return name;
  }
  return 'Other';
}

export type GlyphMeta = {
  family: string;
  ranges: [number, number][];
  /** Named icons: [name, codepoint, search terms]. */
  icons?: [string, number, string][];
};

const MAX_CODEPOINT = 0x10ffff;

/** Validate untrusted metadata JSON; returns undefined when malformed. */
export function parseGlyphMeta(value: unknown): GlyphMeta | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const meta = value as Partial<GlyphMeta>;
  if (typeof meta.family !== 'string' || !Array.isArray(meta.ranges)) return undefined;
  const ranges: [number, number][] = [];
  for (const range of meta.ranges) {
    if (!Array.isArray(range) || range.length !== 2) return undefined;
    const [start, end] = range;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > MAX_CODEPOINT) return undefined;
    ranges.push([start, end]);
  }
  let icons: [string, number, string][] | undefined;
  if (meta.icons !== undefined) {
    if (!Array.isArray(meta.icons)) return undefined;
    icons = [];
    for (const icon of meta.icons) {
      if (!Array.isArray(icon) || typeof icon[0] !== 'string' || !Number.isInteger(icon[1]) || icon[1] < 0 || icon[1] > MAX_CODEPOINT) return undefined;
      icons.push([icon[0].slice(0, 80), icon[1], typeof icon[2] === 'string' ? icon[2].slice(0, 400) : '']);
    }
  }
  return { family: meta.family, ranges, ...(icons ? { icons } : {}) };
}

export type GlyphItem = { cp: number; char: string; name: string; block: string };

const isInsertable = (cp: number) =>
  cp > 0x20 && !(cp >= 0x7f && cp <= 0xa0) && !(cp >= 0x300 && cp <= 0x36f) && !(cp >= 0xfe00 && cp <= 0xfe0f) && cp !== 0xad && !(cp >= 0x200b && cp <= 0x200f) && !(cp >= 0x2028 && cp <= 0x202e) && !(cp >= 0x2060 && cp <= 0x206f) && cp !== 0xfeff;

export function codepointLabel(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

/** Blocks present in a font's coverage, in Unicode order, with glyph counts. */
export function glyphBlocks(meta: GlyphMeta): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const [start, end] of meta.ranges)
    for (let cp = start; cp <= end; cp += 1) if (isInsertable(cp)) counts.set(unicodeBlockOf(cp), (counts.get(unicodeBlockOf(cp)) ?? 0) + 1);
  const order = UNICODE_BLOCKS.map(([, , name]) => name);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => {
    const ai = order.indexOf(a.name);
    const bi = order.indexOf(b.name);
    return (ai < 0 ? 1e9 : ai) - (bi < 0 ? 1e9 : bi);
  });
}

export type GlyphQuery = { query?: string; block?: string; limit?: number };

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, ' ').trim();
}

/**
 * Search a font's glyphs. Named fonts match icon names and tags; others match
 * block names, "U+2605"/"2605" codepoints or the character itself.
 */
export function searchGlyphs(meta: GlyphMeta, options: GlyphQuery = {}): { items: GlyphItem[]; total: number } {
  const limit = Math.max(1, Math.min(2000, options.limit ?? 300));
  const query = normalize(options.query ?? '');
  const terms = query ? query.split(/\s+/) : [];
  const items: GlyphItem[] = [];
  let total = 0;
  const push = (item: GlyphItem) => {
    total += 1;
    if (items.length < limit) items.push(item);
  };
  if (meta.icons) {
    const matches: GlyphItem[] = [];
    for (const [name, cp, tags] of meta.icons) {
      const block = unicodeBlockOf(cp);
      if (options.block && options.block !== block) continue;
      const haystack = `${normalize(name)} ${tags.toLowerCase()}`;
      if (terms.length && !terms.every((term) => haystack.includes(term))) continue;
      matches.push({ cp, char: String.fromCodePoint(cp), name, block });
    }
    // Exact name matches, then name matches, then tag-only matches, so
    // "home" finds the home icon before "home_work" or tagged icons.
    if (terms.length) {
      const rank = (item: GlyphItem) => {
        const name = normalize(item.name);
        return name === query ? 0 : terms.every((term) => name.includes(term)) ? 1 : 2;
      };
      matches.sort((a, b) => rank(a) - rank(b));
    }
    return { items: matches.slice(0, limit), total: matches.length };
  }
  const hex = /^(?:u\+|0x)?([0-9a-f]{2,6})$/i.exec(query.replace(/\s+/g, ''));
  const hexCp = hex ? Number.parseInt(hex[1], 16) : undefined;
  const literal = options.query && Array.from(options.query.trim()).length === 1 ? options.query.trim().codePointAt(0) : undefined;
  for (const [start, end] of meta.ranges)
    for (let cp = start; cp <= end; cp += 1) {
      if (!isInsertable(cp)) continue;
      const block = unicodeBlockOf(cp);
      if (options.block && options.block !== block) continue;
      if (terms.length) {
        const matches =
          cp === hexCp || cp === literal || terms.every((term) => block.toLowerCase().includes(term)) || codepointLabel(cp).toLowerCase() === query;
        if (!matches) continue;
      }
      push({ cp, char: String.fromCodePoint(cp), name: `${codepointLabel(cp)} · ${block}`, block });
    }
  return { items, total };
}

/** Parse a CSS unicode-range descriptor ("U+0000-00FF,U+0131") into ranges. */
export function parseUnicodeRange(value: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const part of value.split(',')) {
    const match = /^\s*U\+([0-9a-f]{1,6})(?:-([0-9a-f]{1,6}))?\s*$/i.exec(part);
    if (!match) continue;
    const start = Number.parseInt(match[1], 16);
    const end = match[2] ? Number.parseInt(match[2], 16) : start;
    if (end >= start && end <= MAX_CODEPOINT) ranges.push([start, end]);
  }
  return ranges;
}

/**
 * Keep only glyphs a shipped face will actually render: subset files carry
 * extra glyphs outside their unicode-range, which the browser never uses.
 * `faceRanges` undefined means a single file covering everything.
 */
export function restrictGlyphMeta(meta: GlyphMeta, faceRanges: readonly string[] | undefined): GlyphMeta {
  if (!faceRanges) return meta;
  const allowed = faceRanges.flatMap(parseUnicodeRange);
  const ranges: [number, number][] = [];
  for (const [start, end] of meta.ranges)
    for (const [low, high] of allowed) {
      const from = Math.max(start, low);
      const to = Math.min(end, high);
      if (from <= to) ranges.push([from, to]);
    }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1] + 1) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return { ...meta, ranges: merged };
}
