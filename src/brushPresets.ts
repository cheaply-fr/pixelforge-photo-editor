import {
  BRUSH_DEFAULT_ANGLE,
  BRUSH_DEFAULT_ROUNDNESS,
  BRUSH_DEFAULT_SPACING,
  validBrushTipSettings,
  type BrushTipSettings,
} from './brush.ts';

/**
 * Small deterministic presets for the local Brush/ Pencil controls.
 * Presets contain settings only: they never include pixels, credentials or
 * remote references and can safely be persisted in an anonymous draft.
 */
export type BrushPreset = BrushTipSettings & {
  id: string;
  label: string;
  size: number;
  hardness: number;
  pressureSize: boolean;
  pressureOpacity: boolean;
  pressureCurve?: 'linear' | 'soft' | 'firm';
};

export const BRUSH_PRESETS = [
  {
    id: 'round-hard',
    label: 'Round hard',
    size: 18,
    hardness: 100,
    spacing: BRUSH_DEFAULT_SPACING,
    angle: BRUSH_DEFAULT_ANGLE,
    roundness: BRUSH_DEFAULT_ROUNDNESS,
    flipX: false,
    flipY: false,
    pressureSize: false,
    pressureOpacity: false,
    pressureCurve: 'linear',
  },
  {
    id: 'round-soft',
    label: 'Round soft',
    size: 28,
    hardness: 0,
    spacing: BRUSH_DEFAULT_SPACING,
    angle: BRUSH_DEFAULT_ANGLE,
    roundness: BRUSH_DEFAULT_ROUNDNESS,
    flipX: false,
    flipY: false,
    pressureSize: false,
    pressureOpacity: false,
    pressureCurve: 'linear',
  },
  {
    id: 'pencil',
    label: 'Pencil',
    size: 6,
    hardness: 100,
    spacing: 10,
    angle: BRUSH_DEFAULT_ANGLE,
    roundness: 72,
    flipX: false,
    flipY: false,
    pressureSize: true,
    pressureOpacity: false,
    pressureCurve: 'linear',
  },
  {
    id: 'ink-angled',
    label: 'Ink angled',
    size: 14,
    hardness: 90,
    spacing: 16,
    angle: 35,
    roundness: 55,
    flipX: false,
    flipY: false,
    pressureSize: true,
    pressureOpacity: true,
    pressureCurve: 'linear',
  },
] as const satisfies readonly BrushPreset[];

export type BrushPresetId = (typeof BRUSH_PRESETS)[number]['id'];
export const BRUSH_PRESET_IDS = BRUSH_PRESETS.map((preset) => preset.id) as BrushPresetId[];

export function validBrushPresetId(value: unknown): value is BrushPresetId {
  return typeof value === 'string' && BRUSH_PRESET_IDS.includes(value as BrushPresetId);
}

export function brushPresetById(value: unknown): BrushPreset | undefined {
  return validBrushPresetId(value)
    ? BRUSH_PRESETS.find((preset) => preset.id === value)
    : undefined;
}

export function validBrushPreset(value: unknown): value is BrushPreset {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<BrushPreset>;
  return (
    validBrushPresetId(candidate.id) &&
    typeof candidate.label === 'string' &&
    candidate.label.length >= 1 &&
    candidate.label.length <= 80 &&
    typeof candidate.size === 'number' && Number.isFinite(candidate.size) && candidate.size >= 1 && candidate.size <= 10000 &&
    typeof candidate.hardness === 'number' && Number.isFinite(candidate.hardness) && candidate.hardness >= 0 && candidate.hardness <= 100 &&
    typeof candidate.pressureSize === 'boolean' &&
    typeof candidate.pressureOpacity === 'boolean' &&
    (candidate.pressureCurve === undefined || ['linear', 'soft', 'firm'].includes(candidate.pressureCurve)) &&
    validBrushTipSettings(candidate)
  );
}
