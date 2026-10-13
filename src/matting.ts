export const MATTING_MODES = ['white', 'black'] as const;
export type MattingMode = (typeof MATTING_MODES)[number];

export type MattingSettings = {
  mode: MattingMode;
  amount: number;
};

export const DEFAULT_MATTING: MattingSettings = { mode: 'white', amount: 100 };

export function effectiveMatting(value: Partial<MattingSettings> | undefined): MattingSettings {
  return {
    mode: MATTING_MODES.includes(value?.mode as MattingMode) ? value!.mode as MattingMode : 'white',
    amount: Number.isFinite(value?.amount) ? Math.max(0, Math.min(100, Number(value!.amount))) : 100,
  };
}

export function validMattingSettings(value: unknown): value is MattingSettings {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MattingSettings>;
  return MATTING_MODES.includes(candidate.mode as MattingMode) &&
    typeof candidate.amount === 'number' && Number.isFinite(candidate.amount) &&
    candidate.amount >= 0 && candidate.amount <= 100;
}

const byte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

/** Remove a known matte from premultiplied edge colours without changing alpha. */
export function applyMattingPixels(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  settings: MattingSettings,
): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('Matting dimensions are invalid');
  if (source.length !== width * height * 4) throw new Error('Matting buffer length is invalid');
  if (!validMattingSettings(settings)) throw new Error('Matting settings are invalid');
  const output = new Uint8ClampedArray(source), strength = settings.amount / 100,
    matte = settings.mode === 'white' ? 255 : 0;
  if (strength === 0) return output;
  for (let offset = 0; offset < output.length; offset += 4) {
    const alpha = output[offset + 3];
    if (alpha === 0 || alpha === 255) continue;
    const coverage = alpha / 255;
    for (let channel = 0; channel < 3; channel += 1) {
      const observed = output[offset + channel];
      const uncomposited = byte((observed - matte * (1 - coverage)) / coverage);
      output[offset + channel] = byte(observed + (uncomposited - observed) * strength);
    }
  }
  return output;
}
