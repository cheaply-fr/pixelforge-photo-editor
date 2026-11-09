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

/** Layer keys whose change names a history step, most specific first. */
const LAYER_STEP_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['spotHealing', 'Spot Healing'],
  ['patchStrokes', 'Patch'],
  ['contentAwareFills', 'Content-Aware Fill'],
  ['contentAwareMoves', 'Content-Aware Move'],
  ['contentAwareScales', 'Content-Aware Scale'],
  ['asset', 'Pixel edit'],
  ['text', 'Edit text'],
  ['matrix', 'Transform'],
  ['mask', 'Layer mask'],
  ['vectorMask', 'Vector mask'],
  ['styles', 'Layer style'],
  ['smartFilters', 'Smart filter'],
  ['adjustments', 'Adjustment'],
  ['opacity', 'Layer opacity'],
  ['blend', 'Blend mode'],
  ['visible', 'Layer visibility'],
  ['locked', 'Layer lock'],
  ['name', 'Rename layer'],
];

const changed = (a: unknown, b: unknown) =>
  a !== b && (typeof a !== 'object' || typeof b !== 'object' || JSON.stringify(a) !== JSON.stringify(b));

/**
 * A descriptive name for the change from `previous` to `frame`, derived from
 * the frames themselves (frames keep no command names): the first state is
 * the opening state; otherwise canvas, layer-stack, per-layer and selection
 * differences are named, falling back to "Edit".
 */
export function describeHistoryStep(previous: Frame | undefined, frame: Frame): string {
  if (!previous) return 'Opening state';
  if (previous.w !== frame.w || previous.h !== frame.h) return 'Canvas size';
  if (frame.layers.length > previous.layers.length) return 'New layer';
  if (frame.layers.length < previous.layers.length) return 'Delete layer';
  const before = new Map(previous.layers.map((layer) => [layer.id, layer]));
  if (frame.layers.some((layer, index) => previous.layers[index]?.id !== layer.id))
    return frame.layers.every((layer) => before.has(layer.id)) ? 'Arrange layers' : 'Replace layer';
  for (const layer of frame.layers) {
    const old = before.get(layer.id);
    if (!old || old === layer) continue;
    const record = layer as unknown as Record<string, unknown>, oldRecord = old as unknown as Record<string, unknown>;
    for (const [key, name] of LAYER_STEP_NAMES)
      if (changed(oldRecord[key], record[key])) return name;
  }
  if (changed(previous.selection, frame.selection)) return frame.selection ? 'Selection' : 'Deselect';
  if (previous.active !== frame.active) return 'Select layer';
  return 'Edit';
}

/** History Brush source labels: "1. Opening state · Background". */
export function historySourceLabels(history: readonly Frame[]): string[] {
  return history.map((frame, index) => {
    const active = frame.layers.find((layer) => layer.id === frame.active);
    return `${index + 1}. ${describeHistoryStep(history[index - 1], frame)} · ${active?.name?.trim() || 'Untitled layer'}`;
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
