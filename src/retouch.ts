/** Source-safe local Blur and Sharpen brush kernels. */

export type RetouchMode = 'blur' | 'sharpen';

export type RetouchStrokeOptions = {
  width: number;
  height: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  size: number;
  hardness: number;
  flow: number;
  mode: RetouchMode;
  selectionMask?: Uint8ClampedArray;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function assertPixels(value: Uint8ClampedArray, width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || value.length !== width * height * 4)
    throw new RangeError('Retouch pixels do not match the image dimensions');
}

function coverage(distance: number, radius: number, hardness: number): number {
  if (distance > radius) return 0;
  const edge = radius * (1 - clamp(hardness, 0, 100) / 100);
  if (edge <= 0 || distance <= edge) return 1;
  return clamp((radius - distance) / (radius - edge), 0, 1);
}

function sampleAverage(source: Uint8ClampedArray, width: number, height: number, x: number, y: number, radius: number): [number, number, number] {
  let red = 0, green = 0, blue = 0, count = 0;
  const left = Math.max(0, x - radius), right = Math.min(width - 1, x + radius);
  const top = Math.max(0, y - radius), bottom = Math.min(height - 1, y + radius);
  for (let sy = top; sy <= bottom; sy += 1) {
    for (let sx = left; sx <= right; sx += 1) {
      const offset = (sy * width + sx) * 4;
      red += source[offset];
      green += source[offset + 1];
      blue += source[offset + 2];
      count += 1;
    }
  }
  return [red / count, green / count, blue / count];
}

/** Apply one detached stroke segment; source is never mutated. */
export function applyRetouchStroke(
  source: Uint8ClampedArray,
  destination: Uint8ClampedArray,
  options: RetouchStrokeOptions,
): { pixels: Uint8ClampedArray; changed: boolean } {
  const { width, height, x1, y1, x2, y2, size, hardness, flow, mode, selectionMask } = options;
  assertPixels(source, width, height);
  assertPixels(destination, width, height);
  if (![x1, y1, x2, y2].every(Number.isFinite) || !Number.isFinite(size) || size < 1 || size > 16000)
    throw new RangeError('Retouch geometry is invalid');
  if (!Number.isFinite(hardness) || hardness < 0 || hardness > 100 || !Number.isFinite(flow) || flow < 0 || flow > 1)
    throw new RangeError('Retouch settings are invalid');
  if (mode !== 'blur' && mode !== 'sharpen') throw new RangeError('Retouch mode is invalid');
  if (selectionMask !== undefined && selectionMask.length !== width * height)
    throw new RangeError('Retouch selection mask does not match the image dimensions');
  const output = new Uint8ClampedArray(destination);
  const radius = Math.max(0.5, size / 2), kernelRadius = Math.max(1, Math.min(4, Math.round(radius / 8)));
  const distance = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.35)));
  let changed = false;
  for (let step = 0; step <= steps; step += 1) {
    const t = steps ? step / steps : 0;
    const cx = x1 + (x2 - x1) * t, cy = y1 + (y2 - y1) * t;
    const left = Math.max(0, Math.floor(cx - radius)), right = Math.min(width - 1, Math.ceil(cx + radius));
    const top = Math.max(0, Math.floor(cy - radius)), bottom = Math.min(height - 1, Math.ceil(cy + radius));
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const offset = (y * width + x) * 4;
        const amount = coverage(Math.hypot(x - cx, y - cy), radius, hardness) * flow * ((selectionMask?.[y * width + x] ?? 255) / 255);
        if (amount <= 0) continue;
        const average = sampleAverage(source, width, height, x, y, kernelRadius);
        for (let channel = 0; channel < 3; channel += 1) {
          const original = source[offset + channel];
          const target = mode === 'blur'
            ? average[channel]
            : clamp(original + (original - average[channel]) * 1.5, 0, 255);
          const next = Math.round(original + (target - original) * amount);
          if (output[offset + channel] !== next) changed = true;
          output[offset + channel] = next;
        }
        output[offset + 3] = source[offset + 3];
      }
    }
  }
  return { pixels: output, changed };
}

