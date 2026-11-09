/**
 * Type tool controller: creates point/paragraph type, runs the on-canvas edit
 * session, previews it without touching history, and commits one history
 * entry (or a Type Mask selection) when the session ends.
 *
 * Font selection stays behind plain family strings so the font library can
 * supply any family; the controller waits for `document.fonts` before laying
 * out and re-renders when fonts finish loading.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  commonLayer,
  loadTextLayerFonts,
  measureTextLayerLayout,
  prepareTextContext,
  type Frame,
  type Layer,
  type Matrix,
} from './document.ts';
import {
  clearTextMeasureCache,
  offsetAtPoint,
  paragraphRange,
  typeLayerName,
  wordRange,
  type ParagraphSettings,
  type RunStyle,
  type TextAntiAlias,
  type TextLayout,
} from './richText.ts';
import {
  applyCharacterStyle,
  applyLayerPatch,
  applyStyleToLayer,
  applyTextInput,
  beginTextSession,
  insertText,
  redoTextSession,
  selectionEnd,
  selectionStart,
  textSessionChanged,
  undoTextSession,
  type TextSelection,
  type TextSession,
} from './textSession.ts';

export type TextLayer = Extract<Layer, { kind: 'text' }>;
export type TypeToolId = 'text' | 'vertical-text' | 'text-mask' | 'vertical-text-mask';
export const TYPE_TOOLS: readonly string[] = ['text', 'vertical-text', 'text-mask', 'vertical-text-mask'];
export const isTypeTool = (tool: string): tool is TypeToolId => TYPE_TOOLS.includes(tool);

export type TypeDefaults = {
  fontFamily: string;
  fontSize: number;
  color: string;
  bold: boolean;
  textAlign: 'left' | 'center' | 'right';
  antiAlias: TextAntiAlias;
  /** Placeholder text new type layers start with (selected, so typing replaces it). */
  starterText: string;
};

export type TypeToolDeps = {
  tool: string;
  current: () => Frame;
  /** Normal undoable commit. */
  commit: (frame: Frame) => boolean;
  /** Replace the top history entry (dropping `dropPrevious` entries below it). */
  amend: (value: Frame, expected: Frame, dropPrevious?: number) => boolean;
  paint: (frame: Frame) => Promise<unknown> | void;
  setNotice: (message: string) => void;
  addLayer: (layer: Layer) => boolean;
  /** Make a layer active without a history entry. */
  selectLayer: (id: string) => void;
  /** Families the layer-level fontFamily field accepts. */
  isBaseFont: (family: string) => boolean;
  isLocked: (frame: Frame, layer: Layer) => boolean;
  applyTextMask: (orientation: 'horizontal' | 'vertical', layer: TextLayer) => Promise<void> | void;
  defaults: TypeDefaults;
  revision: number;
  /** Disabled while Quick Mask or another modal mode owns the canvas. */
  blocked?: string;
};

export type Point = { x: number; y: number };

const invert = (matrix: Matrix): Matrix | null => {
  const [a, b, c, d, e, f] = matrix, det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
};
export const toLocal = (matrix: Matrix, point: Point): Point | null => {
  const inverse = invert(matrix);
  if (!inverse) return null;
  const [a, b, c, d, e, f] = inverse;
  return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
};

let scratch: CanvasRenderingContext2D | null | undefined;
/** Lay out a text layer with real Canvas metrics (shared scratch context). */
export function layoutTextLayer(layer: TextLayer): TextLayout | null {
  if (typeof document === 'undefined') return null;
  if (scratch === undefined) scratch = document.createElement('canvas').getContext('2d');
  if (!scratch) return null;
  scratch.save();
  prepareTextContext(scratch, layer);
  const layout = measureTextLayerLayout(scratch, layer);
  scratch.restore();
  return layout;
}

/** Local rectangle that counts as "on" a text layer for clicks. */
export function textHitRect(layer: TextLayer, layout: TextLayout) {
  if (layer.textMode === 'paragraph')
    return { x: 0, y: 0, width: layout.boxWidth, height: layer.boxHeight ?? Math.max(layout.height, layer.fontSize) };
  const width = layout.vertical ? layout.width : Math.max(layout.width, layer.fontSize * 0.5);
  return { x: layout.left, y: 0, width, height: Math.max(layout.height, layer.fontSize) };
}

export function useTypeTool(deps: TypeToolDeps) {
  const depsRef = useRef(deps);
  // Latest page callbacks for event handlers (updated after every render).
  useLayoutEffect(() => {
    depsRef.current = deps;
  });
  const [session, setSessionState] = useState<TextSession<TextLayer> | null>(null);
  const sessionRef = useRef<TextSession<TextLayer> | null>(null);
  const [fontTick, setFontTick] = useState(0);
  const setSession = useCallback((next: TextSession<TextLayer> | null) => {
    sessionRef.current = next;
    setSessionState(next);
  }, []);

  // Re-measure once web fonts finish loading (font library families).
  useEffect(() => {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts?.addEventListener) return;
    const done = () => {
      clearTextMeasureCache();
      setFontTick((value) => value + 1);
    };
    fonts.addEventListener('loadingdone', done);
    return () => fonts.removeEventListener('loadingdone', done);
  }, []);
  // Only the families in use matter; typing must not re-request fonts.
  const fontKey = session
    ? [session.layer.fontFamily, ...(session.layer.rich?.runs ?? []).map((run) => run.style?.fontFamily ?? '')].join('|')
    : '';
  useEffect(() => {
    const layer = sessionRef.current?.layer;
    if (!fontKey || !layer) return;
    let live = true;
    void loadTextLayerFonts(layer).then((loaded) => {
      if (live && loaded) setFontTick((value) => value + 1);
    });
    return () => { live = false; };
  }, [fontKey]);

  const sessionLayer = session?.layer;
  // fontTick re-measures after fonts load.
  const layout = useMemo(
    () => (sessionLayer && fontTick >= 0 ? layoutTextLayer(sessionLayer) : null),
    [sessionLayer, fontTick],
  );

  const previewFrame = useCallback((value: TextSession<TextLayer>): Frame => {
    const frame = depsRef.current.current();
    if (value.mask) {
      // Type Mask previews the glyphs as a translucent red quick-mask style layer.
      const preview: TextLayer = { ...value.layer, color: '#ff2020', opacity: 0.55, id: value.layerId };
      return { ...frame, layers: [...frame.layers, preview] };
    }
    return {
      ...frame,
      layers: frame.layers.map((layer) => (layer.id === value.layerId ? value.layer : layer)),
    };
  }, []);

  // Live preview: repaint whenever the session, document or fonts change.
  useEffect(() => {
    if (!session) return;
    void depsRef.current.paint(previewFrame(session));
  }, [session, deps.revision, fontTick, previewFrame]);

  const update = useCallback((fn: (value: TextSession<TextLayer>) => TextSession<TextLayer>) => {
    const value = sessionRef.current;
    if (!value) return;
    const next = fn(value);
    if (next !== value) setSession(next);
  }, [setSession]);

  /** End the session, writing one history entry (or a mask selection). */
  const commitSession = useCallback((reason = 'Type committed'): boolean => {
    const value = sessionRef.current;
    if (!value) return false;
    setSession(null);
    const d = depsRef.current;
    const frame = d.current();
    if (value.mask) {
      void d.paint(frame);
      if (!value.layer.text.trim()) {
        d.setNotice('Type Mask cancelled: no text was typed');
        return true;
      }
      void d.applyTextMask(value.layer.orientation === 'vertical' ? 'vertical' : 'horizontal', value.layer);
      return true;
    }
    const stored = frame.layers.find((layer): layer is TextLayer => layer.id === value.layerId && layer.kind === 'text');
    if (!stored) {
      void d.paint(frame);
      return false;
    }
    if (!value.layer.text.length) {
      // Photoshop discards empty type layers on commit.
      const without = { ...frame, layers: frame.layers.filter((layer) => layer.id !== value.layerId) };
      const remaining = without.layers[without.layers.length - 1];
      const next = { ...without, active: remaining?.id ?? '', selectedLayerIds: remaining ? [remaining.id] : [] };
      const ok = value.isNew ? d.amend(next, frame, 1) : d.commit(next);
      void d.paint(d.current());
      d.setNotice(value.isNew ? 'Empty type layer discarded' : 'Empty type layer deleted');
      return ok;
    }
    if (!textSessionChanged(value)) {
      void d.paint(frame);
      return true;
    }
    const autoNamed = stored.name === typeLayerName(value.original.text) || value.isNew;
    const layer: TextLayer = {
      ...value.layer,
      name: autoNamed ? typeLayerName(value.layer.text) : stored.name,
    };
    const next = { ...frame, layers: frame.layers.map((item) => (item.id === value.layerId ? layer : item)) };
    const ok = value.isNew ? d.amend(next, frame, 0) : d.commit(next);
    if (value.isNew && ok) void d.paint(next);
    d.setNotice(ok ? reason : 'Type could not be committed');
    return ok;
  }, [setSession]);

  /** Discard the session (Escape / ✕). A new layer is removed again. */
  const cancelSession = useCallback(() => {
    const value = sessionRef.current;
    if (!value) return;
    setSession(null);
    const d = depsRef.current;
    const frame = d.current();
    if (value.isNew && !value.mask && frame.layers.some((layer) => layer.id === value.layerId)) {
      const without = { ...frame, layers: frame.layers.filter((layer) => layer.id !== value.layerId) };
      const remaining = without.layers[without.layers.length - 1];
      d.amend({ ...without, active: remaining?.id ?? '', selectedLayerIds: remaining ? [remaining.id] : [] }, frame, 1);
    }
    void d.paint(d.current());
    d.setNotice('Type editing cancelled');
  }, [setSession]);

  // Leaving the Type tools commits, like choosing another tool in Photoshop.
  useEffect(() => {
    if (!isTypeTool(deps.tool) && sessionRef.current) commitSession();
  }, [deps.tool, commitSession]);
  // Commit before the page is hidden so a reload never loses typed text.
  useEffect(() => {
    const hide = () => { if (sessionRef.current) commitSession(); };
    window.addEventListener('pagehide', hide);
    return () => window.removeEventListener('pagehide', hide);
  }, [commitSession]);

  /** Begin editing an existing text layer with the caret at `selection`. */
  const editLayer = useCallback((layerId: string, selection?: TextSelection): boolean => {
    const d = depsRef.current, frame = d.current();
    const layer = frame.layers.find((item): item is TextLayer => item.id === layerId && item.kind === 'text');
    if (!layer) return false;
    if (d.isLocked(frame, layer) || !layer.visible) {
      d.setNotice('Unlock and show the type layer before editing it');
      return false;
    }
    if (sessionRef.current?.layerId === layerId) {
      if (selection) update((value) => ({ ...value, selection }));
      return true;
    }
    if (sessionRef.current) commitSession();
    const latest = d.current();
    if (latest.active !== layerId) d.selectLayer(layerId);
    setSession(beginTextSession(layer, { layerId, selection }));
    d.setNotice('Editing type: Ctrl+Enter or ✓ commits, Escape cancels');
    return true;
  }, [commitSession, setSession, update]);

  /** Topmost visible text layer under a canvas point, with the hit offset. */
  const hitTextLayer = useCallback((point: Point): { layer: TextLayer; offset: number } | null => {
    const frame = depsRef.current.current();
    for (let index = frame.layers.length - 1; index >= 0; index--) {
      const layer = frame.layers[index];
      if (layer.kind !== 'text' || !layer.visible || layer.textPath) continue;
      const local = toLocal(layer.matrix, point);
      const layout = local && layoutTextLayer(layer);
      if (!local || !layout) continue;
      const rect = textHitRect(layer, layout), pad = 4;
      if (local.x >= rect.x - pad && local.x <= rect.x + rect.width + pad && local.y >= rect.y - pad && local.y <= rect.y + rect.height + pad)
        return { layer, offset: offsetAtPoint(layout, local.x, local.y) };
    }
    return null;
  }, []);

  /** Create point type (no box) or paragraph type (box) and start editing. */
  const createAt = useCallback((start: Point, end?: Point): boolean => {
    const d = depsRef.current;
    if (d.blocked) {
      d.setNotice(d.blocked);
      return false;
    }
    if (sessionRef.current) commitSession();
    const tool = d.tool as TypeToolId;
    const vertical = tool === 'vertical-text' || tool === 'vertical-text-mask';
    const mask = tool === 'text-mask' || tool === 'vertical-text-mask';
    const frame = d.current();
    const paragraph = end && Math.abs(end.x - start.x) >= 6 && Math.abs(end.y - start.y) >= 6;
    const size = Math.max(1, Math.min(1000, d.defaults.fontSize));
    const x = paragraph ? Math.min(start.x, end!.x) : start.x;
    // A click sets the first baseline, like Photoshop; the renderer draws
    // from the top of the line, so lift point type by its ascent.
    const y = paragraph ? Math.min(start.y, end!.y) : vertical ? start.y : start.y - size * 0.8;
    const starter = mask ? '' : d.defaults.starterText.slice(0, 10000);
    const base = commonLayer(typeLayerName(starter, vertical ? 'Vertical Type' : 'Type'));
    const layer: TextLayer = {
      ...base,
      kind: 'text',
      text: starter,
      color: d.defaults.color,
      fontSize: size,
      fontFamily: d.defaults.fontFamily as TextLayer['fontFamily'],
      bold: d.defaults.bold,
      boxWidth: paragraph ? Math.max(1, Math.abs(end!.x - start.x)) : Math.max(1, frame.w - x),
      textAlign: d.defaults.textAlign,
      lineHeight: 1.2,
      letterSpacing: 0,
      orientation: vertical ? 'vertical' : 'horizontal',
      textMode: paragraph ? 'paragraph' : 'point',
      ...(paragraph ? { boxHeight: Math.max(1, Math.abs(end!.y - start.y)) } : {}),
      antiAlias: d.defaults.antiAlias,
      matrix: [1, 0, 0, 1, x, y],
    };
    if (!mask && !d.addLayer(layer)) return false;
    setSession(beginTextSession(layer, {
      layerId: layer.id,
      isNew: true,
      mask,
      selection: { anchor: 0, focus: starter.length },
    }));
    d.setNotice(mask
      ? 'Type Mask: type, then commit to create a selection'
      : paragraph ? 'Paragraph type added: type to edit, Ctrl+Enter or ✓ commits' : 'Editable text layer added');
    return true;
  }, [commitSession, setSession]);

  const input = useCallback((value: string, selection: TextSelection) => {
    update((current) => applyTextInput(current, value, selection));
  }, [update]);
  const select = useCallback((selection: TextSelection) => {
    update((current) => current.selection.anchor === selection.anchor && current.selection.focus === selection.focus
      ? current
      : { ...current, selection, lastKind: undefined });
  }, [update]);
  const selectAtPoint = useCallback((point: Point, extend: boolean, detail: number) => {
    const value = sessionRef.current, layoutNow = value && layoutTextLayer(value.layer);
    if (!value || !layoutNow) return;
    const local = toLocal(value.layer.matrix, point);
    if (!local) return;
    const offset = offsetAtPoint(layoutNow, local.x, local.y);
    if (detail === 2) {
      const range = wordRange(value.layer.text, offset);
      select({ anchor: range.start, focus: range.end });
    } else if (detail >= 3) {
      const range = paragraphRange(value.layer.text, offset);
      select({ anchor: range.start, focus: range.end });
    } else select({ anchor: extend ? value.selection.anchor : offset, focus: offset });
  }, [select]);

  /** Character style: session selection, or the whole active text layer. */
  const styleCharacters = useCallback((patch: { [K in keyof RunStyle]?: RunStyle[K] | undefined }): boolean => {
    if (sessionRef.current) {
      update((current) => applyCharacterStyle(current, patch));
      return true;
    }
    const d = depsRef.current, frame = d.current();
    const layer = frame.layers.find((item): item is TextLayer => item.id === frame.active && item.kind === 'text');
    if (!layer || d.isLocked(frame, layer)) return false;
    const next = applyStyleToLayer(layer, patch, d.isBaseFont);
    return d.commit({ ...frame, layers: frame.layers.map((item) => (item.id === layer.id ? next : item)) });
  }, [update]);
  /** Layer-wide text fields: session draft, or the active text layer. */
  const patchTextLayer = useCallback((patch: Partial<TextLayer>, kind = 'layer'): boolean => {
    if (sessionRef.current) {
      update((current) => applyLayerPatch(current, patch, kind));
      return true;
    }
    const d = depsRef.current, frame = d.current();
    const layer = frame.layers.find((item): item is TextLayer => item.id === frame.active && item.kind === 'text');
    if (!layer || d.isLocked(frame, layer)) return false;
    return d.commit({ ...frame, layers: frame.layers.map((item) => (item.id === layer.id ? { ...layer, ...patch } : item)) });
  }, [update]);
  const patchParagraph = useCallback((patch: Partial<ParagraphSettings>) => {
    const value = sessionRef.current?.layer ?? activeText(depsRef.current.current());
    if (!value) return false;
    return patchTextLayer({ paragraph: { ...normalizeParagraphLocal(value.paragraph), ...patch } });
  }, [patchTextLayer]);

  /** Glyph picker / special characters entry point. */
  const insertTextAtCaret = useCallback((text: string): boolean => {
    if (!sessionRef.current) {
      depsRef.current.setNotice('Click into type with the Type tool before inserting characters');
      return false;
    }
    update((current) => insertText(current, text));
    return true;
  }, [update]);
  // Integration point for the glyph picker / font library: either call
  // `window.pixelforgeType.insertTextAtCaret(text)` or dispatch
  // `new CustomEvent('pixelforge:insert-text', { detail: { text } })`.
  useEffect(() => {
    const target = window as Window & { pixelforgeType?: { insertTextAtCaret: (text: string) => boolean } };
    const onInsert = (event: Event) => {
      const text = (event as CustomEvent<{ text?: unknown }>).detail?.text;
      if (typeof text === 'string' && text.length <= 1000) insertTextAtCaret(text);
    };
    target.pixelforgeType = { insertTextAtCaret };
    window.addEventListener('pixelforge:insert-text', onInsert);
    return () => {
      window.removeEventListener('pixelforge:insert-text', onInsert);
      if (target.pixelforgeType?.insertTextAtCaret === insertTextAtCaret) delete target.pixelforgeType;
    };
  }, [insertTextAtCaret]);
  const undo = useCallback(() => update(undoTextSession), [update]);
  const redo = useCallback(() => update(redoTextSession), [update]);

  return {
    session,
    sessionRef,
    layout,
    createAt,
    editLayer,
    hitTextLayer,
    commitSession,
    cancelSession,
    input,
    select,
    selectAtPoint,
    styleCharacters,
    patchTextLayer,
    patchParagraph,
    insertTextAtCaret,
    undo,
    redo,
    selectionStart: session ? selectionStart(session.selection) : 0,
    selectionEnd: session ? selectionEnd(session.selection) : 0,
  };
}

function activeText(frame: Frame): TextLayer | undefined {
  return frame.layers.find((item): item is TextLayer => item.id === frame.active && item.kind === 'text');
}
function normalizeParagraphLocal(value: Partial<ParagraphSettings> | undefined): ParagraphSettings {
  return {
    justify: value?.justify ?? 'none',
    indentLeft: value?.indentLeft ?? 0,
    indentRight: value?.indentRight ?? 0,
    indentFirst: value?.indentFirst ?? 0,
    spaceBefore: value?.spaceBefore ?? 0,
    spaceAfter: value?.spaceAfter ?? 0,
    list: value?.list ?? 'none',
  };
}

export type TypeTool = ReturnType<typeof useTypeTool>;
