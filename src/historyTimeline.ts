import type { Frame } from './document.ts';

export type HistoryTimelineEntry = {
  index: number;
  label: string;
  activeLayer: string;
  layerCount: number;
  width: number;
  height: number;
  current: boolean;
  reachable: boolean;
};

/**
 * Create stable, privacy-safe labels for the bounded local history stack.
 * History frames intentionally do not retain command names, so the timeline
 * uses the active layer and dimensions while keeping the original frame
 * immutable. This helper is also used by the UI and tests to keep navigation
 * semantics identical across desktop and mobile layouts.
 */
export function summarizeHistory(
  history: readonly Frame[],
  currentIndex: number,
): HistoryTimelineEntry[] {
  const normalizedIndex = Number.isInteger(currentIndex)
    ? Math.max(-1, Math.min(history.length - 1, currentIndex))
    : -1;
  return history.map((frame, index) => {
    const active = frame.layers.find((layer) => layer.id === frame.active);
    const activeLayer = active?.name?.trim() || 'Untitled layer';
    return {
      index,
      activeLayer,
      layerCount: frame.layers.length,
      width: frame.w,
      height: frame.h,
      current: index === normalizedIndex,
      reachable: index <= normalizedIndex,
      label: `${index + 1}. ${activeLayer}`,
    };
  });
}

export function canRestoreHistory(
  history: readonly Frame[],
  currentIndex: number,
  targetIndex: number,
): boolean {
  return (
    history.length > 0 &&
    Number.isInteger(currentIndex) &&
    Number.isInteger(targetIndex) &&
    currentIndex >= 0 &&
    currentIndex < history.length &&
    targetIndex >= 0 &&
    targetIndex < history.length &&
    targetIndex !== currentIndex
  );
}
