export const CUSTOM_SHAPE_PRESET_LIMIT = 32;
export const CUSTOM_SHAPE_KINDS = ['rectangle', 'ellipse', 'line', 'polygon'] as const;
export type CustomShapeKind = (typeof CUSTOM_SHAPE_KINDS)[number];
export type CustomShapePreset = {
  id: string;
  label: string;
  kind: CustomShapeKind;
  color: string;
  variant?: 'polygon' | 'triangle' | 'star';
  sides?: number;
};

const idPattern = /^[0-9a-f-]{8,64}$/i;
const hexPattern = /^#[0-9a-f]{6}$/i;
export function validCustomShapePreset(value: unknown): value is CustomShapePreset {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<CustomShapePreset>;
  return typeof candidate.id === 'string' && idPattern.test(candidate.id) &&
    typeof candidate.label === 'string' && candidate.label.trim().length > 0 && candidate.label.length <= 80 &&
    CUSTOM_SHAPE_KINDS.includes(candidate.kind as CustomShapeKind) &&
    typeof candidate.color === 'string' && hexPattern.test(candidate.color) &&
    (candidate.variant === undefined || candidate.variant === 'polygon' || candidate.variant === 'triangle' || candidate.variant === 'star') &&
    (candidate.sides === undefined || (Number.isInteger(candidate.sides) && candidate.sides >= 3 && candidate.sides <= 32));
}

export function normalizeCustomShapePresets(value: unknown): CustomShapePreset[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: CustomShapePreset[] = [];
  for (const item of value) {
    if (!validCustomShapePreset(item)) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    output.push({
      ...item,
      label: item.label.trim(),
      color: item.color.toLowerCase(),
      ...(item.kind === 'polygon' ? {
        variant: item.variant ?? 'polygon',
        sides: item.sides ?? 5,
      } : {}),
    });
    if (output.length >= CUSTOM_SHAPE_PRESET_LIMIT) break;
  }
  return output;
}

export function createCustomShapePreset(input: Omit<CustomShapePreset, 'id'>): CustomShapePreset {
  return { ...input, id: crypto.randomUUID() };
}
