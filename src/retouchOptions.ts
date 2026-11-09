/**
 * Persisted option-bar choices for the retouch tools (Clone Stamp, Pattern
 * Stamp, Spot Healing, Patch and Color Replace). They are stored as one
 * compact, validated `Settings.retouchOptions` object; every key is optional
 * so older drafts load with the defaults below.
 */

export const CLONE_SAMPLES = ['current', 'below', 'all'] as const;
export type CloneSample = (typeof CLONE_SAMPLES)[number];
export const SPOT_HEALING_TYPES = ['content-aware', 'texture', 'proximity'] as const;
export type SpotHealingType = (typeof SPOT_HEALING_TYPES)[number];
export const PATCH_MODES = ['source', 'destination', 'brush'] as const;
export type PatchMode = (typeof PATCH_MODES)[number];
export const COLOR_REPLACE_MODES = ['color', 'hue', 'saturation', 'luminosity', 'normal'] as const;
export type ColorReplaceMode = (typeof COLOR_REPLACE_MODES)[number];
export const COLOR_REPLACE_SAMPLINGS = ['continuous', 'once', 'background'] as const;
export type ColorReplaceSampling = (typeof COLOR_REPLACE_SAMPLINGS)[number];
export const COLOR_REPLACE_LIMITS = ['contiguous', 'discontiguous'] as const;
export type ColorReplaceLimits = (typeof COLOR_REPLACE_LIMITS)[number];

export type RetouchOptions = {
  /** Clone/Healing: keep the source offset between strokes. */
  cloneAligned: boolean;
  /** Clone/Healing: which pixels the source is read from. */
  cloneSample: CloneSample;
  /** Pattern Stamp: tile phase fixed to the canvas (on) or to each stroke start (off). */
  patternAligned: boolean;
  /** Pattern Stamp: id of a selection-defined image pattern, or null for the procedural pattern. */
  patternImage: string | null;
  spotHealingType: SpotHealingType;
  patchMode: PatchMode;
  colorReplaceMode: ColorReplaceMode;
  colorReplaceSampling: ColorReplaceSampling;
  colorReplaceLimits: ColorReplaceLimits;
};

export const DEFAULT_RETOUCH_OPTIONS: Readonly<RetouchOptions> = Object.freeze({
  cloneAligned: true,
  cloneSample: 'current',
  patternAligned: true,
  patternImage: null,
  spotHealingType: 'content-aware',
  patchMode: 'source',
  colorReplaceMode: 'color',
  colorReplaceSampling: 'continuous',
  colorReplaceLimits: 'contiguous',
});

const UUID = /^[a-f0-9-]{36}$/i;
const oneOf = <T extends string>(values: readonly T[]) => (value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value);
const boolean = (value: unknown): value is boolean => typeof value === 'boolean';

const VALIDATORS: { [K in keyof RetouchOptions]: (value: unknown) => boolean } = {
  cloneAligned: boolean,
  cloneSample: oneOf(CLONE_SAMPLES),
  patternAligned: boolean,
  patternImage: (value) => value === null || (typeof value === 'string' && UUID.test(value)),
  spotHealingType: oneOf(SPOT_HEALING_TYPES),
  patchMode: oneOf(PATCH_MODES),
  colorReplaceMode: oneOf(COLOR_REPLACE_MODES),
  colorReplaceSampling: oneOf(COLOR_REPLACE_SAMPLINGS),
  colorReplaceLimits: oneOf(COLOR_REPLACE_LIMITS),
};

/** A partial object with only known keys and valid values (fails closed). */
export function validRetouchOptions(value: unknown): value is Partial<RetouchOptions> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, item]) =>
    Object.hasOwn(VALIDATORS, key) && VALIDATORS[key as keyof RetouchOptions](item));
}

/** Complete options: valid stored keys over the defaults; invalid input yields defaults. */
export function normalizeRetouchOptions(value: unknown): RetouchOptions {
  const result: RetouchOptions = { ...DEFAULT_RETOUCH_OPTIONS };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [key, item] of Object.entries(value))
    if (Object.hasOwn(VALIDATORS, key) && VALIDATORS[key as keyof RetouchOptions](item))
      (result as Record<string, unknown>)[key] = item;
  return result;
}
