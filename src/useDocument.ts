import { useCallback, useEffect, useRef, useState } from 'react';
import {
  assertAssetByteBudgetForEdit,
  assertLayerPixelBudgetForEdit,
  assetsDecodedByRender,
  verifyAssetsDecode,
  referencedAssets,
  validateFrame,
  type Assets,
  type Frame,
} from './document';
import { sanitizeClippingRelations } from './layerClipping';
import { clearLayerFilterCaches, renderFrameWithWorker } from './workerRender';
import type { Draft } from './drafts';
import { beginPerformanceSpan } from './performanceMarks';
import { presentCanvasImage } from './canvasPresentation';
import {
  createPreviewScheduler,
  type PreviewRequest,
  type PreviewScheduler,
} from './previewScheduler';
import type {
  TiledNeighborhoodProgress,
  TiledRenderTelemetry,
} from './tiledDocument';
import {
  rangeLayerSelection,
  selectedLayerIdsForFrame,
  toggleLayerSelection,
} from './layerSelection';
import { TileCache } from './tilePlan';
import { detectHistoryBudget, trimHistoryToBudget } from './historyBudget';
import { detectTileCacheBudget } from './tileCachePolicy';

export type RenderProgress = {
  completed: number;
  total: number;
};

/** Arguments for one coalesced live-gesture preview render. */
export type GesturePreview = {
  frame: Frame;
  overrides?: Record<string, HTMLCanvasElement>;
};

export type LayerSelectionIntent = {
  /** Add or remove the clicked layer while preserving the other picks. */
  additive?: boolean;
  /** Select the contiguous range from the current active anchor. */
  range?: boolean;
};

/**
 * Best-effort diagnostics for one displayed gesture preview: `path` is where
 * it rendered and `firstCompleted` the first layer count it reported (with a
 * prefix composite-cache hit, every layer below the stroke arrives at once).
 */
function markGesturePreview(
  path: 'worker' | 'main' | undefined,
  firstCompleted: number | undefined,
  layers: number,
): void {
  try {
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function')
      performance.mark('pixelforge.gesture-preview', {
        detail: { path: path ?? 'unknown', firstCompleted: firstCompleted ?? 0, layers },
      });
  } catch {
    // Diagnostics must never affect rendering.
  }
}

export function useDocument(onError: (message: string) => void) {
  const canvas = useRef<HTMLCanvasElement>(null),
    assets = useRef<Assets>({}),
    history = useRef<Frame[]>([]),
    index = useRef(-1);
  const [frame, setFrame] = useState<Frame | null>(null),
    [revision, setRevision] = useState(0),
    [rendering, setRendering] = useState(false),
    // Keep the latest bounded sample after completion for diagnostics and
    // assistive technology. A new render resets it to zero.
    [renderProgress, setRenderProgress] = useState<RenderProgress | null>(null);
  const [tiledTelemetry, setTiledTelemetry] = useState<TiledRenderTelemetry | null>(null);
  const [tiledProgress, setTiledProgress] = useState<TiledNeighborhoodProgress | null>(null);
  const [tiledCacheBudget] = useState(() => detectTileCacheBudget());
  // Device-aware undo/redo capacity (steps + retained image bytes).
  const [historyBudget] = useState(() => detectHistoryBudget());
  const renderSequence = useRef(0),
    renderAbort = useRef<AbortController | null>(null),
    documentRevision = useRef(0),
    // Keep a device-aware in-memory session cache for repeat renders of the
    // same document revision. Keys include the revision, so edits cannot
    // reuse stale pixels; the byte cap keeps anonymous mobile drafts bounded.
    tiledCache = useRef(new TileCache<Uint8ClampedArray>(tiledCacheBudget));
  const closeImageSource = (image: CanvasImageSource) => {
    if ('close' in image && typeof image.close === 'function') image.close();
  };
  const previewScheduler = useRef<PreviewScheduler<GesturePreview> | null>(null);
  useEffect(
    () => () => {
      previewScheduler.current?.cancel();
      renderAbort.current?.abort();
    },
    [],
  );
  const renderNow = useCallback(
    async (value: Frame, overrides?: Record<string, HTMLCanvasElement>) => {
      const sequence = ++renderSequence.current;
      renderAbort.current?.abort();
      const controller = new AbortController();
      renderAbort.current = controller;
      const renderSpan = beginPerformanceSpan('render');
      setRendering(true);
      setRenderProgress({
        completed: 0,
        total: Math.max(1, value.layers.length),
      });
      setTiledTelemetry(null);
      setTiledProgress(null);
      // Gesture-preview diagnostics: where the preview rendered and the first
      // layer count it reported (a composite-cache hit reports every layer
      // below the stroke at once).
      let renderPath: 'worker' | 'main' | undefined, firstCompleted: number | undefined;
      try {
        const image = await renderFrameWithWorker(
          value,
          assets.current,
          overrides,
          {
            signal: controller.signal,
            reuseWorker: true,
            tiledRevision: documentRevision.current,
            tiledCache: tiledCache.current,
            isCancelled: () => sequence !== renderSequence.current,
            onRenderPath: (path) => {
              renderPath = path;
              firstCompleted = undefined;
            },
            onProgress: (completed, total) => {
              firstCompleted ??= completed;
              if (sequence === renderSequence.current)
                setRenderProgress({ completed, total });
            },
            onTiledTelemetry: (telemetry) => {
              if (sequence === renderSequence.current) setTiledTelemetry(telemetry);
            },
            onTiledProgress: (progress) => {
              if (sequence === renderSequence.current) setTiledProgress(progress);
            },
          },
        );
        try {
          if (sequence !== renderSequence.current) return;
          if (overrides) markGesturePreview(renderPath, firstCompleted, value.layers.length);
          const target = canvas.current;
          // Present the finished image in one synchronous step, resizing the
          // backing store only when the document size changed.
          if (target) presentCanvasImage(target, image, value.w, value.h);
        } finally {
          closeImageSource(image);
        }
      } catch (error) {
        if (sequence === renderSequence.current)
          onError(
            error instanceof Error
              ? error.message
              : 'Could not render document',
          );
      } finally {
        renderSpan.finish();
        if (sequence === renderSequence.current) setRendering(false);
        if (renderAbort.current === controller) renderAbort.current = null;
      }
    },
    [onError],
  );
  const renderNowRef = useRef(renderNow);
  useEffect(() => {
    renderNowRef.current = renderNow;
  }, [renderNow]);
  /**
   * Render immediately. Any explicit render (commit, undo, cancel, document
   * install) supersedes a scheduled live preview, so a gesture preview can
   * never paint over a newer document state.
   */
  const paint = useCallback(
    (value: Frame, overrides?: Record<string, HTMLCanvasElement>) => {
      previewScheduler.current?.cancel();
      return renderNow(value, overrides);
    },
    [renderNow],
  );
  /**
   * Schedule a coalesced live preview: at most one render in flight and one
   * started per animation frame. The request is evaluated when the frame
   * runs, so it renders the latest gesture buffer; return null when the
   * gesture has ended.
   */
  const schedulePaint = useCallback((request: PreviewRequest<GesturePreview>) => {
    previewScheduler.current ??= createPreviewScheduler<GesturePreview>({
      render: ({ frame: value, overrides }) => renderNowRef.current(value, overrides),
    });
    previewScheduler.current.request(request);
  }, []);
  const cancelScheduledPaint = useCallback(() => previewScheduler.current?.cancel(), []);
  const publish = useCallback(
    (value: Frame) => {
      documentRevision.current += 1;
      setFrame(value);
      setRevision((v) => v + 1);
      void paint(value);
    },
    [paint],
  );
  const commit = useCallback(
    (value: Frame, replace = false, nextAssets?: Assets) => {
      const previousAssets = assets.current;
      if (nextAssets) assets.current = nextAssets;
      try {
        // Stack edits can invalidate a clipping relationship. Repair those
        // links at the history boundary so reorder/delete/group operations
        // remain undoable instead of producing an unusable document.
        const sanitized = sanitizeClippingRelations(value);
        validateFrame(sanitized, assets.current);
        const previousFrame = replace ? undefined : history.current[index.current];
        assertLayerPixelBudgetForEdit(sanitized, previousFrame, assets.current);
        const candidate = replace
          ? [sanitized]
          : [...history.current.slice(0, index.current + 1), sanitized];
        // Oldest undo states go first; the new current frame is always kept.
        const trimmed = trimHistoryToBudget(
          candidate,
          candidate.length - 1,
          assets.current,
          historyBudget,
        );
        // The current document's image data is bounded by this device's
        // budget (see projectLimits.ts); edits that do not grow it are allowed.
        assertAssetByteBudgetForEdit(
          referencedAssets([sanitized], assets.current),
          sanitized,
          previousFrame,
          assets.current,
        );
        const next = trimmed.history;
        const used = referencedAssets(next, assets.current);
        history.current = next;
        index.current = next.length - 1;
        assets.current = used;
        // A replacing commit starts a different document (or drops history);
        // release retained filtered layers before rendering it.
        if (replace) clearLayerFilterCaches();
        publish(sanitized);
        return true;
      } catch (error) {
        assets.current = referencedAssets(history.current, previousAssets);
        if (history.current[index.current])
          void paint(history.current[index.current]);
        onError(
          error instanceof Error ? error.message : 'Edit could not be applied',
        );
        return false;
      }
    },
    [publish, onError, paint, historyBudget],
  );
  const install = useCallback(async (draft: Draft) => {
    const expected = history.current[index.current];
    previewScheduler.current?.cancel();
    renderAbort.current?.abort();
    const installController = new AbortController();
    renderAbort.current = installController;
    const installSequence = ++renderSequence.current;
    const assertCurrentInstall = () => {
      if (installController.signal.aborted || installSequence !== renderSequence.current)
        throw new DOMException('Document import cancelled', 'AbortError');
    };
    setRendering(true);
    setRenderProgress({
      completed: 0,
      total: Math.max(1, draft.history[draft.index].layers.length),
    });
    setTiledTelemetry(null);
    setTiledProgress(null);
    try {
      // Release the previous document's retained filtered layers before the
      // installed one fills the cache. Keys are content-based, so this bounds
      // memory rather than preventing stale reuse.
      clearLayerFilterCaches();
      // Validate every history asset before switching, so undo never
      // discovers a corrupt import. Decodes run a few at a time, are not
      // retained, and overlap the render below instead of preceding it.
      // Sources the render below decodes anyway (a failure there fails the
      // install too) are not decoded twice.
      const rendered = assetsDecodedByRender(draft.history[draft.index], draft.assets);
      const unrendered = Object.entries(draft.assets)
        .filter(([id]) => !rendered.has(id))
        .map(([, asset]) => asset);
      const validation = verifyAssetsDecode(unrendered, {
        concurrency: 4,
        assertCurrent: assertCurrentInstall,
      });
      validation.catch(() => installController.abort());
      // Decode and render before switching documents, preserving the current work on import failure.
      const rendering = renderFrameWithWorker(
        draft.history[draft.index],
        draft.assets,
        undefined,
        {
          signal: installController.signal,
          reuseWorker: true,
          tiledRevision: installSequence,
          tiledCache: tiledCache.current,
          isCancelled: () => installSequence !== renderSequence.current,
          onProgress: (completed, total) => {
            if (installSequence === renderSequence.current)
              setRenderProgress({ completed, total });
          },
          onTiledTelemetry: (telemetry) => {
            if (installSequence === renderSequence.current) setTiledTelemetry(telemetry);
          },
          onTiledProgress: (progress) => {
            if (installSequence === renderSequence.current) setTiledProgress(progress);
          },
        },
      );
      let image: CanvasImageSource;
      try {
        [, image] = await Promise.all([validation, rendering]);
      } catch (error) {
        void rendering.then(
          (rendered) => {
            if ('close' in rendered && typeof rendered.close === 'function') rendered.close();
          },
          () => undefined,
        );
        // A newer import or render superseded this one: report it as such,
        // whichever step noticed first.
        assertCurrentInstall();
        // A failed asset decode cancels the render; report the decode failure.
        await validation;
        assertCurrentInstall();
        throw error;
      }
      try {
        assertCurrentInstall();
        if (history.current[index.current] !== expected)
          throw new Error('Document changed during import. Please try again.');
        assets.current = draft.assets;
        history.current = draft.history;
        index.current = draft.index;
        const installed = draft.history[draft.index];
        presentCanvasImage(canvas.current!, image, installed.w, installed.h);
      } finally {
        closeImageSource(image);
      }
    } catch (error) {
      if (installSequence === renderSequence.current) setRendering(false);
      throw error;
    } finally {
      if (renderAbort.current === installController) renderAbort.current = null;
    }
    setFrame(draft.history[draft.index]);
    setRevision((v) => v + 1);
    if (installSequence === renderSequence.current) setRendering(false);
  }, []);
  const select = useCallback(
    (id: string, intent: LayerSelectionIntent = {}) => {
      const current = history.current[index.current];
      if (!current?.layers.some((l) => l.id === id)) return;
      const next = intent.range
        ? rangeLayerSelection(current, id)
        : toggleLayerSelection(current, id, Boolean(intent.additive));
      history.current[index.current] = next;
      publish(next);
    },
    [publish],
  );
  const setLayerSelection = useCallback(
    (ids: readonly string[], activeId?: string) => {
      const current = history.current[index.current];
      if (!current) return;
      const valid = new Set(current.layers.map((layer) => layer.id));
      const selectedLayerIds = [...new Set(ids)].filter((id) => valid.has(id));
      const active =
        (activeId && valid.has(activeId) ? activeId : undefined) ||
        selectedLayerIds.at(-1) ||
        current.active;
      const next = {
        ...current,
        active,
        selectedLayerIds: selectedLayerIdsForFrame({
          ...current,
          selectedLayerIds,
        }),
      };
      if (
        next.active === current.active &&
        JSON.stringify(next.selectedLayerIds || []) ===
          JSON.stringify(current.selectedLayerIds || [])
      )
        return;
      history.current[index.current] = next;
      publish(next);
    },
    [publish],
  );
  /**
   * Replace the newest history entry (and optionally the `dropPrevious`
   * entries before it) without adding an undo step. Used by automatic layer
   * storage to fold a pixel-identical paint-time expansion step into the
   * stroke (or drop it when the gesture made no change), without
   * re-rendering. Refuses when `expected` is no longer the current entry;
   * like any edit, it discards redo entries above it.
   */
  const amend = useCallback(
    (value: Frame, expected: Frame, dropPrevious = 0, keep: Assets = {}) => {
      if (
        history.current[index.current] !== expected ||
        !Number.isInteger(dropPrevious) ||
        dropPrevious < 0 ||
        dropPrevious > index.current
      )
        return false;
      try {
        const sanitized = sanitizeClippingRelations(value);
        const available = { ...keep, ...assets.current };
        validateFrame(sanitized, available);
        const next = [
          ...history.current.slice(0, index.current - dropPrevious),
          sanitized,
        ];
        history.current = next;
        index.current = next.length - 1;
        assets.current = referencedAssets(next, available);
        documentRevision.current += 1;
        setFrame(sanitized);
        setRevision((v) => v + 1);
        return true;
      } catch {
        return false;
      }
    },
    [],
  );
  /**
   * Replace the entry just below the current one with a pixel-identical frame
   * (e.g. a layer grown in place for a paint tool, restored to its stored
   * bounds once the stroke is committed above it). `keep` re-adds assets the
   * replacement references that history pruning may have released.
   */
  const restorePrevious = useCallback(
    (expectedTop: Frame, expectedPrevious: Frame, value: Frame, keep: Assets = {}) => {
      const below = index.current - 1;
      if (
        below < 0 ||
        history.current[index.current] !== expectedTop ||
        history.current[below] !== expectedPrevious
      )
        return false;
      const nextAssets = { ...keep, ...assets.current };
      try {
        validateFrame(value, nextAssets);
      } catch {
        return false;
      }
      assets.current = nextAssets;
      history.current[below] = value;
      assets.current = referencedAssets(history.current, assets.current);
      return true;
    },
    [],
  );
  const travel = useCallback(
    (direction: number) => {
      const target = index.current + direction;
      if (target < 0 || target >= history.current.length) return;
      index.current = target;
      publish(history.current[target]);
    },
    [publish],
  );
  return {
    canvas,
    assets,
    history,
    index,
    frame,
    revision,
    rendering,
    renderProgress,
    tiledTelemetry,
    tiledProgress,
    tiledCacheBudget,
    historyBudget,
    paint,
    schedulePaint,
    cancelScheduledPaint,
    commit,
    amend,
    restorePrevious,
    install,
    select,
    setLayerSelection,
    travel,
  };
}
