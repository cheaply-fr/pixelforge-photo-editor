/**
 * Deterministic, offline Subject/Sky selection proxies.
 *
 * These helpers intentionally do not claim semantic recognition. Subject uses
 * a border-colour contrast heuristic with a centre bias; Sky uses an upper
 * frame blue/bright heuristic. Both return canvas-sized alpha and preserve
 * source alpha so they are safe to compose with ordinary selections.
 */

export type AssistedSelectionKind = 'subject' | 'sky';

export const assistedSelectionBounds = {
  maxPixels: 16_000_000,
  maxDimension: 16_000,
  maxThreshold: 255,
  maxSoftness: 255,
} as const;

type Rgba = ArrayLike<number>;

function assertDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > assistedSelectionBounds.maxDimension ||
    height > assistedSelectionBounds.maxDimension ||
    width * height > assistedSelectionBounds.maxPixels
  ) {
    throw new Error('Assisted selection canvas dimensions are invalid');
  }
}

function assertSource(source: Rgba, width: number, height: number): void {
  if (!source || source.length !== width * height * 4)
    throw new Error(
      'Assisted selection source must contain RGBA data for every pixel',
    );
  for (let index = 0; index < source.length; index += 1) {
    const value = source[index];
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 255
    )
      throw new Error(
        'Assisted selection source contains invalid RGBA channels',
      );
  }
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export type SubjectSelectionOptions = {
  width: number;
  height: number;
  threshold?: number;
  softness?: number;
  centreBias?: number;
};

/**
 * Select pixels that differ from the average opaque border colour.
 *
 * The centre bias reduces isolated border noise while keeping the operation
 * predictable on illustrations and product shots. It is intentionally a
 * proxy, not object detection or hair/edge reconstruction.
 */
export function subjectSelectionMask(
  source: Rgba,
  options: SubjectSelectionOptions,
): Uint8ClampedArray {
  const { width, height } = options;
  assertDimensions(width, height);
  assertSource(source, width, height);
  const threshold = options.threshold ?? 28;
  const softness = options.softness ?? 24;
  const centreBias = options.centreBias ?? 0.18;
  if (
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > assistedSelectionBounds.maxThreshold
  )
    throw new Error('Subject selection threshold must be between 0 and 255');
  if (
    !Number.isFinite(softness) ||
    softness < 0 ||
    softness > assistedSelectionBounds.maxSoftness
  )
    throw new Error('Subject selection softness must be between 0 and 255');
  if (!Number.isFinite(centreBias) || centreBias < 0 || centreBias > 1)
    throw new Error('Subject selection centre bias must be between 0 and 1');

  const border = [0, 0, 0];
  let borderCount = 0;
  const add = (pixel: number) => {
    const offset = pixel * 4;
    if (source[offset + 3] === 0) return;
    border[0] += source[offset];
    border[1] += source[offset + 1];
    border[2] += source[offset + 2];
    borderCount += 1;
  };
  for (let x = 0; x < width; x += 1) {
    add(x);
    if (height > 1) add((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    add(y * width);
    if (width > 1) add(y * width + width - 1);
  }
  if (!borderCount) return new Uint8ClampedArray(width * height);
  border[0] /= borderCount;
  border[1] /= borderCount;
  border[2] /= borderCount;

  const output = new Uint8ClampedArray(width * height);
  const halfWidth = Math.max(1, (width - 1) / 2);
  const halfHeight = Math.max(1, (height - 1) / 2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      const alpha = source[offset + 3];
      if (alpha === 0) continue;
      const distance = Math.max(
        Math.abs(source[offset] - border[0]),
        Math.abs(source[offset + 1] - border[1]),
        Math.abs(source[offset + 2] - border[2]),
      );
      const dx = (x - (width - 1) / 2) / halfWidth;
      const dy = (y - (height - 1) / 2) / halfHeight;
      const centre = clampUnit(1 - Math.hypot(dx, dy) * centreBias);
      const coverage =
        softness === 0
          ? distance >= threshold
            ? 255
            : 0
          : clampByte(((distance - threshold + softness) / softness) * 255);
      output[pixel] = clampByte((coverage * centre * alpha) / 255);
    }
  }
  return output;
}

export type SkySelectionOptions = {
  width: number;
  height: number;
  threshold?: number;
  softness?: number;
  horizon?: number;
};

/** Select a blue/bright upper-frame sky proxy with a bounded horizon. */
export function skySelectionMask(
  source: Rgba,
  options: SkySelectionOptions,
): Uint8ClampedArray {
  const { width, height } = options;
  assertDimensions(width, height);
  assertSource(source, width, height);
  const threshold = options.threshold ?? 24;
  const softness = options.softness ?? 24;
  const horizon = options.horizon ?? 0.62;
  if (
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > assistedSelectionBounds.maxThreshold
  )
    throw new Error('Sky selection threshold must be between 0 and 255');
  if (
    !Number.isFinite(softness) ||
    softness < 0 ||
    softness > assistedSelectionBounds.maxSoftness
  )
    throw new Error('Sky selection softness must be between 0 and 255');
  if (!Number.isFinite(horizon) || horizon <= 0 || horizon > 1)
    throw new Error(
      'Sky selection horizon must be greater than 0 and at most 1',
    );

  const output = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) {
    const vertical = y / Math.max(1, height - 1);
    const band =
      vertical <= horizon ? 1 : clampUnit(1 - (vertical - horizon) * 12);
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      const alpha = source[offset + 3];
      if (alpha === 0 || band === 0) continue;
      const red = source[offset];
      const green = source[offset + 1];
      const blue = source[offset + 2];
      const brightness = (red + green + blue) / 3;
      const blueSignal = blue - Math.max(red, green) * 0.72;
      const neutralCloud =
        brightness >= 170 &&
        Math.max(red, green, blue) - Math.min(red, green, blue) <= 42;
      const signal = Math.max(0, blueSignal, neutralCloud ? 48 : 0);
      const coverage =
        softness === 0
          ? signal >= threshold
            ? 255
            : 0
          : clampByte(((signal - threshold + softness) / softness) * 255);
      output[pixel] = clampByte((coverage * band * alpha) / 255);
    }
  }
  return output;
}
