import { normalizeSecondaryBrushPreset, type SecondaryBrushPreset } from './brushSecondary.ts';
import { BRUSH_SPACING_MAX } from './brush.ts';
import { BRUSH_SCATTER_MAX, normalizeBrushDynamics, validBrushDynamics, type BrushDynamics } from './brushDynamics.ts';
import { validBrushBlendMode, type BrushBlendMode } from './brushBlend.ts';

export const CUSTOM_BRUSH_PRESET_LIMIT = 32;

/** Settings captured by a user-authored local brush preset. */
export type CustomBrushPreset = {
  id: string;
  label: string;
  size: number;
  hardness: number;
  spacing: number;
  angle: number;
  roundness: number;
  flipX: boolean;
  flipY: boolean;
  pressureSize: boolean;
  pressureOpacity: boolean;
  pressureCurve?: 'linear' | 'soft' | 'firm';
  brushSmoothing: number;
  brushScatter: number;
  brushTexture: number;
  brushDual: number;
  secondaryBrushPreset: SecondaryBrushPreset;
  brushBristle: number;
  brushWetEdges: number;
  brushBuildUp: number;
  brushFlow: number;
  /** Optional scatter axes, Count, jitter and colour dynamics; presets saved before these existed omit it. */
  brushDynamics?: BrushDynamics;
  /** Optional brush opacity 1–100%; presets saved before it existed keep the current opacity. */
  brushOpacity?: number;
  /** Optional Brush/Pencil blend mode (Canvas-native modes only); presets saved before it existed load as Normal. */
  brushBlendMode?: BrushBlendMode;
};

const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function validCustomBrushPreset(value: unknown): value is CustomBrushPreset {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<CustomBrushPreset>;
  return (
    typeof candidate.id === 'string' && /^[a-f0-9-]{36}$/i.test(candidate.id) &&
    typeof candidate.label === 'string' && candidate.label.trim().length >= 1 && candidate.label.length <= 80 &&
    finite(candidate.size, 1, 10000) && finite(candidate.hardness, 0, 100) &&
    finite(candidate.spacing, 1, BRUSH_SPACING_MAX) && finite(candidate.angle, -180, 180) &&
    finite(candidate.roundness, 1, 100) &&
    typeof candidate.flipX === 'boolean' && typeof candidate.flipY === 'boolean' &&
    typeof candidate.pressureSize === 'boolean' && typeof candidate.pressureOpacity === 'boolean' &&
    (candidate.pressureCurve === undefined || ['linear', 'soft', 'firm'].includes(candidate.pressureCurve)) &&
    finite(candidate.brushSmoothing, 0, 100) && finite(candidate.brushScatter, 0, BRUSH_SCATTER_MAX) &&
    finite(candidate.brushTexture, 0, 100) && finite(candidate.brushDual, 0, 100) && normalizeSecondaryBrushPreset(candidate.secondaryBrushPreset) === (candidate.secondaryBrushPreset ?? 'none') &&
    finite(candidate.brushBristle, 0, 100) && finite(candidate.brushWetEdges ?? 0, 0, 100) && finite(candidate.brushBuildUp ?? 0, 0, 100) && finite(candidate.brushFlow, 1, 100) &&
    (candidate.brushDynamics === undefined || validBrushDynamics(candidate.brushDynamics)) &&
    (candidate.brushOpacity === undefined || finite(candidate.brushOpacity, 1, 100)) &&
    (candidate.brushBlendMode === undefined || validBrushBlendMode(candidate.brushBlendMode))
  );
}

export function normalizeCustomBrushPresets(value: unknown): CustomBrushPreset[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .filter((item): item is CustomBrushPreset => validCustomBrushPreset(item))
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(-CUSTOM_BRUSH_PRESET_LIMIT)
    .map((item) => ({ ...item, label: item.label.trim().slice(0, 80), secondaryBrushPreset: normalizeSecondaryBrushPreset(item.secondaryBrushPreset), brushWetEdges: item.brushWetEdges ?? 0, brushBuildUp: item.brushBuildUp ?? 0, ...(item.brushDynamics === undefined ? {} : { brushDynamics: normalizeBrushDynamics(item.brushDynamics) }) }));
}

export function createCustomBrushPreset(
  id: string,
  label: string,
  values: Omit<CustomBrushPreset, 'id' | 'label'>,
): CustomBrushPreset {
  const preset = { id, label: label.trim().slice(0, 80), ...values };
  if (!validCustomBrushPreset(preset)) throw new Error('Custom brush preset values are invalid');
  return preset;
}

/** Convert a built-in preset into the same captured shape for UI application. */
