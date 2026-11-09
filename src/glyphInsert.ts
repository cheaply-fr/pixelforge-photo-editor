/**
 * Glyph insertion adapter (pure). The Glyphs panel inserts through, in order:
 *  1. a registered caret adapter (the text tool's `insertTextAtCaret(text)`)
 *     when the active text layer already uses the glyph's family;
 *  2. appending to the active text layer when it uses that family;
 *  3. a new editable text layer set in the glyph's family.
 * Text layers are single-family, so an icon glyph never silently renders in
 * the wrong font. See docs/font-library-contract.md.
 */

export type TextCaretAdapter = {
  /** Insert text at the caret of the text layer being edited; return false when nothing is being edited. */
  insertTextAtCaret: (text: string) => boolean | void;
  /** Id of the text layer the caret belongs to, when known. */
  layerId?: () => string | undefined;
};

let caretAdapter: TextCaretAdapter | undefined;

/** Called by the text tool while a caret is active; returns an unregister function. */
export function registerTextCaretAdapter(adapter: TextCaretAdapter): () => void {
  caretAdapter = adapter;
  return () => {
    if (caretAdapter === adapter) caretAdapter = undefined;
  };
}

export function currentTextCaretAdapter(): TextCaretAdapter | undefined {
  return caretAdapter;
}

type TextLayerLike = { id: string; kind: string; fontFamily?: string; text?: string; locked?: boolean };
type FrameLike = { active?: string; layers: readonly TextLayerLike[] };

export type GlyphInsertPlan =
  | { kind: 'caret' }
  | { kind: 'append'; layerId: string; text: string }
  | { kind: 'new-layer'; text: string; fontFamily: string };

export const MAX_TEXT_LENGTH = 10000;

export function planGlyphInsert(frame: FrameLike, glyph: string, family: string, adapter: TextCaretAdapter | undefined = caretAdapter): GlyphInsertPlan {
  const active = frame.layers.find((layer) => layer.id === frame.active);
  const sameFamily = active?.kind === 'text' && active.fontFamily === family;
  if (sameFamily && adapter && (!adapter.layerId || adapter.layerId() === active!.id)) return { kind: 'caret' };
  if (sameFamily && !active!.locked && (active!.text ?? '').length + glyph.length <= MAX_TEXT_LENGTH)
    return { kind: 'append', layerId: active!.id, text: `${active!.text ?? ''}${glyph}` };
  return { kind: 'new-layer', text: glyph, fontFamily: family };
}
