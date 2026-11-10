/**
 * On-canvas Type tool surface: placement (click = point type, drag =
 * paragraph box), caret and selection drawing, box handles, and the hidden
 * <textarea> that receives typing, IME composition, clipboard, spell check
 * and the mobile virtual keyboard.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Matrix } from './document.ts';
import {
  caretGeometry,
  lineBoundary,
  selectionRects,
  verticalCaretMove,
} from './richText.ts';
import { selectionEnd, selectionStart, steppedFontSize, sessionCharacterState, toggledStyle } from './textSession.ts';
import { textHitRect, toLocal, type Point, type TypeTool } from './useTypeTool.ts';

type Props = {
  typeTool: TypeTool;
  frameWidth: number;
  frameHeight: number;
  /** Client point → document pixel (handles zoom and view rotation). */
  toCanvas: (event: { clientX: number; clientY: number }) => Point;
  /** True while a Type tool is the active tool. */
  active: boolean;
  /** Marks elements whose focus keeps the edit session open (options bar, panels). */
  keepSelector?: string;
  /** Receives the pointer handlers; the page routes canvas pointer events to them. */
  registerHandlers: (handlers: TypePointerHandlers | null) => void;
};

type Gesture =
  | { kind: 'create'; start: Point; last: Point; pointerId: number }
  | { kind: 'select'; pointerId: number }
  | { kind: 'move'; pointerId: number; start: Point; matrix: Matrix }
  | { kind: 'resize'; pointerId: number; handle: string; start: Point; box: { w: number; h: number }; matrix: Matrix; scale: boolean };

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
const KEEP = '[data-type-keep]';

export type TypePointerHandlers = {
  down: (event: React.PointerEvent<HTMLElement>) => void;
  move: (event: React.PointerEvent<HTMLElement>) => void;
  up: (event: React.PointerEvent<HTMLElement>) => void;
};

export function TypeEditorOverlay({ typeTool, frameWidth, frameHeight, toCanvas, active, registerHandlers, keepSelector = KEEP }: Props) {
  const { session, layout } = typeTool;
  const textarea = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const composing = useRef(false);
  const goal = useRef<number | undefined>(undefined);
  const lastPointerTarget = useRef<EventTarget | null>(null);
  const [draft, setDraft] = useState<{ start: Point; end: Point } | null>(null);
  const [screenScale, setScreenScale] = useState(1);

  // Document pixels per screen pixel keeps handles a constant on-screen size.
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const width = element.getBoundingClientRect().width || element.offsetWidth;
      if (width > 0) setScreenScale(frameWidth / width);
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : undefined;
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [frameWidth, active]);

  // Latest controller for document-level listeners registered once.
  const toolRef = useRef(typeTool);
  useLayoutEffect(() => {
    toolRef.current = typeTool;
  });
  /** Last selection written to the textarea, to tell native changes from ours. */
  const applied = useRef<{ start: number; end: number } | null>(null);
  const kept = (element: Element | null) =>
    // The canvas wrap counts as inside: the overlay decides what a canvas press does.
    Boolean(element?.closest?.(keepSelector) || (element && root.current?.parentElement?.contains(element)));

  useEffect(() => {
    // A press outside the type, its options bar and panels commits it (the
    // Photoshop behaviour for menus, tools, layers and empty stage areas).
    const down = (event: PointerEvent) => {
      lastPointerTarget.current = event.target;
      const target = event.target as Element | null;
      // Menus, panels and other UI commit without changing the tool.
      if (toolRef.current.sessionRef.current && !kept(target)) toolRef.current.commitSession('focus-out');
    };
    // Native caret moves (arrows, word jumps, Shift-selection, Ctrl+A).
    const selectionChange = () => {
      const element = textarea.current;
      const tool = toolRef.current;
      if (!element || composing.current || document.activeElement !== element || !tool.sessionRef.current) return;
      const start = element.selectionStart, end = element.selectionEnd;
      if (applied.current && applied.current.start === start && applied.current.end === end) return;
      applied.current = { start, end };
      const backward = element.selectionDirection === 'backward';
      tool.select(backward ? { anchor: end, focus: start } : { anchor: start, focus: end });
    };
    // Keyboard focus leaving to an unrelated control (Tab) commits.
    const focusIn = (event: FocusEvent) => {
      const target = event.target as Element | null;
      if (toolRef.current.sessionRef.current && target !== textarea.current && !kept(target)) toolRef.current.commitSession('focus-out');
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('selectionchange', selectionChange);
    document.addEventListener('focusin', focusIn);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('selectionchange', selectionChange);
      document.removeEventListener('focusin', focusIn);
    };
    // Listeners read the latest controller through refs.
  }, [keepSelector]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mirror the session text and selection into the textarea.
  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element || !session || composing.current) return;
    if (element.value !== session.layer.text) element.value = session.layer.text;
    const start = selectionStart(session.selection), end = selectionEnd(session.selection);
    const direction = session.selection.focus < session.selection.anchor ? 'backward' : 'forward';
    applied.current = { start, end };
    if (element.selectionStart !== start || element.selectionEnd !== end) {
      try { element.setSelectionRange(start, end, direction); } catch { /* detached */ }
    }
  }, [session]);
  useEffect(() => {
    if (session && document.activeElement !== textarea.current && !document.activeElement?.closest(keepSelector))
      textarea.current?.focus({ preventScroll: true });
  }, [session?.layerId, keepSelector]); // eslint-disable-line react-hooks/exhaustive-deps


  const readSelection = () => {
    const element = textarea.current;
    if (!element) return { anchor: 0, focus: 0 };
    const backward = element.selectionDirection === 'backward';
    applied.current = { start: element.selectionStart, end: element.selectionEnd };
    return backward
      ? { anchor: element.selectionEnd, focus: element.selectionStart }
      : { anchor: element.selectionStart, focus: element.selectionEnd };
  };
  const focusEditor = () => textarea.current?.focus({ preventScroll: true });

  const matrix = session?.layer.matrix;
  const local = (point: Point) => (matrix ? toLocal(matrix, point) : null);
  const layerScale = matrix ? Math.max(1e-6, Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]))) : 1;
  const unit = screenScale / layerScale;
  const hit = session && layout ? textHitRect(session.layer, layout) : null;
  const handleSize = 9 * unit;

  const handleAt = (point: Point): string | null => {
    if (!hit || !session) return null;
    const p = local(point);
    if (!p) return null;
    for (const handle of HANDLES) {
      const [hx, hy] = handlePosition(handle, hit);
      if (Math.abs(p.x - hx) <= handleSize && Math.abs(p.y - hy) <= handleSize) return handle;
    }
    return null;
  };
  const insideBox = (point: Point, pad = 0) => {
    const p = hit && local(point);
    return Boolean(p && hit && p.x >= hit.x - pad && p.x <= hit.x + hit.width + pad && p.y >= hit.y - pad && p.y <= hit.y + hit.height + pad);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const point = toCanvas(event);
    // Keep focus (and the mobile keyboard) on the textarea.
    event.preventDefault();
    if (session) {
      const handle = handleAt(point);
      if (handle) {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        gesture.current = {
          kind: 'resize', pointerId: event.pointerId, handle, start: point,
          box: { w: hit!.width, h: hit!.height }, matrix: session.layer.matrix,
          // Ctrl/Cmd+drag scales paragraph type; point type handles always scale.
          scale: event.ctrlKey || event.metaKey || session.layer.textMode !== 'paragraph',
        };
        focusEditor();
        return;
      }
      if (insideBox(point, 4 * unit)) {
        if (event.ctrlKey || event.metaKey) {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          gesture.current = { kind: 'move', pointerId: event.pointerId, start: point, matrix: session.layer.matrix };
          return;
        }
        event.currentTarget.setPointerCapture?.(event.pointerId);
        gesture.current = { kind: 'select', pointerId: event.pointerId };
        typeTool.selectAtPoint(point, event.shiftKey, event.detail);
        goal.current = undefined;
        focusEditor();
        return;
      }
      // Clicking outside the type commits it (Photoshop behaviour).
      typeTool.commitSession('click-outside');
      return;
    }
    const hitLayer = typeTool.hitTextLayer(point);
    if (hitLayer) {
      typeTool.editLayer(hitLayer.layer.id, { anchor: hitLayer.offset, focus: hitLayer.offset });
      focusEditor();
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gesture.current = { kind: 'create', start: point, last: point, pointerId: event.pointerId };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    const point = toCanvas(event);
    if (g.kind === 'create') {
      g.last = point;
      if (Math.abs(point.x - g.start.x) >= 6 || Math.abs(point.y - g.start.y) >= 6) setDraft({ start: g.start, end: point });
    } else if (g.kind === 'select') {
      if (!session || !layout) return;
      typeTool.selectAtPoint(point, true, 1);
    } else if (g.kind === 'move') {
      const [a, b, c, d, e, f] = g.matrix;
      typeTool.patchTextLayer({ matrix: [a, b, c, d, e + point.x - g.start.x, f + point.y - g.start.y] }, 'resize');
    } else if (g.kind === 'resize') {
      resize(g, point);
    }
  };
  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    gesture.current = null;
    setDraft(null);
    if (g.kind === 'create' && event.type !== 'pointercancel') {
      const end = toCanvas(event);
      if (typeTool.createAt(g.start, end)) focusEditor();
    }
    if (g.kind !== 'create') focusEditor();
  };

  const resize = (g: Extract<Gesture, { kind: 'resize' }>, point: Point) => {
    const inverse = toLocal(g.matrix, point), origin = toLocal(g.matrix, g.start);
    if (!inverse || !origin || !session) return;
    const dx = inverse.x - origin.x, dy = inverse.y - origin.y;
    const west = g.handle.includes('w'), east = g.handle.includes('e');
    const north = g.handle.startsWith('n'), south = g.handle.startsWith('s');
    let w = g.box.w + (east ? dx : west ? -dx : 0);
    let h = g.box.h + (south ? dy : north ? -dy : 0);
    w = Math.max(8, w);
    h = Math.max(8, h);
    const [a, b, c, d, e, f] = g.matrix;
    if (g.scale) {
      // Scale the type itself (Ctrl+drag, or point type) from the opposite edge.
      let sx = w / g.box.w, sy = h / g.box.h;
      if (g.handle.length === 2) sx = sy = Math.max(sx, sy);
      else if (east || west) sy = 1;
      else sx = 1;
      const ox = west ? g.box.w * (1 - sx) : 0, oy = north ? g.box.h * (1 - sy) : 0;
      typeTool.patchTextLayer({
        matrix: [a * sx, b * sx, c * sy, d * sy, e + a * ox + c * oy, f + b * ox + d * oy],
      }, 'resize');
      return;
    }
    // Paragraph type rewraps inside the new box; glyphs keep their size.
    const ox = west ? g.box.w - w : 0, oy = north ? g.box.h - h : 0;
    typeTool.patchTextLayer({
      boxWidth: w,
      boxHeight: h,
      matrix: [a, b, c, d, e + a * ox + c * oy, f + b * ox + d * oy],
    }, 'resize');
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!session) return;
    const command = event.ctrlKey || event.metaKey;
    const key = event.key;
    const stop = () => { event.preventDefault(); event.stopPropagation(); };
    if (key === 'Escape') { stop(); typeTool.cancelSession(); return; }
    if (key === 'Enter' && (command || event.nativeEvent.location === 3)) { stop(); typeTool.commitSession('shortcut'); return; }
    if (command && !event.altKey && key.toLowerCase() === 'z') { stop(); if (event.shiftKey) typeTool.redo(); else typeTool.undo(); return; }
    if (command && key.toLowerCase() === 'y') { stop(); typeTool.redo(); return; }
    if (command && !event.shiftKey && ['b', 'i', 'u'].includes(key.toLowerCase())) {
      stop();
      const attribute = key.toLowerCase() === 'b' ? 'bold' : key.toLowerCase() === 'i' ? 'italic' : 'underline';
      typeTool.styleCharacters(toggledStyle(session, attribute));
      return;
    }
    if (command && event.shiftKey && (key === '>' || key === '.' || key === '<' || key === ',')) {
      stop();
      const state = sessionCharacterState(session);
      typeTool.styleCharacters({ fontSize: steppedFontSize(state.fontSize, key === '>' || key === '.' ? 1 : -1, event.altKey) });
      return;
    }
    if (command && event.shiftKey && ['l', 'c', 'r', 'j'].includes(key.toLowerCase())) {
      stop();
      const k = key.toLowerCase();
      if (k === 'j') typeTool.patchParagraph({ justify: 'left' });
      else {
        typeTool.patchParagraph({ justify: 'none' });
        typeTool.patchTextLayer({ textAlign: k === 'l' ? 'left' : k === 'c' ? 'center' : 'right' });
      }
      return;
    }
    if (event.altKey && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      stop();
      const state = sessionCharacterState(session);
      const tracking = state.tracking === 'mixed' ? 0 : state.tracking;
      const step = (command ? 100 : 20) * (key === 'ArrowRight' ? 1 : -1);
      typeTool.styleCharacters({ tracking: Math.max(-1000, Math.min(2000, tracking + step)) });
      return;
    }
    if (event.altKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
      stop();
      const state = sessionCharacterState(session);
      const direction = key === 'ArrowUp' ? -1 : 1;
      if (event.shiftKey) {
        const shift = state.baselineShift === 'mixed' ? 0 : state.baselineShift;
        typeTool.styleCharacters({ baselineShift: Math.max(-1000, Math.min(1000, shift - direction * 2)) });
      } else {
        const leading = state.leading === 'mixed' ? 1.2 : state.leading;
        typeTool.styleCharacters({ leading: Math.max(0.5, Math.min(4, Number((leading + direction * 0.1).toFixed(2)))) });
      }
      return;
    }
    if (key === 'Tab' && !command) {
      stop();
      typeTool.insertTextAtCaret('\t');
      return;
    }
    // Visual line navigation follows our wrapping, not the hidden textarea's.
    if (layout && !command && !event.altKey && (key === 'ArrowUp' || key === 'ArrowDown' || key === 'Home' || key === 'End')) {
      if (layout.vertical && (key === 'ArrowUp' || key === 'ArrowDown')) return;
      stop();
      const focus = session.selection.focus;
      let next: number;
      if (key === 'Home' || key === 'End') {
        next = lineBoundary(layout, focus, key === 'Home' ? 'start' : 'end');
        goal.current = undefined;
      } else {
        const moved = verticalCaretMove(layout, focus, key === 'ArrowUp' ? -1 : 1, goal.current);
        goal.current = moved.goal;
        next = moved.offset;
      }
      typeTool.select({ anchor: event.shiftKey ? session.selection.anchor : next, focus: next });
      return;
    }
    if (layout?.vertical && !command && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      // Vertical type: left/right move between columns.
      stop();
      const moved = verticalCaretMove(layout, session.selection.focus, key === 'ArrowRight' ? 1 : -1, goal.current);
      goal.current = moved.goal;
      typeTool.select({ anchor: event.shiftKey ? session.selection.anchor : moved.offset, focus: moved.offset });
      return;
    }
    goal.current = undefined;
  };

  const onBlur = (event: React.FocusEvent<HTMLTextAreaElement>) => {
    if (!session) return;
    const next = event.relatedTarget as HTMLElement | null;
    const pointer = lastPointerTarget.current as HTMLElement | null;
    if (kept(next) || (!next && kept(pointer))) return;
    // Defer so a click on a keep-area control can still be recognised.
    window.setTimeout(() => {
      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement === textarea.current || kept(activeElement)) return;
      if (typeTool.sessionRef.current) typeTool.commitSession('focus-out');
    }, 0);
  };

  // The canvas stays the hit target (tests and assistive tech click it); the
  // page forwards its pointer events here while a Type tool is active.
  useLayoutEffect(() => {
    registerHandlers(active ? { down: onPointerDown, move: onPointerMove, up: onPointerUp } : null);
  });
  const caret = session && layout ? caretGeometry(layout, session.selection.focus, 'backward') : null;
  const rects = session && layout ? selectionRects(layout, session.selection.anchor, session.selection.focus) : [];
  const collapsed = session ? session.selection.anchor === session.selection.focus : true;
  const caretFrame = caret && matrix
    ? { x: matrix[0] * caret.x + matrix[2] * caret.y + matrix[4], y: matrix[1] * caret.x + matrix[3] * caret.y + matrix[5] }
    : { x: 0, y: 0 };
  const textareaStyle: CSSProperties = {
    left: `${Math.max(0, Math.min(100, (caretFrame.x / frameWidth) * 100))}%`,
    top: `${Math.max(0, Math.min(100, (caretFrame.y / frameHeight) * 100))}%`,
  };
  const overflowHandle = layout?.overflow && hit ? handlePosition('se', hit) : null;

  if (!active && !session) return null;
  return (
    <div
      ref={root}
      className={`type-editor-overlay${active ? ' is-active' : ''}${session ? ' is-editing' : ''}`}
      data-testid="type-editor"
      data-type-keep=""
      data-editing={session ? 'true' : 'false'}
      data-mode={session?.layer.textMode ?? ''}
      data-selection-start={session ? selectionStart(session.selection) : ''}
      data-selection-end={session ? selectionEnd(session.selection) : ''}
      data-lines={layout?.lines.length ?? 0}
      data-overflow={layout?.overflow ? 'true' : 'false'}
      data-mask={session?.mask ? 'true' : 'false'}
    >
      <svg viewBox={`0 0 ${frameWidth} ${frameHeight}`} preserveAspectRatio="none" aria-hidden="true">
        {draft && (
          <rect
            className="type-draft-box"
            x={Math.min(draft.start.x, draft.end.x)}
            y={Math.min(draft.start.y, draft.end.y)}
            width={Math.abs(draft.end.x - draft.start.x)}
            height={Math.abs(draft.end.y - draft.start.y)}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {session && matrix && layout && hit && (
          <g transform={`matrix(${matrix.join(' ')})`}>
            <rect
              className={`type-box${session.layer.textMode === 'paragraph' ? ' is-paragraph' : ''}`}
              x={hit.x}
              y={hit.y}
              width={hit.width}
              height={hit.height}
              vectorEffect="non-scaling-stroke"
            />
            {rects.map((rect, index) => (
              <rect key={index} className="type-selection" x={rect.x} y={rect.y} width={rect.width} height={rect.height} />
            ))}
            {caret && collapsed && (
              caret.vertical
                ? <line className="type-caret" data-testid="type-caret" x1={caret.x} y1={caret.y} x2={caret.x + caret.height} y2={caret.y} vectorEffect="non-scaling-stroke" />
                : <line className="type-caret" data-testid="type-caret" x1={caret.x} y1={caret.y} x2={caret.x} y2={caret.y + caret.height} vectorEffect="non-scaling-stroke" />
            )}
            {HANDLES.map((handle) => {
              const [hx, hy] = handlePosition(handle, hit);
              return (
                <rect
                  key={handle}
                  className="type-handle"
                  data-handle={handle}
                  x={hx - handleSize / 2}
                  y={hy - handleSize / 2}
                  width={handleSize}
                  height={handleSize}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            {overflowHandle && (
              <g className="type-overflow" data-testid="type-overflow">
                <rect x={overflowHandle[0] - handleSize} y={overflowHandle[1] - handleSize} width={handleSize * 2} height={handleSize * 2} vectorEffect="non-scaling-stroke" />
                <path
                  d={`M${overflowHandle[0] - handleSize * 0.6} ${overflowHandle[1]}H${overflowHandle[0] + handleSize * 0.6}M${overflowHandle[0]} ${overflowHandle[1] - handleSize * 0.6}V${overflowHandle[1] + handleSize * 0.6}`}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )}
          </g>
        )}
      </svg>
      <textarea
        ref={textarea}
        className="type-editor-input"
        aria-label="Type layer text editor"
        aria-multiline="true"
        spellCheck
        autoCapitalize="sentences"
        autoComplete="off"
        autoCorrect="on"
        maxLength={10000}
        style={textareaStyle}
        tabIndex={session ? 0 : -1}
        defaultValue=""
        onInput={(event) => {
          if (!session) return;
          const element = event.currentTarget;
          const selection = readSelection();
          typeTool.input(element.value, selection);
        }}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={(event) => {
          composing.current = false;
          if (session) typeTool.input(event.currentTarget.value, readSelection());
        }}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      />
    </div>
  );
}

function handlePosition(handle: string, rect: { x: number; y: number; width: number; height: number }): [number, number] {
  const x = handle.includes('w') ? rect.x : handle.includes('e') ? rect.x + rect.width : rect.x + rect.width / 2;
  const y = handle.startsWith('n') ? rect.y : handle.startsWith('s') ? rect.y + rect.height : rect.y + rect.height / 2;
  return [x, y];
}
