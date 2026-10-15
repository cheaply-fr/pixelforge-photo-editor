import { TOOL_FLYOUTS, type PaletteToolId } from './toolPalette.ts';

/** Versioned local preference for the last variant chosen in each flyout. */
export const TOOL_FAMILY_CHOICES_VERSION = 1;
export const TOOL_FAMILY_CHOICES_STORAGE_KEY = 'pixelforge.tool-family-choices';

export type ToolFamilyChoices = Record<string, PaletteToolId>;

export function normalizeToolFamilyChoices(value: unknown): ToolFamilyChoices {
  const result: ToolFamilyChoices = {};
  if (!value || typeof value !== 'object') return result;
  const candidate = value as { version?: unknown; choices?: unknown };
  if (
    candidate.version !== undefined &&
    candidate.version !== TOOL_FAMILY_CHOICES_VERSION
  )
    return result;
  if (!candidate.choices || typeof candidate.choices !== 'object')
    return result;
  for (const [family, rawTool] of Object.entries(
    candidate.choices as Record<string, unknown>,
  )) {
    const tools = TOOL_FLYOUTS[family];
    if (
      tools &&
      typeof rawTool === 'string' &&
      tools.includes(rawTool as PaletteToolId)
    )
      result[family] = rawTool as PaletteToolId;
  }
  return result;
}

export function serializeToolFamilyChoices(choices: ToolFamilyChoices): string {
  return JSON.stringify({
    version: TOOL_FAMILY_CHOICES_VERSION,
    choices: normalizeToolFamilyChoices({ choices }),
  });
}
