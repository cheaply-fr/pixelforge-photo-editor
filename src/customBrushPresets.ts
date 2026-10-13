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
  brushSmoothing: number;
  brushScatter: number;
  brushTexture: number;
  brushDual: number;
  brushBristle: number;
  brushBuildUp: number;
  brushFlow: number;
};

const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function validCustomBrushPreset(value: unknown): value is CustomBrushPreset {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<CustomBrushPreset>;
  return (
    typeof candidate.id === 'string' && /^[a-f0-9-]{36}$/i.test(candidate.id) &&
    typeof candidate.label === 'string' && candidate.label.trim().length >= 1 && candidate.label.length <= 80 &&
    finite(candidate.size, 2, 10000) && finite(candidate.hardness, 0, 100) &&
    finite(candidate.spacing, 1, 100) && finite(candidate.angle, -180, 180) &&
    finite(candidate.roundness, 1, 100) &&
    typeof candidate.flipX === 'boolean' && typeof candidate.flipY === 'boolean' &&
    typeof candidate.pressureSize === 'boolean' && typeof candidate.pressureOpacity === 'boolean' &&
    finite(candidate.brushSmoothing, 0, 100) && finite(candidate.brushScatter, 0, 100) &&
    finite(candidate.brushTexture, 0, 100) && finite(candidate.brushDual, 0, 100) &&
    finite(candidate.brushBristle, 0, 100) && finite(candidate.brushBuildUp ?? 0, 0, 100) && finite(candidate.brushFlow, 1, 100)
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
    .map((item) => ({ ...item, label: item.label.trim().slice(0, 80), brushBuildUp: item.brushBuildUp ?? 0 }));
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
