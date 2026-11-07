import { referencedAssets, type Assets, type Frame } from './document.ts';

/**
 * Undo/redo history capacity.
 *
 * History snapshots are immutable `Frame`s that reference shared PNG assets by
 * id. Raster edits add a new asset per step, so the asset bytes — not the frame
 * count — decide how far back a large document can be undone. Both undo steps
 * (before the current index) and redo steps (after it) share one budget.
 *
 * Assets are held as `data:image/png;base64,…` strings. Browsers store these
 * ASCII strings one byte per character, so `url.length` is the retained heap
 * cost of each asset (the decoded PNG is 3/4 of that). Budgets below are in
 * those retained bytes and are counted once per distinct asset id.
 */
export const MIB = 1024 * 1024;
/** Maximum number of history states (undo + current + redo) kept in memory. */
export const HISTORY_MAX_STEPS = 240;
/** Retained history image data on capable desktops (≥ 8 GB hint, not mobile). */
export const HISTORY_DESKTOP_BYTES = 320 * MIB;
/** Retained history image data on phones/tablets or 3–4 GB devices. */
export const HISTORY_STANDARD_BYTES = 128 * MIB;
/** Retained history image data on ≤ 2 GB devices. */
export const HISTORY_LOW_MEMORY_BYTES = 96 * MIB;
/**
 * Hard per-document limit: the current frame alone may not reference more
 * image data than this. It matches the 64 MB local draft / portable project
 * cap, so a document that can be edited can also be saved.
 */
export const DOCUMENT_MAX_ASSET_BYTES = 64 * MIB;
/**
 * Local drafts keep at most this many history states. This is the draft
 * schema limit `validateDraft` enforces for drafts, portable projects and
 * cloud documents (and that older deployed builds still enforce on load).
 */
export const DRAFT_HISTORY_MAX_STEPS = 24;
/**
 * Referenced image data a persisted history window may use: exactly the
 * 64 MB referenced-asset cap of `validateDraft`. Format 3 drafts store each
 * asset once by content hash and write only new ones, so a full window costs
 * one new asset record per edit rather than a whole-history rewrite; frame
 * JSON lives in the manifest, which no longer has a 64 MB payload limit.
 */
export const DRAFT_HISTORY_MAX_BYTES = 64 * MIB;
/** Distinct assets a draft may reference (`validateDraft` / asset-ref limit). */
export const DRAFT_HISTORY_MAX_ASSETS = 768;

export type HistoryBudgetTier = 'desktop' | 'standard' | 'low-memory';
export type HistoryBudget = {
  tier: HistoryBudgetTier;
  maxSteps: number;
  maxBytes: number;
};
export type HistoryDeviceHints = {
  deviceMemory?: number;
  mobile?: boolean;
};

const finitePositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * Pick the history byte budget from coarse, never-persisted browser hints.
 * Unknown desktop memory gets the desktop budget (Safari/Firefox omit the
 * hint); mobile is always capped at the standard tier.
 */
export function historyBudgetForDevice(hints: HistoryDeviceHints = {}): HistoryBudget {
  const memory = finitePositive(hints.deviceMemory) ? hints.deviceMemory : undefined;
  if (memory !== undefined && memory <= 2)
    return { tier: 'low-memory', maxSteps: HISTORY_MAX_STEPS, maxBytes: HISTORY_LOW_MEMORY_BYTES };
  if (hints.mobile === true || (memory !== undefined && memory <= 4))
    return { tier: 'standard', maxSteps: HISTORY_MAX_STEPS, maxBytes: HISTORY_STANDARD_BYTES };
  return { tier: 'desktop', maxSteps: HISTORY_MAX_STEPS, maxBytes: HISTORY_DESKTOP_BYTES };
}

export function detectHistoryBudget(): HistoryBudget {
  if (typeof navigator === 'undefined') return historyBudgetForDevice();
  const browser = navigator as Navigator & { deviceMemory?: number };
  return historyBudgetForDevice({
    deviceMemory: browser.deviceMemory,
    mobile: /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || ''),
  });
}

/** Retained bytes of one asset (one-byte data-URL string). */
export function assetBytes(asset: { url: string } | undefined): number {
  return asset && typeof asset.url === 'string' ? asset.url.length : 0;
}

/** Distinct-asset bytes referenced by a set of frames. */
export function historyAssetBytes(history: readonly Frame[], assets: Assets): number {
  let total = 0;
  for (const asset of Object.values(referencedAssets(history as Frame[], assets)))
    total += assetBytes(asset);
  return total;
}

export const formatMiB = (bytes: number) => `${Math.ceil(bytes / MIB)} MB`;

type Window = { start: number; end: number };

/**
 * Shared window accounting: tracks distinct asset ids across a contiguous
 * frame range with reference counts, so growing or shrinking it is O(frame).
 */
function windowAccounting(history: readonly Frame[], assets: Assets) {
  const ids = history.map((frame) => Object.keys(referencedAssets([frame], assets)));
  const counts = new Map<string, number>();
  let bytes = 0;
  return {
    get bytes() {
      return bytes;
    },
    add(i: number) {
      for (const id of ids[i]) {
        const count = counts.get(id) || 0;
        if (!count) bytes += assetBytes(assets[id]);
        counts.set(id, count + 1);
      }
    },
    remove(i: number) {
      for (const id of ids[i]) {
        const count = counts.get(id) || 0;
        if (count <= 1) {
          counts.delete(id);
          bytes -= assetBytes(assets[id]);
        } else counts.set(id, count - 1);
      }
    },
    /** Bytes the window would cost if frame `i` were added (without adding). */
    costWith(i: number) {
      let next = bytes;
      for (const id of ids[i]) if (!counts.get(id)) next += assetBytes(assets[id]);
      return next;
    },
    /** Distinct assets the window would reference if frame `i` were added. */
    assetsWith(i: number) {
      let next = counts.size;
      for (const id of ids[i]) if (!counts.get(id)) next += 1;
      return next;
    },
  };
}

export type TrimmedHistory = {
  history: Frame[];
  index: number;
  /** Distinct retained image bytes after trimming. */
  bytes: number;
  /** Bytes referenced by the current frame alone. */
  currentBytes: number;
  droppedUndo: number;
  droppedRedo: number;
};

/**
 * Trim a history stack to `budget`. The current frame is always kept. Oldest
 * undo states go first; redo states are dropped (farthest first) only when
 * every undo state is already gone and the budget is still exceeded.
 */
export function trimHistoryToBudget(
  history: readonly Frame[],
  index: number,
  assets: Assets,
  budget: Pick<HistoryBudget, 'maxSteps' | 'maxBytes'>,
): TrimmedHistory {
  if (!history.length || !Number.isInteger(index) || index < 0 || index >= history.length)
    throw new Error('Cannot trim an invalid history position');
  const maxSteps = Math.max(1, Math.floor(budget.maxSteps));
  const account = windowAccounting(history, assets);
  for (let i = 0; i < history.length; i += 1) account.add(i);
  const window: Window = { start: 0, end: history.length - 1 };
  const over = () => window.end - window.start + 1 > maxSteps || account.bytes > budget.maxBytes;
  while (over() && window.start < index) account.remove(window.start++);
  while (over() && window.end > index) account.remove(window.end--);
  const currentBytes = historyAssetBytes([history[index]], assets);
  return {
    history: history.slice(window.start, window.end + 1),
    index: index - window.start,
    bytes: account.bytes,
    currentBytes,
    droppedUndo: window.start,
    droppedRedo: history.length - 1 - window.end,
  };
}

export type PersistedHistoryWindow = {
  /** Inclusive range of in-memory history indexes that are persisted. */
  start: number;
  end: number;
  /** Distinct referenced asset bytes of the persisted window. */
  bytes: number;
  /** In-memory states that are not persisted (memory-only). */
  omittedUndo: number;
  omittedRedo: number;
};


/**
 * Choose the contiguous history range a local save should persist: always the
 * current frame, then neighbouring states alternating undo/redo (nearest
 * first) while the draft step and byte limits allow. When one side cannot fit
 * the other side keeps growing.
 */
export function selectPersistedHistory(
  history: readonly Frame[],
  index: number,
  assets: Assets,
  limits: { maxSteps?: number; maxBytes?: number; maxAssets?: number } = {},
): PersistedHistoryWindow {
  if (!history.length || !Number.isInteger(index) || index < 0 || index >= history.length)
    throw new Error('Cannot persist an invalid history position');
  const maxSteps = Math.max(1, Math.floor(limits.maxSteps ?? DRAFT_HISTORY_MAX_STEPS));
  const maxBytes = limits.maxBytes ?? DRAFT_HISTORY_MAX_BYTES;
  const maxAssets = limits.maxAssets ?? DRAFT_HISTORY_MAX_ASSETS;
  const account = windowAccounting(history, assets);
  account.add(index);
  let start = index,
    end = index,
    undoOpen = start > 0,
    redoOpen = end < history.length - 1,
    preferUndo = true;
  while ((undoOpen || redoOpen) && end - start + 1 < maxSteps) {
    const takeUndo: boolean = undoOpen && (preferUndo || !redoOpen);
    const candidate: number = takeUndo ? start - 1 : end + 1;
    if (account.costWith(candidate) <= maxBytes && account.assetsWith(candidate) <= maxAssets) {
      account.add(candidate);
      if (takeUndo) start = candidate;
      else end = candidate;
      undoOpen = undoOpen && start > 0;
      redoOpen = redoOpen && end < history.length - 1;
    } else if (takeUndo) undoOpen = false;
    else redoOpen = false;
    preferUndo = !takeUndo;
  }
  return {
    start,
    end,
    bytes: account.bytes,
    omittedUndo: start,
    omittedRedo: history.length - 1 - end,
  };
}

type PersistableDraft = {
  history: Frame[];
  index: number;
  assets: Assets;
  settings: { historySourceIndex?: number };
};

/**
 * Restrict a draft-shaped value to its persisted history window, re-basing
 * the index, assets and History Brush source. Returns the original object
 * when the whole history already fits.
 */
export function persistableHistoryDraft<T extends PersistableDraft>(
  value: T,
  limits?: { maxSteps?: number; maxBytes?: number; maxAssets?: number },
): { draft: T; window: PersistedHistoryWindow } {
  const window = selectPersistedHistory(value.history, value.index, value.assets, limits);
  const source = value.settings.historySourceIndex;
  const remapped =
    typeof source === 'number' && source >= window.start && source <= window.end
      ? source - window.start
      : undefined;
  if (!window.omittedUndo && !window.omittedRedo && remapped === source)
    return { draft: value, window };
  const history = value.history.slice(window.start, window.end + 1);
  const settings = { ...value.settings };
  if (remapped === undefined) delete settings.historySourceIndex;
  else settings.historySourceIndex = remapped;
  return {
    draft: {
      ...value,
      history,
      index: value.index - window.start,
      assets: referencedAssets(history, value.assets),
      settings,
    },
    window,
  };
}

/** Plain-language summary of which states survive a reload. */
export function persistedHistoryNote(
  length: number,
  persisted: PersistedHistoryWindow | null | undefined,
): string | undefined {
  if (!persisted || persisted.end >= length) return undefined;
  const omitted = persisted.omittedUndo + persisted.omittedRedo;
  if (!omitted) return undefined;
  const parts = [];
  if (persisted.omittedUndo)
    parts.push(`${persisted.omittedUndo} older step${persisted.omittedUndo === 1 ? '' : 's'}`);
  if (persisted.omittedRedo)
    parts.push(`${persisted.omittedRedo} redo step${persisted.omittedRedo === 1 ? '' : 's'}`);
  return `Steps ${persisted.start + 1}–${persisted.end + 1} are saved on this device; ${parts.join(' and ')} stay in memory only and are not restored after reload.`;
}
