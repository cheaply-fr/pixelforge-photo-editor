import type { CloudLink } from './cloud';
import {
  EXPORT_FORMATS,
  validExportQuality,
  validExportTargetBytes,
  type ExportFormat,
} from './export.ts';
import {
  validAsset,
  validateFrame,
  validAdjustments,
  referencedAssets,
  commonLayer,
  effectiveAdjustments,
  effectiveTextLayer,
  neutral,
  validId,
  type Assets,
  type Frame,
  type Adjustments,
} from './document.ts';
import { validPhotoAdjustments } from './photoAdjustments.ts';
import { effectiveImageSize } from './imageSize.ts';
import {
  effectiveBrushPressureSettings,
  validBrushPressureSettings,
  type BrushPressureSettings,
} from './brush.ts';
import {
  PATTERN_IDS,
  normalizePatternTileSize,
  type PatternId,
} from './patternStamp.ts';
import { beginPerformanceSpan } from './performanceMarks.ts';
export type Tool =
  | 'move'
  | 'hand'
  | 'zoom'
  | 'eyedropper'
  | 'color-sampler'
  | 'ruler'
  | 'note'
  | 'count'
  | 'fill'
  | 'gradient'
  | 'clone'
  | 'heal'
  | 'spot-heal'
  | 'patch'
  | 'red-eye'
  | 'pattern-stamp'
  | 'crop'
  | 'perspective-crop'
  | 'slice'
  | 'brush'
  | 'pencil'
  | 'color-replace'
  | 'eraser'
  | 'background-eraser'
  | 'magic-eraser'
  | 'dodge'
  | 'burn'
  | 'sponge'
  | 'smudge'
  | 'text'
  | 'pen'
  | 'direct-select'
  | 'rectangle'
  | 'ellipse'
  | 'line'
  | 'polygon'
  | 'select'
  | 'ellipse-select'
  | 'row-select'
  | 'column-select'
  | 'lasso'
  | 'polygonal-lasso'
  | 'selection-brush'
  | 'magic-wand';
export type Shot = { url: string; w: number; h: number };
export type Settings = {
  tool: Tool;
  zoom: number;
  color: string;
  /** Photoshop-compatible foreground/background pair. Older drafts omit the background. */
  backgroundColor?: string;
  size: number;
  brushOpacity?: number;
  hardness?: number;
  /** Opt-in pen/touch pressure mapping for configured brush diameter. */
  pressureSize?: boolean;
  /** Opt-in pen/touch pressure mapping for brush alpha. */
  pressureOpacity?: boolean;
  /** Deterministic local source selected by Pattern Stamp. */
  patternId?: PatternId;
  /** Bounded tile edge in canvas pixels for Pattern Stamp. */
  patternTileSize?: number;
  /** Conservative local Red Eye correction threshold and strength. */
  redEyeThreshold?: number;
  redEyeAmount?: number;
  colorTolerance?: number;
  /** Tonal retouch settings persisted with the active tool. */
  tonalExposure?: number;
  tonalRange?: 'shadows' | 'midtones' | 'highlights';
  spongeMode?: 'saturate' | 'desaturate';
  spongeVibrance?: number;
  exportFormat?: ExportFormat;
  exportQuality?: number;
  /** Optional lossy-export target in bytes; absent means manual quality mode. */
  exportTargetBytes?: number;
  text: string;
  fontSize: number;
  brightness: number;
  contrast: number;
  saturation: number;
  /** Nondestructive hue rotation in degrees (-180..180). */
  hue: number;
  blur: number;
  filter: string;
  colorBalance: Adjustments['colorBalance'];
  sharpenNoise: Adjustments['sharpenNoise'];
  curves: Adjustments['curves'];
};
export type Draft = {
  version: 2;
  localRevision?: number;
  cloud?: CloudLink;
  history: Frame[];
  assets: Assets;
  index: number;
  name: string;
  settings: Settings;
  migrated?: true;
};
export const CURRENT_DRAFT_VERSION = 2 as const;

/**
 * Cloud links are persisted in local drafts, but their values come from a
 * network response. Keep them opaque while rejecting control characters and
 * unbounded strings before they reach the IndexedDB record or a request body.
 */
export function validCloudLink(value: unknown): value is CloudLink {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<CloudLink>;
  const safe = (entry: unknown) =>
    typeof entry === 'string' &&
    entry.length >= 1 &&
    entry.length <= 160 &&
    !Array.from(entry).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    });
  return [candidate.id, candidate.generation, candidate.owner].every(safe);
}

const validRevision = (value: unknown): value is number =>
  Number.isInteger(value) &&
  Number(value) >= 0 &&
  Number(value) <= Number.MAX_SAFE_INTEGER;

/**
 * Recovery must never replace in-memory edits with an equal or older record.
 * A strict revision comparison makes a second recovery read safe when tabs
 * race one another or a draft was already replaced.
 */
export function isNewerDraftRevision(
  currentRevision: unknown,
  candidateRevision: unknown,
): candidateRevision is number {
  return (
    validRevision(currentRevision) &&
    validRevision(candidateRevision) &&
    candidateRevision > currentRevision
  );
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
let database: Promise<IDBDatabase> | undefined;
function validSettings(settings: unknown): settings is Settings {
  if (!record(settings)) return false;
  const candidate = settings as Partial<Settings>;
  if (
    ![
      'move',
      'hand',
      'zoom',
      'eyedropper',
      'color-sampler',
      'ruler',
      'note',
      'count',
      'fill',
      'gradient',
      'clone',
      'heal',
      'spot-heal',
      'patch',
      'red-eye',
      'pattern-stamp',
      'crop',
      'perspective-crop',
      'slice',
      'brush',
      'pencil',
      'color-replace',
      'eraser',
      'background-eraser',
      'magic-eraser',
      'dodge',
      'burn',
      'sponge',
      'smudge',
      'text',
      'pen',
      'direct-select',
      'rectangle',
      'ellipse',
      'line',
      'polygon',
      'select',
      'ellipse-select',
      'row-select',
      'column-select',
      'lasso',
      'polygonal-lasso',
      'selection-brush',
      'magic-wand',
    ].includes(candidate.tool as Tool) ||
    typeof candidate.text !== 'string' ||
    candidate.text.length > 10000 ||
    (candidate.exportFormat !== undefined &&
      !EXPORT_FORMATS.includes(candidate.exportFormat)) ||
    (candidate.exportQuality !== undefined &&
      !validExportQuality(candidate.exportQuality)) ||
    (candidate.exportTargetBytes !== undefined &&
      !validExportTargetBytes(candidate.exportTargetBytes)) ||
    typeof candidate.color !== 'string' ||
    !/^#[a-f\d]{6}$/i.test(candidate.color) ||
    (candidate.backgroundColor !== undefined &&
      (typeof candidate.backgroundColor !== 'string' ||
        !/^#[a-f\d]{6}$/i.test(candidate.backgroundColor))) ||
    !validBrushPressureSettings(candidate) ||
    (candidate.patternId !== undefined &&
      !PATTERN_IDS.includes(candidate.patternId as PatternId)) ||
    (candidate.redEyeThreshold !== undefined &&
      (typeof candidate.redEyeThreshold !== 'number' ||
        !Number.isFinite(candidate.redEyeThreshold) ||
        candidate.redEyeThreshold < 0 ||
        candidate.redEyeThreshold > 255)) ||
    (candidate.redEyeAmount !== undefined &&
      (typeof candidate.redEyeAmount !== 'number' ||
        !Number.isFinite(candidate.redEyeAmount) ||
        candidate.redEyeAmount < 0 ||
        candidate.redEyeAmount > 100))
  )
    return false;
  const ranges: [number, number, number][] = [
    [candidate.zoom as number, 20, 140],
    [candidate.size as number, 2, 100],
    [candidate.fontSize as number, 16, 160],
  ];
  const brushRanges: [number, number, number][] = [
    [candidate.brushOpacity ?? 100, 1, 100] as [number, number, number],
    [candidate.hardness ?? 100, 0, 100] as [number, number, number],
    [candidate.colorTolerance ?? 24, 0, 255] as [number, number, number],
    [candidate.tonalExposure ?? 50, 1, 100] as [number, number, number],
    [candidate.spongeVibrance ?? 50, 1, 100] as [number, number, number],
  ];
  if (candidate.patternTileSize !== undefined) {
    try {
      normalizePatternTileSize(candidate.patternTileSize);
    } catch {
      return false;
    }
  }
  return (
    ranges.every(
      ([value, min, max]) =>
        Number.isFinite(value) && value >= min && value <= max,
    ) &&
    brushRanges.every(
      ([value, min, max]) =>
        Number.isFinite(value) && value >= min && value <= max,
    ) &&
    (candidate.pressureSize === undefined ||
      typeof candidate.pressureSize === 'boolean') &&
    (candidate.pressureOpacity === undefined ||
      typeof candidate.pressureOpacity === 'boolean') &&
    (candidate.tonalRange === undefined ||
      ['shadows', 'midtones', 'highlights'].includes(candidate.tonalRange)) &&
    (candidate.spongeMode === undefined ||
      ['saturate', 'desaturate'].includes(candidate.spongeMode)) &&
    validAdjustments(candidate as Partial<Adjustments>)
  );
}
type DraftCandidate = Omit<Draft, 'version' | 'settings' | 'history'> & {
  version: number;
  settings: unknown;
  history: unknown;
};
type DraftMigration = (value: DraftCandidate, settings: Settings) => Draft;

function validRawPhotoMetadata(history: unknown): boolean {
  if (!Array.isArray(history)) return true;
  return history.every((frame) => {
    if (!record(frame) || !Array.isArray(frame.layers)) return true;
    return frame.layers.every((layer) => {
      if (!record(layer) || !record(layer.adjustments)) return true;
      const value = layer.adjustments.photoAdjustments;
      return value === undefined || validPhotoAdjustments(value);
    });
  });
}

/** Versioned migration registry; unknown document versions fail closed. */
export const DRAFT_MIGRATIONS: Readonly<Record<number, DraftMigration>> = {
  1: (value, settings) => {
    const assets: Assets = {},
      id = crypto.randomUUID();
    const history = (value.history as unknown as Shot[]).map((shot) => {
      if (!validAsset(shot))
        throw new Error('Saved image is invalid or too large');
      const asset =
        Object.keys(assets).find((key) => assets[key].url === shot.url) ||
        crypto.randomUUID();
      assets[asset] = shot;
      return {
        w: shot.w,
        h: shot.h,
        imageSize: { resolution: 72, resolutionUnit: 'ppi' as const },
        active: id,
        layers: [
          {
            ...commonLayer('Background'),
            id,
            kind: 'raster' as const,
            asset,
            adjustments: {
              ...neutral,
              brightness: settings.brightness,
              contrast: settings.contrast,
              saturation: settings.saturation,
              blur: settings.blur,
              filter: settings.filter,
            },
          },
        ],
      };
    });
    return {
      ...value,
      version: CURRENT_DRAFT_VERSION,
      assets,
      history,
      settings: {
        ...settings,
        ...neutral,
        ...effectiveBrushPressureSettings(settings as BrushPressureSettings),
      },
      migrated: true,
    } as Draft;
  },
};
export function validateDraft(input: unknown): Draft {
  if (!record(input)) throw new Error('Invalid project file');
  const value = input as DraftCandidate;
  if (value.version !== 1 && value.version !== CURRENT_DRAFT_VERSION)
    throw new Error('Unsupported project version');
  if (!validRawPhotoMetadata(value.history))
    throw new Error('Saved document is not supported');
  // v2 drafts created before Levels shipped omit its three fields. Normalize
  // them at the persistence boundary so the UI and renderer always receive a
  // complete adjustment record while keeping old bookmarks importable.
  const settings =
    value.settings && typeof value.settings === 'object'
      ? {
          ...value.settings,
          ...effectiveAdjustments(value.settings),
          ...effectiveBrushPressureSettings(
            value.settings as BrushPressureSettings,
          ),
        }
      : value.settings;
  if (
    !Array.isArray(value.history) ||
    !value.history.length ||
    value.history.length > 24 ||
    !Number.isInteger(value.index) ||
    value.index < 0 ||
    value.index >= value.history.length ||
    !validSettings(settings) ||
    typeof value.name !== 'string' ||
    value.name.length > 160
  )
    throw new Error('Saved document is not supported');
  if (value.localRevision !== undefined && !validRevision(value.localRevision))
    throw new Error('Invalid project revision');
  if (value.cloud !== undefined && !validCloudLink(value.cloud))
    throw new Error('Invalid cloud project link');
  if (value.version !== CURRENT_DRAFT_VERSION)
    return DRAFT_MIGRATIONS[value.version](value, settings as Settings);
  if (
    value.version !== CURRENT_DRAFT_VERSION ||
    !value.assets ||
    typeof value.assets !== 'object' ||
    Array.isArray(value.assets) ||
    Object.keys(value.assets).length > 768 ||
    Object.entries(value.assets).some(
      ([id, asset]) => !validId(id) || !validAsset(asset),
    )
  )
    throw new Error('Invalid project assets');
  const history = (value.history as Frame[]).map((frame) => ({
    ...frame,
    imageSize: effectiveImageSize(frame.imageSize),
    layers: frame.layers.map((layer) =>
      effectiveTextLayer(
        {
          ...layer,
          adjustments: effectiveAdjustments(layer.adjustments),
        },
        frame.w,
      ),
    ),
  }));
  history.forEach((frame) => validateFrame(frame, value.assets));
  if (
    Object.values(value.assets).reduce(
      (total, asset) => total + asset.url.length,
      0,
    ) >
    64 * 1024 * 1024
  )
    throw new Error('Project assets exceed 64 MB');
  return {
    ...value,
    version: CURRENT_DRAFT_VERSION,
    history,
    settings: settings as Settings,
    assets: referencedAssets(history, value.assets),
  };
}

/** Validate and normalize a value immediately before writing it to storage. */
export function prepareDraftForStorage(value: unknown): Draft {
  return validateDraft(value);
}
function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('pixelforge-documents', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Local storage is blocked'));
  });
  return database;
}

export function rememberDraft(id: string) {
  const url = new URL(location.href);
  url.pathname = '/editor';
  url.searchParams.delete('new');
  url.hash = 'draft=' + id;
  window.history.replaceState(null, '', url);
  try {
    localStorage.setItem('pixelforge:last-draft', id);
  } catch {
    /* IndexedDB can still be available. */
  }
  return id;
}

export function createDraftId() {
  return rememberDraft(crypto.randomUUID());
}

export function initialDraftId() {
  if (new URL(location.href).searchParams.get('new') === '1')
    return createDraftId();
  let id = new URLSearchParams(location.hash.slice(1)).get('draft');
  if (!id) {
    try {
      id = localStorage.getItem('pixelforge:last-draft');
    } catch {
      /* Use a new draft. */
    }
  }
  return id && /^[a-f0-9-]{36}$/.test(id) ? rememberDraft(id) : createDraftId();
}

export const LOCAL_CONFLICT =
  'This draft changed in another tab. Save a local copy to keep your edits.';
const PENDING_DRAFT_PREFIX = 'pixelforge:pending-draft:';
const MAX_PENDING_DRAFT_BYTES = 4 * 1024 * 1024;

type PendingDraftRecord = { token?: string; draft: Draft };

let pendingTokenCounter = 0;
function newPendingToken(): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : undefined;
  return (
    uuid || `${Date.now().toString(36)}-${(++pendingTokenCounter).toString(36)}`
  );
}

/**
 * A completed IndexedDB write may only clear the exact write-ahead snapshot
 * that it persisted. Tokens prevent an earlier queued save from deleting a
 * newer snapshot staged by the same tab.
 */
export function pendingDraftCanBeCleared(
  pendingToken: unknown,
  completedToken: unknown,
  pendingRevision: unknown,
  completedRevision: unknown,
): boolean {
  if (typeof completedToken === 'string')
    return typeof pendingToken === 'string' && pendingToken === completedToken;
  // Backward compatibility for snapshots written before token support.
  return (
    pendingToken === undefined &&
    validRevision(pendingRevision) &&
    validRevision(completedRevision) &&
    pendingRevision <= completedRevision
  );
}

/** Keep staged revisions ahead of an IndexedDB write that is still queued. */
export function nextPendingDraftRevision(
  requestedRevision: unknown,
  previousRevision: unknown,
): number | undefined {
  if (!validRevision(requestedRevision) || !validRevision(previousRevision))
    return validRevision(requestedRevision) ? requestedRevision : undefined;
  if (previousRevision >= Number.MAX_SAFE_INTEGER) return undefined;
  const next = Math.max(requestedRevision, previousRevision + 1);
  return validRevision(next) ? next : undefined;
}

/**
 * Write a tab-scoped write-ahead snapshot before IndexedDB completes. This
 * closes the small reload window without sharing an in-flight draft between
 * tabs; oversized projects simply rely on IndexedDB as before.
 */
export function stagePendingDraft(
  id: string,
  value: Draft,
  revision: number,
): string | undefined {
  if (!validId(id) || !validRevision(revision)) return undefined;
  try {
    const previous = readPendingDraft(id);
    const stagedRevision = nextPendingDraftRevision(
      revision,
      previous?.draft.localRevision,
    );
    if (stagedRevision === undefined) return undefined;
    const safe = prepareDraftForStorage({
      ...value,
      localRevision: stagedRevision,
    });
    const token = newPendingToken();
    const encoded = JSON.stringify({ token, draft: safe });
    if (encoded.length > MAX_PENDING_DRAFT_BYTES) return undefined;
    sessionStorage.setItem(PENDING_DRAFT_PREFIX + id, encoded);
    return token;
  } catch {
    /* Session storage can be unavailable or too small; IndexedDB remains authoritative. */
    return undefined;
  }
}

function readPendingDraft(id: string): PendingDraftRecord | undefined {
  try {
    const encoded = sessionStorage.getItem(PENDING_DRAFT_PREFIX + id);
    if (!encoded) return undefined;
    const parsed: unknown = JSON.parse(encoded);
    if (record(parsed) && 'draft' in parsed) {
      const token = typeof parsed.token === 'string' ? parsed.token : undefined;
      return { token, draft: validateDraft(parsed.draft) };
    }
    // Read snapshots written by the pre-token implementation.
    return { draft: validateDraft(parsed) };
  } catch {
    try {
      sessionStorage.removeItem(PENDING_DRAFT_PREFIX + id);
    } catch {
      /* Ignore blocked storage. */
    }
    return undefined;
  }
}

function clearPendingDraft(id: string, revision: number, token?: string): void {
  try {
    const pending = readPendingDraft(id);
    if (
      !pending ||
      pendingDraftCanBeCleared(
        pending.token,
        token,
        pending.draft.localRevision,
        revision,
      )
    )
      sessionStorage.removeItem(PENDING_DRAFT_PREFIX + id);
  } catch {
    /* Ignore blocked storage. */
  }
}

export async function discardDraft(id: string, expectedRevision: number) {
  if (!validId(id)) throw new Error('Invalid draft ID');
  if (!validRevision(expectedRevision))
    throw new Error('Invalid draft revision');
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('drafts', 'readwrite');
    const store = transaction.objectStore('drafts');
    let conflict = false;
    const read = store.get(id);
    read.onsuccess = () => {
      if ((read.result?.localRevision || 0) !== expectedRevision) {
        conflict = true;
        transaction.abort();
        return;
      }
      store.delete(id);
    };
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(conflict ? new Error(LOCAL_CONFLICT) : transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
  try {
    if (localStorage.getItem('pixelforge:last-draft') === id)
      localStorage.removeItem('pixelforge:last-draft');
    sessionStorage.removeItem(PENDING_DRAFT_PREFIX + id);
  } catch {
    /* Already unavailable. */
  }
}

export async function readDraft(id: string): Promise<Draft | undefined> {
  if (!validId(id)) throw new Error('Invalid draft ID');
  const pending = readPendingDraft(id);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('drafts').objectStore('drafts').get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const value = request.result as Draft | undefined;
      if (value === undefined) {
        resolve(pending?.draft);
        return;
      }
      try {
        const saved = validateDraft(value);
        if (
          !pending ||
          (pending.draft.localRevision || 0) < (saved.localRevision || 0)
        ) {
          resolve(saved);
          return;
        }
        // The session snapshot may have been staged just before a reload while
        // its IndexedDB transaction was still in flight. Rebase the pending
        // value onto the revision that actually exists so the first save after
        // recovery can commit it instead of reporting a false conflict.
        if ((pending.draft.localRevision || 0) === (saved.localRevision || 0)) {
          resolve(saved);
          return;
        }
        resolve({ ...pending.draft, localRevision: saved.localRevision || 0 });
      } catch (error) {
        reject(error);
      }
    };
  });
}

export async function saveDraft(
  id: string,
  value: Draft,
  expectedRevision = 0,
  pendingToken?: string,
): Promise<number> {
  if (!validId(id)) throw new Error('Invalid draft ID');
  if (!validRevision(expectedRevision))
    throw new Error('Invalid draft revision');
  const safeValue = prepareDraftForStorage(value);
  const saveSpan = beginPerformanceSpan('save');
  let db: IDBDatabase;
  try {
    db = await openDatabase();
  } catch (error) {
    saveSpan.finish();
    throw error;
  }
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction('drafts', 'readwrite');
      const store = transaction.objectStore('drafts');
      let conflict = false;
      const revision = expectedRevision + 1;
      const read = store.get(id);
      read.onsuccess = () => {
        if ((read.result?.localRevision || 0) !== expectedRevision) {
          conflict = true;
          transaction.abort();
          return;
        }
        store.put({ ...safeValue, localRevision: revision }, id);
      };
      transaction.oncomplete = () => {
        clearPendingDraft(id, revision, pendingToken);
        saveSpan.finish();
        resolve(revision);
      };
      transaction.onabort = () => {
        saveSpan.finish();
        reject(conflict ? new Error(LOCAL_CONFLICT) : transaction.error);
      };
      transaction.onerror = () => {
        saveSpan.finish();
        reject(transaction.error);
      };
    } catch (error) {
      saveSpan.finish();
      reject(error);
    }
  });
}
