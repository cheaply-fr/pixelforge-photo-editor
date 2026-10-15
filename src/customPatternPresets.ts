import { normalizePatternTileSize, validPatternId, type PatternId } from './patternStamp.ts';

export const CUSTOM_PATTERN_PRESET_LIMIT = 32;
export type CustomPatternPreset = {
  id: string;
  label: string;
  pattern: PatternId;
  tileSize: number;
  foreground: string;
  background: string;
};

export function validCustomPatternPreset(value: unknown): value is CustomPatternPreset {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<CustomPatternPreset>;
  try {
    normalizePatternTileSize(candidate.tileSize);
  } catch {
    return false;
  }
  return (
    typeof candidate.id === 'string' && /^[a-f0-9-]{36}$/i.test(candidate.id) &&
    typeof candidate.label === 'string' && candidate.label.trim().length >= 1 && candidate.label.length <= 80 &&
    validPatternId(candidate.pattern) &&
    typeof candidate.foreground === 'string' && /^#[a-f\d]{6}$/i.test(candidate.foreground) &&
    typeof candidate.background === 'string' && /^#[a-f\d]{6}$/i.test(candidate.background)
  );
}

export function normalizeCustomPatternPresets(value: unknown): CustomPatternPreset[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .filter((item): item is CustomPatternPreset => validCustomPatternPreset(item))
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(-CUSTOM_PATTERN_PRESET_LIMIT)
    .map((item) => ({ ...item, label: item.label.trim().slice(0, 80), tileSize: normalizePatternTileSize(item.tileSize) }));
}

export function createCustomPatternPreset(
  id: string,
  label: string,
  values: Omit<CustomPatternPreset, 'id' | 'label'>,
): CustomPatternPreset {
  const preset = { id, label: label.trim().slice(0, 80), ...values };
  if (!validCustomPatternPreset(preset)) throw new Error('Custom pattern preset values are invalid');
  return { ...preset, tileSize: normalizePatternTileSize(preset.tileSize) };
}
