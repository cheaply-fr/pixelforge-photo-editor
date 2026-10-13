import { validBrushPresetId, type BrushPresetId } from './brushPresets.ts';

export type SecondaryBrushPreset = 'none' | BrushPresetId;

export function normalizeSecondaryBrushPreset(value: unknown): SecondaryBrushPreset {
  return value === 'none' || validBrushPresetId(value) ? value as SecondaryBrushPreset : 'none';
}

export function secondaryBrushOpacity(amount: unknown): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return 0;
  return Math.max(0, Math.min(1, Math.round(amount) / 100));
}

