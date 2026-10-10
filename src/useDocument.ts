import { useCallback, useEffect, useRef, useState } from 'react';
import {
  decodeAsset,
  referencedAssets,
  validateFrame,
  type Assets,
  type Frame,
} from './document';
import { sanitizeClippingRelations } from './layerClipping';
import { renderFrameWithWorker } from './workerRender';
import type { Draft } from './drafts';
import { beginPerformanceSpan } from './performanceMarks';
import type { TiledRenderTelemetry } from './tiledDocument';
import {
  rangeLayerSelection,
  selectedLayerIdsForFrame,
  toggleLayerSelection,
} from './layerSelection';

export type RenderProgress = {
  completed: number;
  total: number;
};

export type LayerSelectionIntent = {
  /** Add or remove the clicked layer while preserving the other picks. */
  additive?: boolean;
  /** Select the contiguous range from the current active anchor. */
  range?: boolean;
};

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
  const renderSequence = useRef(0),
    renderAbort = useRef<AbortController | null>(null);
  const closeImageSource = (image: CanvasImageSource) => {
    if ('close' in image && typeof image.close === 'function') image.close();
  };
  useEffect(() => () => renderAbort.current?.abort(), []);
  const paint = useCallback(
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
      try {
        const image = await renderFrameWithWorker(
          value,
          assets.current,
          overrides,
          {
            signal: controller.signal,
            reuseWorker: true,
            tiledRevision: sequence,
            isCancelled: () => sequence !== renderSequence.current,
            onProgress: (completed, total) => {
              if (sequence === renderSequence.current)
                setRenderProgress({ completed, total });
            },
            onTiledTelemetry: (telemetry) => {
              if (sequence === renderSequence.current) setTiledTelemetry(telemetry);
            },
          },
        );
        try {
          if (sequence !== renderSequence.current) return;
          const target = canvas.current;
          if (target) {
            target.width = value.w;
            target.height = value.h;
            target.getContext('2d')!.drawImage(image, 0, 0);
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
  const publish = useCallback(
    (value: Frame) => {
      setFrame(value);
      setRevision((v) => v + 1);
      void paint(value);
    },
    [paint],
  );
  const commit = useCallback(
    (value: Frame, replace = false) => {
      try {
        // Stack edits can invalidate a clipping relationship. Repair those
        // links at the history boundary so reorder/delete/group operations
        // remain undoable instead of producing an unusable document.
        const sanitized = sanitizeClippingRelations(value);
        validateFrame(sanitized, assets.current);
        let next = replace
          ? [sanitized]
          : [...history.current.slice(0, index.current + 1), sanitized];
        let used = referencedAssets(next, assets.current);
        while (
          next.length > 1 &&
          (next.length > 24 ||
            Object.values(used).reduce((n, a) => n + a.url.length, 0) >
              32 * 1024 * 1024)
        ) {
          next = next.slice(1);
          used = referencedAssets(next, assets.current);
        }
        if (
          Object.values(used).reduce((n, a) => n + a.url.length, 0) >
          64 * 1024 * 1024
        )
          throw new Error(
            'This document exceeds 64 MB. Export a copy before adding more images.',
          );
        history.current = next;
        index.current = next.length - 1;
        assets.current = used;
        publish(sanitized);
        return true;
      } catch (error) {
        assets.current = referencedAssets(history.current, assets.current);
        if (history.current[index.current])
          void paint(history.current[index.current]);
        onError(
          error instanceof Error ? error.message : 'Edit could not be applied',
        );
        return false;
      }
    },
    [publish, onError, paint],
  );
  const install = useCallback(async (draft: Draft) => {
    const expected = history.current[index.current];
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
    try {
      // Validate every history asset before switching, so undo never discovers a corrupt import.
      for (const asset of Object.values(draft.assets)) {
        assertCurrentInstall();
        await decodeAsset(asset);
        assertCurrentInstall();
      }
      // Decode and render before switching documents, preserving the current work on import failure.
      const image = await renderFrameWithWorker(
        draft.history[draft.index],
        draft.assets,
        undefined,
        {
          signal: installController.signal,
          reuseWorker: true,
          tiledRevision: installSequence,
          isCancelled: () => installSequence !== renderSequence.current,
          onProgress: (completed, total) => {
            if (installSequence === renderSequence.current)
              setRenderProgress({ completed, total });
          },
          onTiledTelemetry: (telemetry) => {
            if (installSequence === renderSequence.current) setTiledTelemetry(telemetry);
          },
        },
      );
      try {
        assertCurrentInstall();
        if (history.current[index.current] !== expected)
          throw new Error('Document changed during import. Please try again.');
        assets.current = draft.assets;
        history.current = draft.history;
        index.current = draft.index;
        const target = canvas.current!;
        target.width = draft.history[draft.index].w;
        target.height = draft.history[draft.index].h;
        target.getContext('2d')!.drawImage(image, 0, 0);
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
    paint,
    commit,
    install,
    select,
    setLayerSelection,
    travel,
  };
}
