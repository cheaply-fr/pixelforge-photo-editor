export const COLOR_PROFILES = ['srgb', 'display-p3'] as const;
export type ColorProfile = (typeof COLOR_PROFILES)[number];

type RgbaPixels = Uint8ClampedArray<ArrayBufferLike>;

const SRGB_TO_XYZ = [
  [0.4123907993, 0.3575843394, 0.1804807884],
  [0.2126390059, 0.7151686788, 0.0721923154],
  [0.0193308187, 0.1191947798, 0.9505321522],
] as const;
const P3_TO_XYZ = [
  [0.4865709486, 0.2656676932, 0.1982172852],
  [0.2289745641, 0.6917385218, 0.0792869141],
  [0, 0.0451133819, 1.0439443689],
] as const;
const XYZ_TO_SRGB = [
  [3.2409699419, -1.5373831776, -0.4986107603],
  [-0.9692436363, 1.8759675015, 0.0415550574],
  [0.0556300797, -0.2039769589, 1.0569715142],
] as const;
const XYZ_TO_P3 = [
  [2.4934969119, -0.9313836179, -0.4027107845],
  [-0.8294889696, 1.7626640603, 0.0236246858],
  [0.0358458302, -0.0761723893, 0.956884524],
] as const;

export function validColorProfile(value: unknown): value is ColorProfile {
  return COLOR_PROFILES.includes(value as ColorProfile);
}

export function normalizeColorProfile(value: unknown): ColorProfile {
  return validColorProfile(value) ? value : 'srgb';
}

function decodeTransfer(value: number): number {
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

function encodeTransfer(value: number): number {
  const bounded = Math.max(0, Math.min(1, value));
  return bounded <= 0.0031308
    ? bounded * 12.92
    : 1.055 * Math.pow(bounded, 1 / 2.4) - 0.055;
}

function multiplyMatrix(
  matrix: readonly (readonly number[])[],
  vector: readonly number[],
): [number, number, number] {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  ];
}

/**
 * Convert encoded RGB bytes between the supported D65 sRGB and Display P3
 * working profiles. Alpha and fully transparent RGB bytes are preserved.
 * This is a bounded local matrix conversion; it does not embed an ICC profile.
 */
export function convertRgbaProfile(
  source: RgbaPixels,
  width: number,
  height: number,
  from: ColorProfile,
  to: ColorProfile,
): RgbaPixels {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('Color profile conversion dimensions are invalid');
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > 16_000_000 || source.length !== pixels * 4)
    throw new Error('Color profile conversion buffer is invalid');
  const output = new Uint8ClampedArray(source);
  if (from === to) return output;
  const toXyz = from === 'srgb' ? SRGB_TO_XYZ : P3_TO_XYZ;
  const fromXyz = to === 'srgb' ? XYZ_TO_SRGB : XYZ_TO_P3;
  for (let offset = 0; offset < source.length; offset += 4) {
    if (source[offset + 3] === 0) continue;
    const linear = [
      decodeTransfer(source[offset] / 255),
      decodeTransfer(source[offset + 1] / 255),
      decodeTransfer(source[offset + 2] / 255),
    ];
    const xyz = multiplyMatrix(toXyz, linear);
    const converted = multiplyMatrix(fromXyz, xyz).map(encodeTransfer);
    output[offset] = Math.round(converted[0] * 255);
    output[offset + 1] = Math.round(converted[1] * 255);
    output[offset + 2] = Math.round(converted[2] * 255);
  }
  return output;
}
