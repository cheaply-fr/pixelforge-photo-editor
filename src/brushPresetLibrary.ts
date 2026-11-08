import {
  CUSTOM_BRUSH_PRESET_LIMIT,
  normalizeCustomBrushPresets,
  validCustomBrushPreset,
  type CustomBrushPreset,
} from './customBrushPresets.ts';
import { DEFAULT_BRUSH_DYNAMICS, normalizeBrushDynamics, type BrushDynamics } from './brushDynamics.ts';

/**
 * Device-local brush preset library: built-in space-art presets plus the
 * user's saved presets, persisted in localStorage (settings only, never
 * pixels or account data) and also carried in drafts and .pixelforge
 * projects through the existing `customBrushPresets` setting. There is no
 * cloud sync. Every storage access fails closed: unavailable, full or
 * corrupt storage falls back to an empty library and never blocks editing.
 */
export const BRUSH_PRESET_STORAGE_KEY = 'pixelforge.brush-presets.v1';
const STORAGE_VERSION = 1;

/** A built-in preset has a stable `builtin-` id and cannot be renamed or deleted. */
export type BuiltInBrushPreset = Omit<CustomBrushPreset, 'id'> & { id: `builtin-${string}`; description: string };

const base = {
  angle: 0,
  roundness: 100,
  flipX: false,
  flipY: false,
  pressureSize: false,
  pressureOpacity: false,
  pressureCurve: 'linear',
  brushSmoothing: 0,
  brushScatter: 0,
  brushTexture: 0,
  brushDual: 0,
  secondaryBrushPreset: 'none',
  brushBristle: 0,
  brushWetEdges: 0,
  brushBuildUp: 0,
  brushFlow: 100,
  brushOpacity: 100,
  brushBlendMode: 'source-over',
} as const satisfies Partial<CustomBrushPreset>;

const dynamics = (values: Partial<BrushDynamics>): BrushDynamics =>
  normalizeBrushDynamics({ ...DEFAULT_BRUSH_DYNAMICS, ...values });

/** Built-in presets for painting space scenes; settings only, applied like saved presets. */
export const BUILT_IN_BRUSH_PRESETS: readonly BuiltInBrushPreset[] = Object.freeze([
  {
    ...base,
    id: 'builtin-star-field',
    label: 'Star field',
    description: 'Tiny hard dabs, widely scattered, with size, brightness and hue jitter',
    size: 4,
    hardness: 100,
    spacing: 400,
    brushScatter: 1000,
    brushDynamics: dynamics({
      count: 6,
      countJitter: 60,
      sizeJitter: 75,
      opacityJitter: 30,
      hueJitter: 12,
      saturationJitter: 25,
      brightnessJitter: 45,
    }),
  },
  {
    ...base,
    id: 'builtin-soft-glow',
    label: 'Soft glow',
    description: 'Large, fully soft, low opacity and Screen mode for halos and light bloom',
    size: 220,
    hardness: 0,
    spacing: 20,
    brushOpacity: 12,
    brushBlendMode: 'screen',
    brushDynamics: dynamics({}),
  },
  {
    ...base,
    id: 'builtin-dust-nebula',
    label: 'Dust / nebula',
    description: 'Scattered soft dabs with opacity, size and slight colour variation',
    size: 70,
    hardness: 0,
    spacing: 60,
    brushScatter: 250,
    brushOpacity: 35,
    brushDynamics: dynamics({
      count: 4,
      countJitter: 50,
      sizeJitter: 50,
      opacityJitter: 80,
      hueJitter: 4,
      colorMixJitter: 40,
    }),
  },
  {
    ...base,
    id: 'builtin-smoke-wisp',
    label: 'Smoke wisp',
    description: 'Soft, low-opacity stroke with size jitter and smoothing',
    size: 50,
    hardness: 0,
    spacing: 12,
    brushSmoothing: 60,
    brushOpacity: 18,
    brushDynamics: dynamics({ sizeJitter: 60, opacityJitter: 25 }),
  },
] satisfies BuiltInBrushPreset[]);

export function builtInBrushPresetById(id: unknown): BuiltInBrushPreset | undefined {
  return BUILT_IN_BRUSH_PRESETS.find((preset) => preset.id === id);
}

/**
 * Combine preset lists (for example the device library and a restored draft
 * or imported project). Earlier lists win on duplicate ids; invalid entries
 * are dropped and the newest {@link CUSTOM_BRUSH_PRESET_LIMIT} are kept.
 */
export function mergeBrushPresetLibraries(...lists: unknown[]): CustomBrushPreset[] {
  const seen = new Set<string>(),
    merged: CustomBrushPreset[] = [];
  for (const list of lists)
    for (const preset of normalizeCustomBrushPresets(list)) {
      if (seen.has(preset.id)) continue;
      seen.add(preset.id);
      merged.push(preset);
    }
  return merged.slice(-CUSTOM_BRUSH_PRESET_LIMIT);
}

/** Rename one saved preset; throws for an empty name or unknown id. */
export function renameCustomBrushPreset(presets: readonly CustomBrushPreset[], id: string, label: string): CustomBrushPreset[] {
  const trimmed = typeof label === 'string' ? label.trim().slice(0, 80) : '';
  if (!trimmed) throw new Error('Brush preset name cannot be empty');
  if (!presets.some((preset) => preset.id === id)) throw new Error('Brush preset not found');
  return presets.map((preset) => (preset.id === id ? { ...preset, label: trimmed } : preset));
}

/** Remove one saved preset; unknown ids leave the list unchanged. */
export function deleteCustomBrushPreset(presets: readonly CustomBrushPreset[], id: string): CustomBrushPreset[] {
  return presets.filter((preset) => preset.id !== id);
}

/** Serialize the saved presets into the versioned storage envelope. */
export function serializeBrushPresetLibrary(presets: readonly CustomBrushPreset[]): string {
  return JSON.stringify({ version: STORAGE_VERSION, presets: mergeBrushPresetLibraries(presets) });
}

/** Parse a storage envelope; anything corrupt or from an unknown version yields []. */
export function parseBrushPresetLibrary(raw: unknown): CustomBrushPreset[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    const envelope = parsed as { version?: unknown; presets?: unknown };
    if (envelope.version !== STORAGE_VERSION) return [];
    return mergeBrushPresetLibraries(envelope.presets);
  } catch {
    return [];
  }
}

type PresetStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The browser's localStorage, or undefined when it is missing or its getter throws (privacy modes). */
export function browserPresetStorage(): PresetStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** Read the device library; unavailable or throwing storage yields []. */
export function readStoredBrushPresets(storage: PresetStorage | undefined | null): CustomBrushPreset[] {
  try {
    return storage ? parseBrushPresetLibrary(storage.getItem(BRUSH_PRESET_STORAGE_KEY)) : [];
  } catch {
    return [];
  }
}

/** Write the device library; returns false when storage is unavailable or rejects the write. */
export function writeStoredBrushPresets(storage: PresetStorage | undefined | null, presets: readonly CustomBrushPreset[]): boolean {
  try {
    if (!storage) return false;
    storage.setItem(BRUSH_PRESET_STORAGE_KEY, serializeBrushPresetLibrary(presets));
    return true;
  } catch {
    return false;
  }
}

/** True for a saved preset id (built-ins are not editable). */
export function isEditableBrushPreset(presets: readonly CustomBrushPreset[], id: string): boolean {
  return presets.some((preset) => preset.id === id && validCustomBrushPreset(preset));
}
