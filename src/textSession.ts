/**
 * Pure on-canvas type editing session.
 *
 * The editor mirrors the layer's plain text into a hidden <textarea>, so the
 * browser supplies typing, IME composition, clipboard, spell checking, word
 * navigation and the mobile virtual keyboard. Each input event hands the new
 * value and selection to `applyTextInput`, which rebases the style runs and
 * records a coalesced in-session undo step. Commit produces one document
 * history entry; Cancel discards the session.
 */
import {
  MAX_TEXT_LENGTH,
  commonStyle,
  layerRuns,
  remapRuns,
  replaceRange,
  richRecord,
  runStyleAt,
  styleRange,
  typingStyleAt,
  type TextLayout,
  type RichText,
  type RichTextSource,
  type RunStyle,
} from './richText.ts';

export type TextSelection = { anchor: number; focus: number };
export type SessionLayer = RichTextSource & { rich?: RichText };

export type TextSession<L extends SessionLayer = SessionLayer> = {
  layerId: string;
  /** True when the session created the layer (Cancel removes it). */
  isNew: boolean;
  /** Type Mask tools produce a selection instead of keeping a layer. */
  mask: boolean;
  /** Layer as it was when the session began (for Cancel / no-op detection). */
  original: L;
  layer: L;
  selection: TextSelection;
  /** Style for the next typed characters (Ctrl+B with a collapsed caret). */
  pendingStyle?: RunStyle;
  undo: { layer: L; selection: TextSelection; kind: string }[];
  redo: { layer: L; selection: TextSelection; kind: string }[];
  /** Kind of the most recent change, so consecutive typing coalesces. */
  lastKind?: string;
};

export const MAX_SESSION_UNDO = 200;

export function beginTextSession<L extends SessionLayer>(
  layer: L,
  options: { isNew?: boolean; mask?: boolean; selection?: TextSelection; layerId: string },
): TextSession<L> {
  const length = layer.text.length;
  const selection = options.selection ?? { anchor: length, focus: length };
  return {
    layerId: options.layerId,
    isNew: options.isNew ?? false,
    mask: options.mask ?? false,
    original: layer,
    layer,
    selection: clampSelection(selection, length),
    undo: [],
    redo: [],
  };
}

export function clampSelection(selection: TextSelection, length: number): TextSelection {
  const clamp = (value: number) => Math.max(0, Math.min(length, Math.round(Number.isFinite(value) ? value : 0)));
  return { anchor: clamp(selection.anchor), focus: clamp(selection.focus) };
}

export const selectionStart = (selection: TextSelection) => Math.min(selection.anchor, selection.focus);
export const selectionEnd = (selection: TextSelection) => Math.max(selection.anchor, selection.focus);

function record<L extends SessionLayer>(session: TextSession<L>, kind: string): TextSession<L> {
  // Consecutive typing/deleting coalesces into one undo step.
  if (session.lastKind === kind && (kind === 'type' || kind === 'delete')) return { ...session, redo: [] };
  const undo = [...session.undo, { layer: session.layer, selection: session.selection, kind }];
  if (undo.length > MAX_SESSION_UNDO) undo.shift();
  return { ...session, undo, redo: [], lastKind: kind };
}

/** Apply a new plain-text value (from the textarea) and its selection. */
export function applyTextInput<L extends SessionLayer>(
  session: TextSession<L>,
  value: string,
  selection: TextSelection,
): TextSession<L> {
  const text = value.length > MAX_TEXT_LENGTH ? value.slice(0, MAX_TEXT_LENGTH) : value;
  const old = session.layer.text;
  if (text === old) return { ...session, selection: clampSelection(selection, text.length) };
  const kind = text.length >= old.length ? 'type' : 'delete';
  const base = record(session, text.length - old.length > 1 ? 'paste' : kind);
  const runs = layerRuns(session.layer);
  const insertStyle = session.pendingStyle
    ? { ...typingStyleAt(runs, selectionStart(session.selection)), ...session.pendingStyle }
    : undefined;
  const nextRuns = remapRuns(old, text, runs, insertStyle);
  const layer = withRuns({ ...session.layer, text }, nextRuns);
  return {
    ...base,
    layer,
    selection: clampSelection(selection, text.length),
    pendingStyle: text.length > old.length ? undefined : session.pendingStyle,
  };
}

function withRuns<L extends SessionLayer>(layer: L, runs: ReturnType<typeof layerRuns>): L {
  const rich = richRecord(runs, layer.text.length);
  const next = { ...layer } as L;
  if (rich) next.rich = rich;
  else delete next.rich;
  return next;
}

/** Replace the selected text (paste, glyph insertion, find & replace). */
export function insertText<L extends SessionLayer>(session: TextSession<L>, text: string): TextSession<L> {
  const start = selectionStart(session.selection), end = selectionEnd(session.selection);
  const value = session.layer.text.slice(0, start) + text + session.layer.text.slice(end);
  const caret = Math.min(MAX_TEXT_LENGTH, start + text.length);
  return applyTextInput({ ...session, lastKind: 'insert' }, value, { anchor: caret, focus: caret });
}

/**
 * Style the selection, or (collapsed caret) remember the style for the next
 * typed characters, like Photoshop. `undefined` values clear overrides.
 */
export function applyCharacterStyle<L extends SessionLayer>(
  session: TextSession<L>,
  patch: { [K in keyof RunStyle]?: RunStyle[K] | undefined },
  options: { wholeLayer?: boolean } = {},
): TextSession<L> {
  const length = session.layer.text.length;
  let start = selectionStart(session.selection), end = selectionEnd(session.selection);
  if (options.wholeLayer || length === 0) {
    start = 0;
    end = length;
  }
  if (start === end) {
    const pending = { ...session.pendingStyle } as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) pending[key] = value;
    return { ...session, pendingStyle: pending as RunStyle };
  }
  const base = record(session, 'style');
  const runs = styleRange(layerRuns(session.layer), length, start, end, patch);
  return { ...base, layer: withRuns(session.layer, runs) };
}

/** Patch layer-level fields (paragraph settings, box, mode, base style). */
export function applyLayerPatch<L extends SessionLayer>(session: TextSession<L>, patch: Partial<L>, kind = 'layer'): TextSession<L> {
  const base = kind === 'resize' && session.lastKind === 'resize' ? session : record(session, kind);
  return { ...base, layer: { ...session.layer, ...patch }, lastKind: kind };
}

export function undoTextSession<L extends SessionLayer>(session: TextSession<L>): TextSession<L> {
  const previous = session.undo[session.undo.length - 1];
  if (!previous) return session;
  return {
    ...session,
    layer: previous.layer,
    selection: previous.selection,
    undo: session.undo.slice(0, -1),
    redo: [...session.redo, { layer: session.layer, selection: session.selection, kind: previous.kind }],
    lastKind: undefined,
  };
}

export function redoTextSession<L extends SessionLayer>(session: TextSession<L>): TextSession<L> {
  const next = session.redo[session.redo.length - 1];
  if (!next) return session;
  return {
    ...session,
    layer: next.layer,
    selection: next.selection,
    redo: session.redo.slice(0, -1),
    undo: [...session.undo, { layer: session.layer, selection: session.selection, kind: next.kind }],
    lastKind: undefined,
  };
}

/** True when committing would change the document. */
export function textSessionChanged(session: TextSession): boolean {
  return session.isNew || JSON.stringify(session.layer) !== JSON.stringify(session.original);
}

/** Character attributes shown by the Character panel for the selection. */
export function sessionCharacterState(session: TextSession) {
  const start = selectionStart(session.selection), end = selectionEnd(session.selection);
  const state = commonStyle(session.layer, start, end);
  return session.pendingStyle && start === end ? { ...state, ...session.pendingStyle } : state;
}

/** Toggle helpers used by Ctrl+B / Ctrl+I / Ctrl+U shortcuts. */
export function toggledStyle(session: TextSession, attribute: 'bold' | 'italic' | 'underline' | 'strikethrough'): RunStyle {
  const state = sessionCharacterState(session);
  if (attribute === 'bold') return { fontWeight: state.fontWeight === 'mixed' || state.fontWeight < 600 ? 700 : 400 };
  const current = state[attribute];
  return { [attribute]: current === 'mixed' ? true : !current } as RunStyle;
}

/** Copy of `target` whose text is `text`, with runs rebased from `source`. */
export function withTextRemapped<L extends SessionLayer>(source: SessionLayer, text: string, target: L): L {
  const runs = remapRuns(source.text, text, layerRuns(source));
  return withRuns({ ...target, text }, runs);
}

/**
 * Apply a character style to a whole layer outside an edit session: base
 * attributes (family, size, weight, colour) update the layer fields and clear
 * matching run overrides; the rest are stored on one full-length run.
 */
export function applyStyleToLayer<L extends SessionLayer>(
  layer: L,
  patch: { [K in keyof RunStyle]?: RunStyle[K] | undefined },
  /** Families the layer-level field accepts; others stay a full-length run override. */
  isBaseFont: (family: string) => boolean = () => true,
): L {
  const next = { ...layer } as L & { fontFamily: string; fontSize: number; color: string; bold: boolean };
  const runPatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'fontFamily' && typeof value === 'string' && isBaseFont(value)) { next.fontFamily = value; runPatch.fontFamily = undefined; }
    else if (key === 'fontSize' && typeof value === 'number') { next.fontSize = value; runPatch.fontSize = undefined; }
    else if (key === 'color' && typeof value === 'string') { next.color = value; runPatch.color = undefined; }
    else if (key === 'fontWeight' && (value === 400 || value === 700)) { next.bold = value === 700; runPatch.fontWeight = undefined; }
    else runPatch[key] = value;
  }
  const runs = styleRange(layerRuns(next), next.text.length, 0, next.text.length, runPatch as RunStyle);
  return withRuns(next, runs);
}

/**
 * Convert paragraph type to point type: every soft wrap becomes a hard line
 * break (trailing wrap spaces are dropped) so the visible lines are kept.
 */
export function convertToPointText<L extends SessionLayer>(layer: L, layout: TextLayout): L {
  let text = layer.text;
  let runs = layerRuns(layer);
  // Walk soft breaks from the end so earlier offsets stay valid.
  const breaks = layout.lines
    .slice(0, -1)
    .filter((line) => !line.hardBreak)
    .map((line) => line.end)
    .reverse();
  for (const offset of breaks) {
    let start = offset;
    while (start > 0 && text[start - 1] === ' ') start--;
    const style = runStyleAt(runs, Math.max(0, start - 1));
    runs = replaceRange(runs, text.length, start, offset, 1, style);
    text = text.slice(0, start) + '\n' + text.slice(offset);
  }
  const next = withRuns({ ...layer, text, textMode: 'point' }, runs) as L & { boxHeight?: number; fit?: string };
  delete next.boxHeight;
  delete next.fit;
  return next;
}

/** Convert point type to paragraph type with a box that fits the current lines. */
export function convertToParagraphText<L extends SessionLayer>(layer: L, layout: TextLayout): L {
  const width = Math.max(8, Math.ceil(layout.left + layout.width + 2));
  const height = Math.max(8, Math.ceil(layout.height + 2));
  return { ...layer, textMode: 'paragraph', boxWidth: width, boxHeight: height };
}

/** Step font size like Photoshop's Ctrl+Shift+> / < (2 px steps, bounded). */
export function steppedFontSize(size: number | 'mixed', direction: 1 | -1, large = false): number {
  const value = size === 'mixed' ? 12 : size;
  const step = large ? 10 : 2;
  return Math.max(1, Math.min(1000, Math.round(value + direction * step)));
}
