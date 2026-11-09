/**
 * Local character + paragraph style presets for the Type panels.
 *
 * Presets are a per-device convenience stored in localStorage (never synced
 * or uploaded). Parsing fails closed: malformed entries are dropped.
 */
import {
  RUN_STYLE_KEYS,
  normalizeParagraph,
  validParagraphSettings,
  validRunStyle,
  type CharacterStyle,
  type ParagraphSettings,
  type RunStyle,
} from './richText.ts';

export const TYPE_PRESETS_VERSION = 1;
export const TYPE_PRESETS_STORAGE_KEY = 'pixelforge.type-presets';
export const MAX_TYPE_PRESETS = 40;
const ALIGNS = ['left', 'center', 'right'] as const;

export type TypePreset = {
  name: string;
  character: RunStyle;
  paragraph: ParagraphSettings;
  textAlign: (typeof ALIGNS)[number];
};

export function validPresetName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 40 && !/\p{Cc}/u.test(value);
}

export function validTypePreset(value: unknown): value is TypePreset {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const preset = value as Record<string, unknown>;
  return validPresetName(preset.name) && validRunStyle(preset.character) &&
    validParagraphSettings(preset.paragraph) && ALIGNS.includes(preset.textAlign as TypePreset['textAlign']);
}

/** Build a preset from resolved character values ('mixed' attributes are skipped). */
export function presetFromState(
  name: string,
  character: { [K in keyof CharacterStyle]?: CharacterStyle[K] | 'mixed' },
  paragraph: Partial<ParagraphSettings> | undefined,
  textAlign: TypePreset['textAlign'],
): TypePreset {
  if (!validPresetName(name)) throw new Error('Preset names need 1–40 visible characters');
  const style: Record<string, unknown> = {};
  for (const key of RUN_STYLE_KEYS) {
    const value = character[key];
    if (value !== undefined && value !== 'mixed') style[key] = value;
  }
  const preset = { name: name.trim(), character: style as RunStyle, paragraph: normalizeParagraph(paragraph), textAlign };
  if (!validTypePreset(preset)) throw new Error('Preset values are out of range');
  return preset;
}

export function parseTypePresets(raw: string | null | undefined): TypePreset[] {
  if (!raw || raw.length > 200000) return [];
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; presets?: unknown };
    if (parsed?.version !== TYPE_PRESETS_VERSION || !Array.isArray(parsed.presets)) return [];
    const out: TypePreset[] = [];
    for (const item of parsed.presets) {
      if (validTypePreset(item) && !out.some((preset) => preset.name === item.name)) out.push(item);
      if (out.length >= MAX_TYPE_PRESETS) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function serializeTypePresets(presets: readonly TypePreset[]): string {
  return JSON.stringify({ version: TYPE_PRESETS_VERSION, presets: presets.filter(validTypePreset).slice(0, MAX_TYPE_PRESETS) });
}

/** Insert or replace by name, keeping the bounded list size. */
export function upsertTypePreset(presets: readonly TypePreset[], preset: TypePreset): TypePreset[] {
  const rest = presets.filter((item) => item.name !== preset.name);
  if (rest.length >= MAX_TYPE_PRESETS) throw new Error(`At most ${MAX_TYPE_PRESETS} type presets can be saved`);
  return [...rest, preset];
}
