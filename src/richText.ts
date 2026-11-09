/**
 * Versioned rich-text model, layout and caret geometry for editable type
 * layers.
 *
 * A text layer keeps its plain `text` string (so find/replace, spell check,
 * CSS export and older readers keep working) plus an optional `rich` record
 * of character-style runs. Each run covers `length` UTF-16 code units and
 * stores only the attributes that differ from the layer's base style, so a
 * layer-wide change (Layers panel size, Update All Text Layers) still applies
 * to every character without an override. A missing `rich` record is the
 * legacy single-run document and renders exactly as before.
 *
 * Layout is DOM-independent: callers inject a `measure(font, text)` function
 * (Canvas `measureText` in the browser, a deterministic fake in tests). It is
 * a bounded local approximation of Photoshop point/paragraph type, not a full
 * OpenType/bidi shaping engine.
 */

export const RICH_TEXT_VERSION = 1;
export const MAX_TEXT_LENGTH = 10000;
export const MAX_TEXT_RUNS = 2000;
export const TEXT_MODES = ['point', 'paragraph'] as const;
export type TextMode = (typeof TEXT_MODES)[number];
export const TEXT_ANTI_ALIAS = ['none', 'sharp', 'crisp', 'strong', 'smooth'] as const;
export type TextAntiAlias = (typeof TEXT_ANTI_ALIAS)[number];
export const TEXT_CAPS = ['normal', 'all-caps', 'small-caps'] as const;
export type TextCaps = (typeof TEXT_CAPS)[number];
export const TEXT_SCRIPTS = ['normal', 'superscript', 'subscript'] as const;
export type TextScript = (typeof TEXT_SCRIPTS)[number];
export const TEXT_KERNING = ['auto', 'metrics', 'none'] as const;
export type TextKerning = (typeof TEXT_KERNING)[number];
export const TEXT_JUSTIFY = ['none', 'left', 'center', 'right', 'all'] as const;
/** `none` keeps ragged lines; the other values justify and set the last line. */
export type TextJustify = (typeof TEXT_JUSTIFY)[number];
export const TEXT_LISTS = ['none', 'bullet', 'number'] as const;
export type TextList = (typeof TEXT_LISTS)[number];
export const TEXT_FIT = ['none', 'shrink', 'fit'] as const;
/** Bounded "dynamic text": scale type so a paragraph box stays filled. */
export type TextFit = (typeof TEXT_FIT)[number];
export type Align = 'left' | 'center' | 'right';

/** Fully resolved character style used by layout and rendering. */
export type CharacterStyle = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  color: string;
  /** Extra advance in 1/1000 em, added to the layer letter spacing. */
  tracking: number;
  /** Layer letter spacing in pixels (not overridable per run). */
  letterSpacing: number;
  baselineShift: number;
  script: TextScript;
  caps: TextCaps;
  /** Horizontal and vertical glyph scale in percent. */
  scaleX: number;
  scaleY: number;
  /** Line height multiplier of the font size. */
  leading: number;
  kerning: TextKerning;
};

/** Character attributes a run may override. */
export type RunStyle = Partial<Omit<CharacterStyle, 'letterSpacing'>>;
export type TextRun = { length: number; style?: RunStyle };
export type RichText = { version: typeof RICH_TEXT_VERSION; runs: TextRun[] };

export type ParagraphSettings = {
  justify: TextJustify;
  indentLeft: number;
  indentRight: number;
  indentFirst: number;
  spaceBefore: number;
  spaceAfter: number;
  list: TextList;
};

export const DEFAULT_PARAGRAPH: Readonly<ParagraphSettings> = Object.freeze({
  justify: 'none' as const,
  indentLeft: 0,
  indentRight: 0,
  indentFirst: 0,
  spaceBefore: 0,
  spaceAfter: 0,
  list: 'none' as const,
});

/** The text-layer fields this module reads. */
export type RichTextSource = {
  text: string;
  color: string;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  boxWidth?: number;
  boxHeight?: number;
  textAlign?: Align;
  lineHeight?: number;
  letterSpacing?: number;
  orientation?: 'horizontal' | 'vertical';
  textMode?: TextMode;
  rich?: RichText;
  paragraph?: Partial<ParagraphSettings>;
  fit?: TextFit;
  openType?: { kerning?: string; smallCaps?: boolean };
};

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const inRange = (value: unknown, min: number, max: number) =>
  finite(value) && value >= min && value <= max;
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Font family names allowed in runs: printable, no quotes/escapes, bounded. */
export function validFontFamilyName(value: unknown): value is string {
  return typeof value === 'string' && /^[\p{L}\p{N} _.,&()+-]{1,64}$/u.test(value) && value.trim() === value;
}
export const validHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value);

const RUN_STYLE_CHECKS: { [K in keyof Required<RunStyle>]: (value: unknown) => boolean } = {
  fontFamily: validFontFamilyName,
  fontSize: (v) => inRange(v, 1, 1000),
  fontWeight: (v) => inRange(v, 100, 900) && Number.isInteger(v),
  italic: (v) => typeof v === 'boolean',
  underline: (v) => typeof v === 'boolean',
  strikethrough: (v) => typeof v === 'boolean',
  color: validHexColor,
  tracking: (v) => inRange(v, -1000, 2000),
  baselineShift: (v) => inRange(v, -1000, 1000),
  script: (v) => TEXT_SCRIPTS.includes(v as TextScript),
  caps: (v) => TEXT_CAPS.includes(v as TextCaps),
  scaleX: (v) => inRange(v, 10, 1000),
  scaleY: (v) => inRange(v, 10, 1000),
  leading: (v) => inRange(v, 0.5, 4),
  kerning: (v) => TEXT_KERNING.includes(v as TextKerning),
};
export const RUN_STYLE_KEYS = Object.keys(RUN_STYLE_CHECKS) as (keyof RunStyle)[];

export function validRunStyle(value: unknown): value is RunStyle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= RUN_STYLE_KEYS.length && entries.every(([key, item]) =>
    Object.hasOwn(RUN_STYLE_CHECKS, key) && RUN_STYLE_CHECKS[key as keyof RunStyle](item));
}

/** Strict persisted validation; total run length must equal the text length. */
export function validRichText(value: unknown, textLength: number): value is RichText {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== RICH_TEXT_VERSION || !Array.isArray(candidate.runs)) return false;
  if (Object.keys(candidate).some((key) => key !== 'version' && key !== 'runs')) return false;
  const runs = candidate.runs as unknown[];
  if (runs.length > MAX_TEXT_RUNS) return false;
  let total = 0;
  for (const run of runs) {
    if (!run || typeof run !== 'object' || Array.isArray(run)) return false;
    const item = run as Record<string, unknown>;
    if (!Number.isInteger(item.length) || (item.length as number) < 1 || (item.length as number) > MAX_TEXT_LENGTH) return false;
    if (Object.keys(item).some((key) => key !== 'length' && key !== 'style')) return false;
    if (item.style !== undefined && !validRunStyle(item.style)) return false;
    total += item.length as number;
  }
  return total === textLength;
}

export function validParagraphSettings(value: unknown): value is ParagraphSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return TEXT_JUSTIFY.includes(v.justify as TextJustify) &&
    inRange(v.indentLeft, -2000, 2000) && inRange(v.indentRight, -2000, 2000) &&
    inRange(v.indentFirst, -2000, 2000) && inRange(v.spaceBefore, 0, 2000) &&
    inRange(v.spaceAfter, 0, 2000) && TEXT_LISTS.includes(v.list as TextList) &&
    Object.keys(v).every((key) => key in DEFAULT_PARAGRAPH);
}

export function normalizeParagraph(value: Partial<ParagraphSettings> | undefined): ParagraphSettings {
  const v = value && typeof value === 'object' ? value : {};
  const num = (item: unknown, fallback: number, min: number, max: number) =>
    finite(item) ? clamp(item, min, max) : fallback;
  return {
    justify: TEXT_JUSTIFY.includes(v.justify as TextJustify) ? v.justify as TextJustify : 'none',
    indentLeft: num(v.indentLeft, 0, -2000, 2000),
    indentRight: num(v.indentRight, 0, -2000, 2000),
    indentFirst: num(v.indentFirst, 0, -2000, 2000),
    spaceBefore: num(v.spaceBefore, 0, 0, 2000),
    spaceAfter: num(v.spaceAfter, 0, 0, 2000),
    list: TEXT_LISTS.includes(v.list as TextList) ? v.list as TextList : 'none',
  };
}

/** Base style of a layer (what a run without overrides renders with). */
export function baseCharacterStyle(layer: RichTextSource): CharacterStyle {
  return {
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    fontWeight: layer.bold ? 700 : 400,
    italic: false,
    underline: false,
    strikethrough: false,
    color: layer.color,
    tracking: 0,
    letterSpacing: finite(layer.letterSpacing) ? layer.letterSpacing : 0,
    baselineShift: 0,
    script: 'normal',
    // Layer-wide OpenType small caps/kerning are applied by the Canvas context.
    caps: 'normal',
    scaleX: 100,
    scaleY: 100,
    leading: Math.max(0.5, finite(layer.lineHeight) ? layer.lineHeight : 1.2),
    kerning: 'auto',
  };
}

/**
 * Bounded approximation of Photoshop's type anti-aliasing methods as an alpha
 * transfer curve: None is binary, Sharp and Crisp raise edge contrast, Strong
 * thickens coverage and Smooth keeps the browser rasterizer's coverage.
 */
export function textAntiAliasAlpha(mode: TextAntiAlias, alpha: number): number {
  const a = clamp(Math.round(alpha), 0, 255);
  if (mode === 'none') return a >= 128 ? 255 : 0;
  if (mode === 'sharp') return clamp(Math.round(((a - 80) * 255) / 95), 0, 255);
  if (mode === 'crisp') return clamp(Math.round(((a - 40) * 255) / 175), 0, 255);
  if (mode === 'strong') return clamp(Math.round(255 * Math.pow(a / 255, 0.55)), 0, 255);
  return a;
}

export function resolveStyle(base: CharacterStyle, override?: RunStyle): CharacterStyle {
  return override ? { ...base, ...override } : base;
}

const sameStyle = (a?: RunStyle, b?: RunStyle) => {
  const left = a ?? {}, right = b ?? {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys)
    if ((left as Record<string, unknown>)[key] !== (right as Record<string, unknown>)[key]) return false;
  return true;
};
const cleanStyle = (style?: RunStyle): RunStyle | undefined => {
  if (!style) return undefined;
  const out: RunStyle = {};
  for (const key of RUN_STYLE_KEYS) {
    const value = style[key];
    if (value !== undefined && RUN_STYLE_CHECKS[key](value)) (out as Record<string, unknown>)[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
};

/**
 * Repair runs so they cover exactly `textLength` units: drop empty/invalid
 * entries, extend or truncate the tail, merge equal neighbours and drop
 * overrides that equal nothing. Always returns at least one run when the text
 * is non-empty.
 */
export function normalizeRuns(runs: readonly TextRun[] | undefined, textLength: number): TextRun[] {
  const out: TextRun[] = [];
  let total = 0;
  for (const run of runs ?? []) {
    if (total >= textLength) break;
    if (!run || !Number.isInteger(run.length) || run.length < 1) continue;
    const length = Math.min(run.length, textLength - total);
    const style = cleanStyle(run.style);
    const last = out[out.length - 1];
    if (last && sameStyle(last.style, style)) last.length += length;
    else out.push(style ? { length, style } : { length });
    total += length;
  }
  if (total < textLength) {
    const last = out[out.length - 1];
    if (last) last.length += textLength - total;
    else out.push({ length: textLength });
  }
  return out;
}

/** Runs of a layer, migrating a legacy plain-text layer to one run. */
export function layerRuns(layer: Pick<RichTextSource, 'text' | 'rich'>): TextRun[] {
  return normalizeRuns(layer.rich?.runs, layer.text.length);
}

/** Persistable rich record, or undefined when every run is unstyled. */
export function richRecord(runs: readonly TextRun[], textLength: number): RichText | undefined {
  const normalized = normalizeRuns(runs, textLength);
  if (normalized.length > MAX_TEXT_RUNS) throw new Error(`Text supports at most ${MAX_TEXT_RUNS} style runs`);
  return normalized.some((run) => run.style) ? { version: RICH_TEXT_VERSION, runs: normalized } : undefined;
}

/** Split runs so that `offset` falls on a boundary. */
function splitAt(runs: TextRun[], offset: number): TextRun[] {
  const out: TextRun[] = [];
  let position = 0;
  for (const run of runs) {
    const end = position + run.length;
    if (offset > position && offset < end) {
      out.push({ ...run, length: offset - position }, { ...run, length: end - offset });
    } else out.push({ ...run });
    position = end;
  }
  return out;
}

/** Override style on [start,end). A patch value of `undefined` clears that override. */
export function styleRange(
  runs: readonly TextRun[],
  textLength: number,
  start: number,
  end: number,
  patch: { [K in keyof RunStyle]?: RunStyle[K] | undefined },
): TextRun[] {
  const from = clamp(Math.min(start, end), 0, textLength), to = clamp(Math.max(start, end), 0, textLength);
  let working = normalizeRuns(runs, textLength);
  if (from === to) return working;
  working = splitAt(splitAt(working, from), to);
  let position = 0;
  const out = working.map((run) => {
    const runStart = position;
    position += run.length;
    if (runStart < from || runStart >= to) return run;
    const style: Record<string, unknown> = { ...run.style };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete style[key];
      else style[key] = value;
    }
    return { length: run.length, style: style as RunStyle };
  });
  return normalizeRuns(out, textLength);
}

/** Style override of the character at `offset` (clamped). */
export function runStyleAt(runs: readonly TextRun[], offset: number): RunStyle | undefined {
  let position = 0;
  for (const run of runs) {
    if (offset < position + run.length) return run.style;
    position += run.length;
  }
  return runs[runs.length - 1]?.style;
}

/** Style newly typed text inherits: the character before the caret. */
export function typingStyleAt(runs: readonly TextRun[], caret: number): RunStyle | undefined {
  return runStyleAt(runs, Math.max(0, caret - 1));
}

/**
 * Rebase runs after a plain-text edit (typing, paste, find/replace). The
 * changed region is found by common prefix/suffix; inserted text takes
 * `insertStyle` or the style of the character before the edit.
 */
export function remapRuns(
  oldText: string,
  newText: string,
  runs: readonly TextRun[] | undefined,
  insertStyle?: RunStyle | null,
): TextRun[] {
  const normalized = normalizeRuns(runs, oldText.length);
  if (oldText === newText) return normalized;
  let prefix = 0;
  const max = Math.min(oldText.length, newText.length);
  while (prefix < max && oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)) prefix++;
  let suffix = 0;
  while (
    suffix < max - prefix &&
    oldText.charCodeAt(oldText.length - 1 - suffix) === newText.charCodeAt(newText.length - 1 - suffix)
  ) suffix++;
  const removedEnd = oldText.length - suffix, insertedLength = newText.length - suffix - prefix;
  const style = insertStyle === null ? undefined : insertStyle ?? (prefix > 0
    ? runStyleAt(normalized, prefix - 1)
    : runStyleAt(normalized, 0));
  const out: TextRun[] = [];
  let position = 0;
  let inserted = false;
  const insert = () => {
    if (!inserted && insertedLength > 0) out.push(style ? { length: insertedLength, style } : { length: insertedLength });
    inserted = true;
  };
  for (const run of normalized) {
    const start = position, end = position + run.length;
    position = end;
    // Keep the part before the removed region.
    if (start < prefix) out.push({ ...run, length: Math.min(end, prefix) - start });
    if (end >= prefix && !inserted && start <= prefix) insert();
    // Keep the part after the removed region.
    if (end > removedEnd) out.push({ ...run, length: end - Math.max(start, removedEnd) });
  }
  insert();
  return normalizeRuns(out, newText.length);
}

/** Replace [start,end) with `insertLength` units styled `style`. */
export function replaceRange(
  runs: readonly TextRun[],
  textLength: number,
  start: number,
  end: number,
  insertLength: number,
  style?: RunStyle,
): TextRun[] {
  const from = clamp(Math.min(start, end), 0, textLength), to = clamp(Math.max(start, end), 0, textLength);
  const working = splitAt(splitAt(normalizeRuns(runs, textLength), from), to);
  const out: TextRun[] = [];
  let position = 0, inserted = false;
  for (const run of working) {
    const runStart = position;
    position += run.length;
    if (runStart >= from && !inserted) {
      if (insertLength > 0) out.push(style ? { length: insertLength, style } : { length: insertLength });
      inserted = true;
    }
    if (runStart < from || runStart >= to) out.push(run);
  }
  if (!inserted && insertLength > 0) out.push(style ? { length: insertLength, style } : { length: insertLength });
  return normalizeRuns(out, textLength - (to - from) + insertLength);
}

/** Uniform value of each attribute over [start,end), or 'mixed'. */
export function commonStyle(
  layer: RichTextSource,
  start: number,
  end: number,
): { [K in keyof CharacterStyle]: CharacterStyle[K] | 'mixed' } {
  const base = baseCharacterStyle(layer), runs = layerRuns(layer);
  const from = Math.min(start, end), to = Math.max(start, end);
  const result = { ...base } as { [K in keyof CharacterStyle]: CharacterStyle[K] | 'mixed' };
  if (from === to) return { ...resolveStyle(base, typingStyleAt(runs, from)) };
  let position = 0, first = true;
  for (const run of runs) {
    const runStart = position;
    position += run.length;
    if (position <= from || runStart >= to) continue;
    const style = resolveStyle(base, run.style);
    for (const key of Object.keys(style) as (keyof CharacterStyle)[]) {
      if (first) (result as Record<string, unknown>)[key] = style[key];
      else if (result[key] !== style[key]) (result as Record<string, unknown>)[key] = 'mixed';
    }
    first = false;
  }
  return result;
}

// ---------------------------------------------------------------- layout

export type MeasureFn = ((font: string, text: string) => number) & { cacheKey?: string };

/** Effective rendered font size after super/subscript and small caps. */
export function renderedFontSize(style: CharacterStyle): number {
  return style.script === 'normal' ? style.fontSize : style.fontSize * 0.58;
}

/** CSS font shorthand for Canvas. */
export function fontCss(style: CharacterStyle, sizeOverride?: number): string {
  const size = Math.max(0.5, sizeOverride ?? renderedFontSize(style));
  return `${style.italic ? 'italic ' : ''}${Math.round(style.fontWeight)} ${Number(size.toFixed(3))}px "${style.fontFamily}"`;
}

/** Glyph shown for a character after caps transforms. */
export function displayText(text: string, style: CharacterStyle): string {
  return style.caps === 'all-caps' ? text.toUpperCase() : text;
}

/** Vertical offset (positive = down) of a script or baseline shift. */
export function baselineOffset(style: CharacterStyle): number {
  const script = style.script === 'superscript'
    ? -style.fontSize * 0.33
    : style.script === 'subscript' ? style.fontSize * 0.33 : 0;
  return script - style.baselineShift;
}

/** Extra advance after each glyph in pixels. */
export function glyphSpacing(style: CharacterStyle): number {
  return style.letterSpacing + (style.tracking * style.fontSize) / 1000;
}

export type LayoutSegment = {
  start: number;
  end: number;
  /** Left edge in layer-local pixels. */
  x: number;
  width: number;
  style: CharacterStyle;
  /** Text to draw (caps applied); one entry per code point in `glyphs`. */
  text: string;
  /** Per code point left x positions (absolute) and widths, for per-glyph drawing. */
  glyphs: { offset: number; x: number; width: number; text: string }[];
  /** True when the segment must be drawn glyph by glyph (tracking/justify). */
  perGlyph: boolean;
};

export type LayoutLine = {
  start: number;
  /** End offset, excluding the newline that terminates the paragraph. */
  end: number;
  /** Top of the line box in layer-local pixels. */
  y: number;
  height: number;
  /** Largest rendered font size on the line, used for baseline alignment. */
  size: number;
  x: number;
  width: number;
  paragraph: number;
  segments: LayoutSegment[];
  /** Caret x for every code-point boundary offset in [start, end]. */
  carets: { offset: number; x: number }[];
  marker?: { text: string; x: number; style: CharacterStyle };
  /** True when the line ends with a hard newline. */
  hardBreak: boolean;
};

export type TextLayout = {
  lines: LayoutLine[];
  /** Content bounds in layer-local pixels. */
  left: number;
  width: number;
  height: number;
  boxWidth: number;
  boxHeight?: number;
  /** True when paragraph text does not fit its box height. */
  overflow: boolean;
  /** Offset of the first character that is hidden by overflow. */
  overflowOffset?: number;
  scale: number;
  mode: TextMode | 'legacy';
  vertical: boolean;
  direction: 'ltr' | 'rtl';
};

export type LayoutOptions = {
  measure: MeasureFn;
  direction?: 'ltr' | 'rtl';
  /** Uniform font scale (dynamic text); default 1. */
  scale?: number;
};

/** Marker for list item `index` (0-based). */
export function listMarker(kind: TextList, index: number): string {
  if (kind === 'bullet') return '•';
  if (kind === 'number') return `${index + 1}.`;
  return '';
}

/** Small LRU-free bounded cache of glyph widths per font. */
const widthCache = new Map<string, number>();
const WIDTH_CACHE_LIMIT = 20000;
function cachedWidth(measure: MeasureFn, font: string, text: string): number {
  // Context features (small caps, kerning, ligatures) change widths; a measure
  // function may name them in `cacheKey` so cached widths never mix.
  const key = (measure.cacheKey ?? '') + '\u0001' + font + '\u0000' + text;
  const hit = widthCache.get(key);
  if (hit !== undefined) return hit;
  const value = measure(font, text);
  if (widthCache.size > WIDTH_CACHE_LIMIT) widthCache.clear();
  widthCache.set(key, value);
  return value;
}
/** Clear measured widths, e.g. after a web font finishes loading. */
export function clearTextMeasureCache() {
  widthCache.clear();
}

type Cell = { offset: number; length: number; text: string; style: CharacterStyle; styleIndex: number; width: number; advance: number; space: boolean };

const isBreakSpace = (text: string) => /^\s$/u.test(text) && text !== ' ';
/** CJK characters may break anywhere. */
const isIdeographic = (text: string) => /[぀-ヿ㐀-鿿가-힯豈-﫿]/u.test(text);

function scaledStyle(style: CharacterStyle, scale: number): CharacterStyle {
  if (scale === 1) return style;
  return { ...style, fontSize: style.fontSize * scale, baselineShift: style.baselineShift * scale, letterSpacing: style.letterSpacing * scale };
}

function buildCells(text: string, runs: TextRun[], base: CharacterStyle, measure: MeasureFn, scale: number): { cells: Cell[]; styles: CharacterStyle[] } {
  const styles: CharacterStyle[] = runs.map((run) => scaledStyle(resolveStyle(base, run.style), scale));
  const cells: Cell[] = [];
  let runIndex = 0, runEnd = runs[0]?.length ?? text.length;
  let offset = 0;
  for (const char of text) {
    while (offset >= runEnd && runIndex < runs.length - 1) {
      runIndex++;
      runEnd += runs[runIndex].length;
    }
    const style = styles[runIndex] ?? scaledStyle(base, scale);
    const shown = displayText(char, style);
    const smallCaps = style.caps === 'small-caps' && shown !== shown.toUpperCase();
    const font = fontCss(style, smallCaps ? renderedFontSize(style) * 0.75 : undefined);
    const width = char === '\n' ? 0 : cachedWidth(measure, font, smallCaps ? shown.toUpperCase() : shown) * (style.scaleX / 100);
    cells.push({
      offset,
      length: char.length,
      text: char,
      style,
      styleIndex: runIndex,
      width,
      advance: width + (char === '\n' ? 0 : glyphSpacing(style)),
      space: isBreakSpace(char),
    });
    offset += char.length;
  }
  return { cells, styles };
}

/**
 * Lay out a text layer into lines, segments and caret stops in layer-local
 * pixels. Horizontal only; vertical text uses `layoutVerticalText`.
 */
export function layoutRichText(layer: RichTextSource, options: LayoutOptions): TextLayout {
  if (layer.orientation === 'vertical') return layoutVerticalText(layer, options);
  const scale = options.scale ?? 1;
  const measure = options.measure;
  const direction = options.direction ?? 'ltr';
  const base = baseCharacterStyle(layer);
  const runs = layerRuns(layer);
  const paragraph = normalizeParagraph(layer.paragraph);
  const mode: TextLayout['mode'] = layer.textMode ?? 'legacy';
  const boxWidth = Math.max(1, layer.boxWidth ?? 640);
  const wrap = mode === 'paragraph';
  const align: Align = layer.textAlign ?? 'left';
  const { cells } = buildCells(layer.text, runs, base, measure, scale);
  const lines: LayoutLine[] = [];
  const listIndent = paragraph.list === 'none' ? 0 : base.fontSize * scale * 1.5;
  // Split cells into paragraphs.
  const paragraphs: Cell[][] = [[]];
  for (const cell of cells) {
    if (cell.text === '\n') paragraphs.push([]);
    else paragraphs[paragraphs.length - 1].push(cell);
  }
  let paragraphStart = 0;
  let y = 0;
  let listIndex = 0;
  for (const [pIndex, cellsOfParagraph] of paragraphs.entries()) {
    if (pIndex > 0) y += paragraph.spaceBefore * scale;
    const indentLeft = paragraph.indentLeft * scale + listIndent;
    const indentRight = paragraph.indentRight * scale;
    const pieces: Cell[][] = [];
    if (!wrap || !cellsOfParagraph.length) pieces.push(cellsOfParagraph);
    else {
      let line: Cell[] = [], width = 0, lastBreak = -1;
      for (const cell of cellsOfParagraph) {
        const first = pieces.length === 0;
        const available = Math.max(1, boxWidth - indentLeft - indentRight - (first ? paragraph.indentFirst * scale : 0));
        // Trailing spaces never force a wrap.
        if (line.length && !cell.space && width + cell.width > available + 0.01) {
          if (lastBreak >= 0 && lastBreak < line.length - 1) {
            pieces.push(line.slice(0, lastBreak + 1));
            line = line.slice(lastBreak + 1);
          } else if (lastBreak === line.length - 1) {
            pieces.push(line);
            line = [];
          } else {
            pieces.push(line);
            line = [];
          }
          width = line.reduce((sum, item) => sum + item.advance, 0);
          lastBreak = -1;
          line.forEach((item, index) => { if (item.space || isIdeographic(item.text)) lastBreak = index; });
        }
        line.push(cell);
        width += cell.advance;
        if (cell.space || isIdeographic(cell.text)) lastBreak = line.length - 1;
      }
      pieces.push(line);
    }
    const paragraphEnd = paragraphStart + cellsOfParagraph.reduce((sum, cell) => sum + cell.length, 0);
    for (const [lineInParagraph, piece] of pieces.entries()) {
      const start = piece[0]?.offset ?? (lineInParagraph === 0 ? paragraphStart : paragraphEnd);
      const last = piece[piece.length - 1];
      const end = last ? last.offset + last.length : start;
      const firstLine = lineInParagraph === 0;
      const lastLine = lineInParagraph === pieces.length - 1;
      // Paragraph text lets trailing whitespace hang outside the measured width.
      let contentCount = piece.length;
      if (mode !== 'legacy') while (contentCount > 0 && piece[contentCount - 1].space) contentCount--;
      const lineIndent = indentLeft + (firstLine ? paragraph.indentFirst * scale : 0);
      const available = Math.max(1, boxWidth - lineIndent - indentRight);
      let lineAlign: Align | 'justify' = align;
      if (paragraph.justify !== 'none' && wrap) {
        if (!lastLine) lineAlign = 'justify';
        else lineAlign = paragraph.justify === 'all' ? 'justify' : paragraph.justify;
      }
      const naturalWidth = piece.slice(0, contentCount).reduce((sum, cell, index) =>
        sum + (index === contentCount - 1 ? cell.width : cell.advance), 0);
      const spaces = piece.slice(0, contentCount).filter((cell) => cell.space).length;
      const gap = lineAlign === 'justify' && spaces > 0 ? Math.max(0, (available - naturalWidth) / spaces) : 0;
      // Pass 1: glyph positions from x = 0.
      const carets: { offset: number; x: number }[] = [];
      const segments: LayoutSegment[] = [];
      let x = 0;
      for (const [index, cell] of piece.entries()) {
        const perGlyph = gap > 0 || glyphSpacing(cell.style) !== 0 || cell.style.caps === 'small-caps' ||
          cell.style.scaleX !== 100 || cell.style.scaleY !== 100;
        let segment = segments[segments.length - 1];
        if (!segment || segment.style !== cell.style) {
          segment = { start: cell.offset, end: cell.offset, x, width: 0, style: cell.style, text: '', glyphs: [], perGlyph };
          segments.push(segment);
        }
        const shown = displayText(cell.text, cell.style);
        segment.end = cell.offset + cell.length;
        segment.text += shown;
        segment.glyphs.push({ offset: cell.offset, x, width: cell.width, text: shown });
        segment.perGlyph ||= perGlyph;
        x += (index === piece.length - 1 ? cell.width : cell.advance) + (cell.space && index < contentCount ? gap : 0);
        segment.width = x - segment.x;
      }
      // Pass 2: whole-run measurement keeps kerning for runs drawn in one call.
      let shift = 0;
      for (const segment of segments) {
        segment.x += shift;
        for (const glyph of segment.glyphs) glyph.x += shift;
        if (segment.perGlyph || !segment.text) continue;
        const whole = cachedWidth(measure, fontCss(segment.style), segment.text);
        const sum = segment.glyphs.reduce((total, glyph) => total + glyph.width, 0);
        if (sum > 0 && whole > 0 && Math.abs(whole - sum) > 0.001) {
          const ratio = whole / sum;
          for (const glyph of segment.glyphs) {
            glyph.x = segment.x + (glyph.x - segment.x) * ratio;
            glyph.width *= ratio;
          }
          shift += whole - sum;
          segment.width = whole;
        }
      }
      for (const segment of segments) for (const glyph of segment.glyphs) carets.push({ offset: glyph.offset, x: glyph.x });
      const lastSegment = segments[segments.length - 1];
      const lineEndX = lastSegment ? lastSegment.x + lastSegment.width : 0;
      carets.push({ offset: end, x: lineEndX });
      const contentWidth = contentCount === piece.length
        ? lineEndX
        : (carets.find((caret) => caret.offset === piece[contentCount]?.offset)?.x ?? lineEndX);
      const alignFor = lineAlign === 'justify' ? 'left' : lineAlign;
      let x0: number;
      if (mode === 'point') x0 = lineIndent;
      else {
        const room = (mode === 'legacy' ? boxWidth : available) - contentWidth;
        x0 = (mode === 'legacy' ? 0 : lineIndent) + (alignFor === 'center' ? room / 2 : alignFor === 'right' ? room : 0);
      }
      if (direction === 'rtl' && mode === 'paragraph' && lineAlign === 'left' && paragraph.justify === 'none')
        x0 = lineIndent + available - contentWidth;
      const size = piece.reduce((max, cell) => Math.max(max, renderedFontSize(cell.style)), 0) || renderedFontSize(scaledStyle(base, scale));
      const height = piece.reduce((max, cell) => Math.max(max, cell.style.fontSize * cell.style.leading), 0) || base.fontSize * scale * base.leading;
      const markerStyle = piece[0]?.style ?? scaledStyle(resolveStyle(base, runStyleAt(runs, start)), scale);
      const line: LayoutLine = {
        start, end, y, height, size, x: 0, width: contentWidth, paragraph: pIndex, segments, carets,
        marker: firstLine && paragraph.list !== 'none'
          ? { text: listMarker(paragraph.list, listIndex), x: indentLeft - listIndent - x0, style: markerStyle }
          : undefined,
        hardBreak: lastLine && pIndex < paragraphs.length - 1,
      };
      shiftLine(line, x0);
      lines.push(line);
      y += height;
    }
    if (paragraph.list !== 'none' && cellsOfParagraph.length) listIndex++;
    y += paragraph.spaceAfter * scale;
    paragraphStart = paragraphEnd + 1;
  }
  if (paragraph.spaceAfter) y -= paragraph.spaceAfter * scale;
  // Point text aligns lines against the widest line.
  if (mode === 'point') {
    const widest = Math.max(0, ...lines.map((line) => line.width + (line.x)));
    for (const line of lines) {
      const room = widest - line.width - line.x;
      const shift = align === 'center' ? room / 2 : align === 'right' ? room : 0;
      if (shift) shiftLine(line, shift);
    }
  }
  // Right-to-left point type is anchored at its right end, like Photoshop
  // (legacy layers keep their earlier start-anchored canvas placement).
  if (direction === 'rtl' && mode === 'point') {
    const widest = Math.max(0, ...lines.map((line) => line.x + line.width));
    for (const line of lines) {
      const room = widest - line.width - line.x;
      shiftLine(line, (align === 'left' ? room : 0) - widest);
    }
  } else if (direction === 'rtl' && mode === 'legacy') {
    for (const line of lines) shiftLine(line, -line.width);
  }
  let left = Infinity, right = -Infinity;
  for (const line of lines) {
    left = Math.min(left, line.x, line.marker?.x ?? Infinity);
    right = Math.max(right, line.x + line.width);
  }
  if (!Number.isFinite(left)) { left = 0; right = 0; }
  const boxHeight = mode === 'paragraph' && finite(layer.boxHeight) ? Math.max(1, layer.boxHeight) : undefined;
  let overflow = false, overflowOffset: number | undefined;
  if (boxHeight !== undefined) {
    const hidden = lines.find((line) => line.y + line.height > boxHeight + 0.5 && line.end > line.start);
    if (hidden) {
      overflow = true;
      overflowOffset = hidden.start;
    }
  }
  return {
    lines,
    left,
    width: Math.max(0, right - left),
    height: y,
    boxWidth,
    boxHeight,
    overflow,
    overflowOffset,
    scale,
    mode,
    vertical: false,
    direction,
  };
}

function shiftLine(line: LayoutLine, shift: number) {
  line.x += shift;
  for (const caret of line.carets) caret.x += shift;
  for (const segment of line.segments) {
    segment.x += shift;
    for (const glyph of segment.glyphs) glyph.x += shift;
  }
  if (line.marker) line.marker.x += shift;
}

/**
 * Vertical text: each paragraph is a column advancing right; glyphs advance
 * down by `fontSize + spacing`, matching the legacy renderer. Caret stops use
 * `x` for the column and the line `carets[].x` as the y position.
 */
export function layoutVerticalText(layer: RichTextSource, options: LayoutOptions): TextLayout {
  const scale = options.scale ?? 1;
  const base = baseCharacterStyle(layer);
  const runs = layerRuns(layer);
  const { cells } = buildCells(layer.text, runs, base, options.measure, scale);
  const columnAdvance = Math.max(1, base.fontSize * scale * base.leading);
  const lines: LayoutLine[] = [];
  let column: Cell[] = [], start = 0, index = 0, maxHeight = 0;
  const flush = (end: number, hard: boolean) => {
    const carets: { offset: number; x: number }[] = [];
    const segments: LayoutSegment[] = [];
    let y = 0;
    for (const cell of column) {
      carets.push({ offset: cell.offset, x: y });
      segments.push({ start: cell.offset, end: cell.offset + cell.length, x: index * columnAdvance, width: cell.width, style: cell.style, text: displayText(cell.text, cell.style), glyphs: [{ offset: cell.offset, x: index * columnAdvance, width: cell.width, text: displayText(cell.text, cell.style) }], perGlyph: true });
      y += cell.style.fontSize + glyphSpacing(cell.style);
    }
    carets.push({ offset: end, x: y });
    maxHeight = Math.max(maxHeight, y);
    lines.push({ start, end, y: 0, height: y, size: base.fontSize * scale, x: index * columnAdvance, width: columnAdvance, paragraph: index, segments, carets, hardBreak: hard });
    index++;
  };
  for (const cell of cells) {
    if (cell.text === '\n') {
      flush(cell.offset, true);
      column = [];
      start = cell.offset + 1;
    } else column.push(cell);
  }
  flush(layer.text.length, false);
  return {
    lines,
    left: 0,
    width: lines.length * columnAdvance,
    height: maxHeight,
    boxWidth: Math.max(1, layer.boxWidth ?? 640),
    overflow: false,
    scale,
    mode: layer.textMode ?? 'legacy',
    vertical: true,
    direction: options.direction ?? 'ltr',
  };
}

/**
 * Dynamic text: the largest uniform scale (bounded 0.1–4) at which paragraph
 * text fits its box height. `shrink` never enlarges past 1.
 */
export function fitTextScale(layer: RichTextSource, options: LayoutOptions): number {
  if (layer.fit === undefined || layer.fit === 'none' || layer.textMode !== 'paragraph' || !finite(layer.boxHeight) || !layer.text.length)
    return 1;
  const height = Math.max(1, layer.boxHeight);
  const fits = (scale: number) => {
    const layout = layoutRichText(layer, { ...options, scale });
    return !layout.overflow && layout.height <= height + 0.5 && layout.lines.every((line) => line.width <= layout.boxWidth + 0.5);
  };
  const max = layer.fit === 'shrink' ? 1 : 4;
  if (fits(max)) return max;
  let low = 0.1, high = max;
  if (!fits(low)) return low;
  for (let step = 0; step < 14; step++) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid; else high = mid;
  }
  return Number(low.toFixed(4));
}

// ------------------------------------------------------------ caret model

export type CaretGeometry = { x: number; y: number; height: number; line: number; vertical: boolean };

/** Index of the layout line that shows `offset` (prefers the later line at soft wraps when `affinity` is 'forward'). */
export function lineForOffset(layout: TextLayout, offset: number, affinity: 'backward' | 'forward' = 'backward'): number {
  const lines = layout.lines;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (offset < line.start) return Math.max(0, index - 1);
    if (offset <= line.end) {
      const next = lines[index + 1];
      if (affinity === 'forward' && offset === line.end && next && !line.hardBreak && next.start === offset) return index + 1;
      return index;
    }
  }
  return Math.max(0, lines.length - 1);
}

export function caretGeometry(layout: TextLayout, offset: number, affinity: 'backward' | 'forward' = 'backward'): CaretGeometry {
  const index = lineForOffset(layout, offset, affinity);
  const line = layout.lines[index];
  if (!line) return { x: 0, y: 0, height: 16, line: 0, vertical: layout.vertical };
  let stop = line.carets[0];
  for (const caret of line.carets) if (caret.offset <= offset) stop = caret;
  if (layout.vertical)
    return { x: line.x, y: stop?.x ?? 0, height: line.width, line: index, vertical: true };
  return { x: stop?.x ?? line.x, y: line.y, height: line.height, line: index, vertical: false };
}

/** Nearest caret offset to a layer-local point. */
export function offsetAtPoint(layout: TextLayout, x: number, y: number): number {
  const lines = layout.lines;
  if (!lines.length) return 0;
  let lineIndex: number;
  if (layout.vertical) {
    lineIndex = lines.findIndex((line) => x < line.x + line.width);
    if (lineIndex < 0) lineIndex = lines.length - 1;
    return nearestStop(lines[lineIndex], y);
  }
  lineIndex = lines.findIndex((line) => y < line.y + line.height);
  if (lineIndex < 0) lineIndex = lines.length - 1;
  return nearestStop(lines[lineIndex], x);
}

function nearestStop(line: LayoutLine, position: number): number {
  let best = line.carets[0]?.offset ?? line.start, distance = Infinity;
  for (const caret of line.carets) {
    const d = Math.abs(caret.x - position);
    if (d < distance) {
      distance = d;
      best = caret.offset;
    }
  }
  return best;
}

/** Caret offset one visual line up (-1) or down (+1), keeping goal x. */
export function verticalCaretMove(layout: TextLayout, offset: number, delta: -1 | 1, goal?: number): { offset: number; goal: number } {
  const geometry = caretGeometry(layout, offset);
  const target = geometry.line + delta;
  const goalX = goal ?? (layout.vertical ? geometry.y : geometry.x);
  if (target < 0) return { offset: 0, goal: goalX };
  if (target >= layout.lines.length) return { offset: layout.lines[layout.lines.length - 1]?.end ?? offset, goal: goalX };
  return { offset: nearestStop(layout.lines[target], goalX), goal: goalX };
}

export function lineBoundary(layout: TextLayout, offset: number, edge: 'start' | 'end'): number {
  const line = layout.lines[lineForOffset(layout, offset)];
  if (!line) return offset;
  if (edge === 'start') return line.start;
  return line.end;
}

/** Selection highlight rectangles in layer-local pixels. */
export function selectionRects(layout: TextLayout, start: number, end: number): { x: number; y: number; width: number; height: number }[] {
  const from = Math.min(start, end), to = Math.max(start, end);
  if (from === to) return [];
  const rects: { x: number; y: number; width: number; height: number }[] = [];
  for (const line of layout.lines) {
    if (line.end < from || line.start > to) continue;
    if (line.end === from && line.end !== line.start) continue;
    const stops = line.carets.filter((caret) => caret.offset >= from && caret.offset <= to);
    if (!stops.length) continue;
    const a = Math.min(...stops.map((stop) => stop.x));
    let b = Math.max(...stops.map((stop) => stop.x));
    // Selected hard break shows a small sliver like a desktop editor.
    if (to > line.end && line.hardBreak) b += Math.max(4, line.size * 0.25);
    if (b - a < 0.5) continue;
    if (layout.vertical) rects.push({ x: line.x, y: a, width: line.width, height: b - a });
    else rects.push({ x: a, y: line.y, width: b - a, height: line.height });
  }
  return rects;
}

/** Word containing `offset`, for double-click selection. */
export function wordRange(text: string, offset: number): { start: number; end: number } {
  const isWord = (char: string) => /[\p{L}\p{N}_'’-]/u.test(char);
  let start = Math.max(0, Math.min(offset, text.length)), end = start;
  if (start < text.length && !isWord(text[start]) && start > 0 && isWord(text[start - 1])) {
    start--;
    end = start;
  }
  if (start < text.length && !isWord(text[start])) return { start, end: Math.min(text.length, start + 1) };
  while (start > 0 && isWord(text[start - 1])) start--;
  while (end < text.length && isWord(text[end])) end++;
  return { start, end };
}

/** Paragraph containing `offset`, for triple-click selection. */
export function paragraphRange(text: string, offset: number): { start: number; end: number } {
  const start = text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  const next = text.indexOf('\n', offset);
  return { start: offset > 0 && text[offset - 1] === '\n' ? offset : start, end: next < 0 ? text.length : next };
}

/** Layer name from its first characters, Photoshop style. */
export function typeLayerName(text: string, fallback = 'Text'): string {
  const first = text.replace(/\s+/g, ' ').trim();
  if (!first) return fallback;
  const chars = Array.from(first);
  return chars.length > 30 ? chars.slice(0, 30).join('').trimEnd() + '…' : first;
}
