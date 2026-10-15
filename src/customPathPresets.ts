import { validatePath, type PathModel } from './paths.ts';

/** Local-only editable Pen path library. Pixels and remote references never enter a preset. */
export const CUSTOM_PATH_PRESET_LIMIT = 32;
const idPattern = /^[0-9a-f-]{8,64}$/i;

export type CustomPathPreset = {
  id: string;
  label: string;
  path: PathModel;
};

export function validCustomPathPreset(value: unknown): value is CustomPathPreset {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<CustomPathPreset>;
  if (typeof candidate.id !== 'string' || !idPattern.test(candidate.id)) return false;
  if (typeof candidate.label !== 'string' || candidate.label.trim().length === 0 || candidate.label.length > 80) return false;
  try {
    validatePath(candidate.path);
    return true;
  } catch {
    return false;
  }
}

export function normalizeCustomPathPresets(value: unknown): CustomPathPreset[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: CustomPathPreset[] = [];
  for (const item of value) {
    if (!validCustomPathPreset(item)) continue;
    const candidate = item as CustomPathPreset;
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    output.push({ id: candidate.id, label: candidate.label.trim(), path: validatePath(candidate.path) });
    if (output.length >= CUSTOM_PATH_PRESET_LIMIT) break;
  }
  return output;
}

export function createCustomPathPreset(input: Omit<CustomPathPreset, 'id'>): CustomPathPreset {
  return { id: crypto.randomUUID(), label: input.label.trim(), path: validatePath(input.path) };
}
