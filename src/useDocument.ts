import { useCallback, useEffect, useRef, useState } from 'react';
import {
  assertAssetByteBudgetForEdit,
  assertLayerPixelBudgetForEdit,
  assetsDecodedByRender,
  frameCompositeKey,
  surface,
  verifyAssetsDecode,
  referencedAssets,
  validateFrame,
  type Assets,
  type Frame,
} from './document';
import { sanitizeClippingRelations } from './layerClipping';
import { clearLayerFilterCaches, renderFrameWithWorker } from './workerRender';
import { sharedFontLoader } from './fontLoader';
import type { Draft } from './drafts';
import { referencedAudioClips, type AudioClip, type AudioClips } from './audioAnnotations';
import { beginPerformanceSpan } from './performanceMarks';
import { presentCanvasImage } from './canvasPresentation';
import { detectCompositeSnapshotBudget, markCompositeReuse } from './compositeCache';
import { PresentedComposite, retainPresentedComposite } from './presentedComposite';
import { sharedPersistentLayerCache } from './persistentLayerCache';
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

const presentedBudget = detectCompositeSnapshotBudget();

/** Composite-equivalence key of a large frame, or undefined (small frame or failure). */
/**
 * The last presented composite of a large document is also kept on the
 * device (one replaced slot, tagged with its composite key), so reopening the
 * draft shows the finished picture at once while the layers load.
 */
const DRAFT_PREVIEW_SLOT = 'pixelforge:presented-latest';
/** Quiet time after a render before its composite is saved as the preview. */
export const DRAFT_PREVIEW_DELAY_MS = 3000;

/** Diagnostics: a reopened draft showed its saved preview while loading. */
function markDraftPreview(): void {
  try {
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function')
      performance.mark('pixelforge.draft-preview');
  } catch {
    // Diagnostics only.
  }
}

/** Diagnostics: a reopened draft was installed with its saved picture as the composite. */
function markDraftPreviewInstalled(layers: number): void {
  try {
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function')
      performance.mark('pixelforge.draft-preview-installed', { detail: { layers } });
  } catch {
    // Diagnostics only.
  }
}

/** Diagnostics: the background render after a preview install finished or stopped. */
function markWarm(detail: { completed: boolean; ms: number }): void {
  try {
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function')
      performance.mark('pixelforge.draft-warm', { detail });
  } catch {
    // Diagnostics only.
  }
}

async function presentedKey(value: Frame, assets: Assets): Promise<string | undefined> {
  if (!retainPresentedComposite(value.w, value.h, value.layers.length, presentedBudget)) return undefined;
  try {
    return await frameCompositeKey(value, assets);
  } catch {
    return undefined;
  }
}

/** Diagnostics: a render answered from the kept copy (no worker round trip). */
function markPresentedReuse(layers: number): void {
  try {
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function')
      performance.mark('pixelforge.presented-composite', { detail: { layers } });
  } catch {
    // Diagnostics must never affect rendering.
  }
}

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
    // Audio Annotation clips (draft-level, like assets; see audioAnnotations.ts).
    audio = useRef<AudioClips>({}),
    history = useRef<Frame[]>([]),
    index = useRef(-1);
  const [frame, setFrame] = useState<Frame | null>(null),
    [revision, setRevision] = useState(0),
    [rendering, setRendering] = useState(false),
    // Keep the latest bounded sample after completion for diagnostics and
    // assistive technology. A new render resets it to zero.
    [renderProgress, setRenderProgress] = useState<RenderProgress | null>(null);
  const [tiledTelemetry, setTiledTelemetry] = useState<TiledRenderTelemetry | null>(null);
  // A draft being opened shows its saved picture while its layers load.
  const [openingPreview, setOpeningPreview] = useState(false);
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
  // Copy of the last presented composite of a large document; an edit that
  // cannot change a pixel re-presents it instead of rendering
  // (src/presentedComposite.ts).
  const presented = useRef(new PresentedComposite<HTMLCanvasElement>());
  /**
   * Keep a copy of what the canvas now shows, under `key`. `immediate` saves
   * it as the draft preview right away (a just-opened draft: nothing is being
   * edited, and a reload soon after must still find it) instead of after
   * DRAFT_PREVIEW_DELAY_MS of quiet.
   */
  const keepPresented = (target: HTMLCanvasElement, key: string | undefined, w: number, h: number, immediate = false) => {
    const kept = presented.current;
    if (key === undefined) {
      kept.clear();
      return;
    }
    const copy = kept.reusable(w, h) ?? surface(w, h);
    kept.clear();
    const context = copy.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, w, h);
    context.drawImage(target, 0, 0);
    kept.store(key, w, h, copy);
    // Open the store and hash the slot key now, so leaving the page can
    // write the preview synchronously.
    sharedPersistentLayerCache(surface)?.prepare(DRAFT_PREVIEW_SLOT);
    schedulePreviewSave(key, w, h, immediate ? 0 : DRAFT_PREVIEW_DELAY_MS);
  };
  const previewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The preview save waiting for quiet, if any (flushed when the page is hidden). */
  const previewDue = useRef<{ key: string; w: number; h: number } | undefined>(undefined);
  /** Composite key of the stored preview, once its write has completed. */
  const previewSaved = useRef<string | undefined>(undefined);
  const previewRetried = useRef<string | undefined>(undefined);
  /** Save the kept copy as the draft preview now, if it still shows `key`. */
  const savePreviewNow = (key: string, w: number, h: number) => {
    previewDue.current = undefined;
    const kept = presented.current;
    const copy = kept.key === key ? kept.reusable(w, h) : undefined;
    if (!copy || previewSaved.current === key) return;
    const store = sharedPersistentLayerCache(surface);
    if (!store) return;
    // The encoder snapshots the copy now; the next copy may reuse it. Only a
    // completed write counts as saved: one dropped because the previous
    // preview was still being written is retried once.
    void store.put(DRAFT_PREVIEW_SLOT, copy, w, h, key).then((stored) => {
      if (stored) previewSaved.current = key;
      else if (previewRetried.current !== key && presented.current.key === key) {
        previewRetried.current = key;
        schedulePreviewSave(key, w, h, DRAFT_PREVIEW_DELAY_MS);
      }
    });
  };
  /** Save the kept copy as the draft preview once rendering has been quiet a while. */
  const schedulePreviewSave = (key: string, w: number, h: number, delay: number) => {
    clearTimeout(previewTimer.current);
    previewDue.current = { key, w, h };
    previewTimer.current = setTimeout(() => savePreviewNow(key, w, h), delay);
  };
  const closeImageSource = (image: CanvasImageSource) => {
    if ('close' in image && typeof image.close === 'function') image.close();
  };
  /**
   * Render a document installed from its saved picture in the background,
   * without presenting the result or showing progress, so the worker's
   * layer and composite caches are ready for the first edit. Any other
   * render or install supersedes it.
   */
  const warm = (value: Frame) => {
    const controller = new AbortController();
    warmAbort.current?.abort();
    warmAbort.current = controller;
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const stopped = () => controller.signal.aborted;
    void renderFrameWithWorker(value, assets.current, undefined, {
      signal: controller.signal,
      reuseWorker: true,
      tiledRevision: documentRevision.current,
      tiledCache: tiledCache.current,
      isCancelled: stopped,
    }).then(
      (image) => {
        closeImageSource(image);
        markWarm({ completed: !stopped(), ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - started) });
      },
      () => markWarm({ completed: false, ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - started) }),
    ).finally(() => {
      if (warmAbort.current === controller) warmAbort.current = null;
    });
  };
  const warmAbort = useRef<AbortController | null>(null);
  const previewScheduler = useRef<PreviewScheduler<GesturePreview> | null>(null);
  useEffect(() => {
    // Leaving the page (tab switch, close, reload) writes a pending preview
    // now rather than losing it with the quiet timer. The write is encoded
    // and issued synchronously: a reload or close does not wait for an
    // async encode and transaction. When that is not possible (the store is
    // not open yet) the usual async write is started, which still completes
    // when the page is only hidden.
    const onHide = () => {
      const due = previewDue.current;
      if (!due) return;
      clearTimeout(previewTimer.current);
      const kept = presented.current;
      const copy = kept.key === due.key ? kept.reusable(due.w, due.h) : undefined;
      if (copy && previewSaved.current !== due.key &&
        sharedPersistentLayerCache(surface)?.putNow(DRAFT_PREVIEW_SLOT, copy, due.w, due.h, due.key)) {
        previewDue.current = undefined;
        previewSaved.current = due.key;
        return;
      }
      savePreviewNow(due.key, due.w, due.h);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
    };
  }, []);
  useEffect(
    () => () => {
      previewScheduler.current?.cancel();
      renderAbort.current?.abort();
      warmAbort.current?.abort();
      clearTimeout(previewTimer.current);
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
        // An edit that cannot change a pixel (an empty layer added or
        // deleted, a rename, a reselect, their undo) shows the kept copy.
        const key = overrides ? undefined : await presentedKey(value, assets.current);
        if (sequence !== renderSequence.current) return;
        const kept = presented.current.match(key, value.w, value.h);
        if (kept && canvas.current) {
          presentCanvasImage(canvas.current, kept, value.w, value.h);
          setRenderProgress({ completed: value.layers.length, total: Math.max(1, value.layers.length) });
          markCompositeReuse({ final: true });
          markPresentedReuse(value.layers.length);
          return;
        }
        // This render needs the worker: a background warm-up yields to it
        // (the layers it finished stay in the worker's caches).
        warmAbort.current?.abort();
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
          if (target) {
            presentCanvasImage(target, image, value.w, value.h);
            // Previews leave the copy as it is: it still shows its own key.
            if (!overrides) keepPresented(target, key, value.w, value.h);
          }
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
  // A library font that timed out or failed rendered with the fallback;
  // redraw once it arrives so the canvas shows the chosen font.
  useEffect(() => {
    const fellBack = new Set<string>();
    return sharedFontLoader().subscribe((family, state) => {
      if (state === 'failed') fellBack.add(family);
      if (state !== 'loaded' || !fellBack.delete(family)) return;
      const value = history.current[index.current];
      if (value?.layers.some((layer) => layer.kind === 'text' && layer.fontFamily === family)) {
        // The kept copy shows the fallback font under the same key.
        presented.current.clear();
        void renderNowRef.current(value);
      }
    });
  }, []);
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
  /** Add a recorded/attached clip, dropping clips no history frame references. */
  const addAudioClip = useCallback((id: string, clip: AudioClip) => {
    audio.current = { ...referencedAudioClips(history.current, audio.current), [id]: clip };
  }, []);
  const install = useCallback(async (draft: Draft) => {
    const expected = history.current[index.current];
    previewScheduler.current?.cancel();
    renderAbort.current?.abort();
    warmAbort.current?.abort();
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
    let previewShown = false;
    let finishedByPreviewOuter = false;
    try {
      // Release the previous document's retained filtered layers before the
      // installed one fills the cache. Keys are content-based, so this bounds
      // memory rather than preventing stale reuse.
      clearLayerFilterCaches();
      presented.current.clear();
      const installedKey = presentedKey(draft.history[draft.index], draft.assets);
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
      // The saved picture of this exact document state (tagged with its
      // composite key, so equal pixels) is shown while the layers load. Once
      // shown it is the finished composite: the install completes with it
      // instead of waiting for every layer, and the layers then render in
      // the background (`warm`) so the first edit finds the worker's caches.
      let installRendered = false;
      const installedFrame = draft.history[draft.index];
      const previewLookup = installedKey.then(async (key) => {
        const store = key ? sharedPersistentLayerCache(surface) : undefined;
        const found = store ? await store.getTagged(DRAFT_PREVIEW_SLOT, key) : undefined;
        if (!found || installRendered || installSequence !== renderSequence.current || !canvas.current) return false;
        presentCanvasImage(canvas.current, found.surface as HTMLCanvasElement, installedFrame.w, installedFrame.h);
        previewShown = true;
        previewSaved.current = key;
        setOpeningPreview(true);
        markDraftPreview();
        return true;
      }).catch(() => false);
      // The render has its own signal: finishing with the preview cancels it
      // without cancelling the install.
      const renderController = new AbortController();
      installController.signal.addEventListener('abort', () => renderController.abort(), { once: true });
      // Decode and render before switching documents, preserving the current work on import failure.
      const rendering = renderFrameWithWorker(
        draft.history[draft.index],
        draft.assets,
        undefined,
        {
          signal: renderController.signal,
          reuseWorker: true,
          tiledRevision: installSequence,
          tiledCache: tiledCache.current,
          isCancelled: () => renderController.signal.aborted || installSequence !== renderSequence.current,
          onProgress: (completed, total) => {
            if (installSequence === renderSequence.current && !renderController.signal.aborted)
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
      const releaseRendering = () =>
        void rendering.then(
          (rendered) => {
            if ('close' in rendered && typeof rendered.close === 'function') rendered.close();
          },
          () => undefined,
        );
      let image: CanvasImageSource | undefined;
      let finishedByPreview = false;
      try {
        type First = { rendered: CanvasImageSource } | { preview: true };
        const first = await Promise.race<First>([
          rendering.then((rendered): First => ({ rendered })),
          previewLookup.then((shown): First | Promise<First> =>
            shown ? { preview: true } : rendering.then((rendered): First => ({ rendered })),
          ),
        ]);
        if ('rendered' in first) image = first.rendered;
        else {
          finishedByPreview = true;
          renderController.abort();
          releaseRendering();
        }
        await validation;
        // Test hook: hold the finished composite so a spec can observe the preview.
        const hold = (globalThis as { __PIXELFORGE_INSTALL_HOLD_MS__?: number }).__PIXELFORGE_INSTALL_HOLD_MS__;
        if (typeof hold === 'number' && hold > 0) await new Promise((resolve) => setTimeout(resolve, hold));
        installRendered = true;
      } catch (error) {
        installRendered = true;
        releaseRendering();
        // A newer import or render superseded this one: report it as such,
        // whichever step noticed first.
        assertCurrentInstall();
        // A failed asset decode cancels the render; report the decode failure.
        await validation;
        assertCurrentInstall();
        throw error;
      }
      try {
        const keyOfInstalled = await installedKey;
        assertCurrentInstall();
        if (history.current[index.current] !== expected)
          throw new Error('Document changed during import. Please try again.');
        assets.current = draft.assets;
        audio.current = draft.audio || {};
        history.current = draft.history;
        index.current = draft.index;
        const installed = draft.history[draft.index];
        // With the preview, the canvas already shows the finished composite.
        if (image) presentCanvasImage(canvas.current!, image, installed.w, installed.h);
        keepPresented(canvas.current!, keyOfInstalled, installed.w, installed.h, true);
        if (finishedByPreview) markDraftPreviewInstalled(installed.layers.length);
        finishedByPreviewOuter = finishedByPreview;
      } finally {
        if (image) closeImageSource(image);
      }
    } catch (error) {
      if (installSequence === renderSequence.current) {
        setRendering(false);
        // The canvas showed the failed draft's preview: show the kept document again.
        if (previewShown && expected) void renderNowRef.current(expected);
      }
      throw error;
    } finally {
      if (renderAbort.current === installController) renderAbort.current = null;
      setOpeningPreview(false);
    }
    setFrame(draft.history[draft.index]);
    setRevision((v) => v + 1);
    if (installSequence === renderSequence.current) {
      setRendering(false);
      if (finishedByPreviewOuter) warm(draft.history[draft.index]);
    }
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
    audio,
    addAudioClip,
    history,
    index,
    frame,
    revision,
    rendering,
    renderProgress,
    openingPreview,
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
