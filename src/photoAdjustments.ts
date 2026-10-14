/**
 * Deterministic nondestructive photo corrections commonly used in a photo
 * editor: exposure, vibrance and black and white.  The controls are kept as
 * small metadata values so a layer can be re-rendered without replacing its
 * source asset.
 *
 * Every operation returns a detached RGBA buffer. Alpha is copied exactly and
 * RGB bytes belonging to fully transparent pixels are intentionally preserved
 * because they may be meaningful when an asset is edited again later.
 */

export type PhotoAdjustments = {
  /** Exposure in signed stops (EV). */
  exposure: number;
  /** Vibrance, a conservative saturation adjustment, from -100 to 100. */
  vibrance: number;
  /** Convert visible pixels to Rec. 709 luminance. */
  blackAndWhite: boolean;
  /** Camera Raw-style highlight recovery in percentage points. */
  highlights: number;
  /** Camera Raw-style shadow recovery in percentage points. */
  shadows: number;
  /** Warm/cool colour temperature shift. */
  temperature: number;
  /** Green/magenta tint shift. */
  tint: number;
  /** Local-contrast approximation around middle gray. */
  clarity: number;
};

export const neutralPhotoAdjustments: PhotoAdjustments = {
  exposure: 0,
  vibrance: 0,
  blackAndWhite: false,
  highlights: 0,
  shadows: 0,
  temperature: 0,
  tint: 0,
  clarity: 0,
};

type PhotoPixels = Uint8ClampedArray<ArrayBufferLike>;
const MAX_PIXELS = 16_000_000;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min = 0, max = 255): number =>
  Math.max(min, Math.min(max, value));

/**
 * Fill fields introduced after the first document format.  Unknown, omitted
 * and malformed values are replaced with a safe neutral value at every
 * persistence/render boundary.
 */
export function effectivePhotoAdjustments(
  value: Partial<PhotoAdjustments> | undefined,
): PhotoAdjustments {
  return {
    exposure: finite(value?.exposure)
      ? clamp(value.exposure, -5, 5)
      : neutralPhotoAdjustments.exposure,
    vibrance: finite(value?.vibrance)
      ? clamp(value.vibrance, -100, 100)
      : neutralPhotoAdjustments.vibrance,
    blackAndWhite: value?.blackAndWhite === true,
    highlights: finite(value?.highlights)
      ? clamp(value.highlights, -100, 100)
      : neutralPhotoAdjustments.highlights,
    shadows: finite(value?.shadows)
      ? clamp(value.shadows, -100, 100)
      : neutralPhotoAdjustments.shadows,
    temperature: finite(value?.temperature)
      ? clamp(value.temperature, -100, 100)
      : neutralPhotoAdjustments.temperature,
    tint: finite(value?.tint)
      ? clamp(value.tint, -100, 100)
      : neutralPhotoAdjustments.tint,
    clarity: finite(value?.clarity)
      ? clamp(value.clarity, -100, 100)
      : neutralPhotoAdjustments.clarity,
  };
}

/** Validate a complete persisted photo correction record. */
export function validPhotoAdjustments(value: unknown): value is PhotoAdjustments {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<PhotoAdjustments>;
  return (
    finite(candidate.exposure) &&
    candidate.exposure >= -5 &&
    candidate.exposure <= 5 &&
    finite(candidate.vibrance) &&
    candidate.vibrance >= -100 &&
    candidate.vibrance <= 100 &&
    typeof candidate.blackAndWhite === 'boolean' &&
    (candidate.highlights === undefined || (finite(candidate.highlights) && candidate.highlights >= -100 && candidate.highlights <= 100)) &&
    (candidate.shadows === undefined || (finite(candidate.shadows) && candidate.shadows >= -100 && candidate.shadows <= 100)) &&
    (candidate.temperature === undefined || (finite(candidate.temperature) && candidate.temperature >= -100 && candidate.temperature <= 100)) &&
    (candidate.tint === undefined || (finite(candidate.tint) && candidate.tint >= -100 && candidate.tint <= 100)) &&
    (candidate.clarity === undefined || (finite(candidate.clarity) && candidate.clarity >= -100 && candidate.clarity <= 100))
  );
}

export function isNeutralPhotoAdjustments(
  value: Partial<PhotoAdjustments> | undefined,
): boolean {
  const normalized = effectivePhotoAdjustments(value);
  return (
    normalized.exposure === 0 &&
    normalized.vibrance === 0 &&
    normalized.blackAndWhite === false &&
    normalized.highlights === 0 &&
    normalized.shadows === 0 &&
    normalized.temperature === 0 &&
    normalized.tint === 0 &&
    normalized.clarity === 0
  );
}

function assertPixels(source: PhotoPixels): void {
  if (!(source instanceof Uint8ClampedArray))
    throw new TypeError('Photo adjustment data must be a Uint8ClampedArray');
  if (source.length < 4 || source.length % 4 !== 0)
    throw new RangeError('Photo adjustment data must contain complete RGBA pixels');
  if (source.length / 4 > MAX_PIXELS)
    throw new RangeError('Photo adjustment data exceeds the 16 megapixel limit');
}

function luminance(red: number, green: number, blue: number): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function applyRawTonalControls(
  red: number,
  green: number,
  blue: number,
  settings: PhotoAdjustments,
): [number, number, number] {
  const gray = luminance(red, green, blue);
  const highlightWeight = Math.max(0, (gray - 128) / 127);
  const shadowWeight = Math.max(0, (128 - gray) / 128);
  const tonalDelta =
    settings.highlights * highlightWeight * 0.9 +
    settings.shadows * shadowWeight * 0.9;
  red += tonalDelta;
  green += tonalDelta;
  blue += tonalDelta;

  // These bounded channel offsets intentionally disclose a local approximation
  // rather than pretending to load camera profiles or linear-light RAW data.
  const temperature = settings.temperature * 0.32;
  const tint = settings.tint * 0.28;
  red += temperature + tint * 0.2;
  green += temperature * 0.2 - tint;
  blue -= temperature + tint * 0.2;

  const clarity = settings.clarity / 100;
  const clarityFactor = 1 + clarity * 0.55;
  const correctedGray = luminance(red, green, blue);
  return [
    clamp(correctedGray + (red - correctedGray) * clarityFactor),
    clamp(correctedGray + (green - correctedGray) * clarityFactor),
    clamp(correctedGray + (blue - correctedGray) * clarityFactor),
  ];
}

/**
 * Increase or reduce chroma around perceived luminance.  Positive values are
 * weighted by the inverse of current saturation, so muted colours receive a
 * stronger lift while already vivid colours avoid harsh clipping. Negative
 * values use a linear fade toward luminance and reach neutral at -100.
 */
function applyVibrance(
  red: number,
  green: number,
  blue: number,
  vibrance: number,
): [number, number, number] {
  if (vibrance === 0) return [red, green, blue];
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const saturation = maximum > 0 ? (maximum - minimum) / maximum : 0;
  const strength = vibrance / 100;
  const factor =
    strength >= 0 ? 1 + strength * (1 - saturation) * 1.5 : 1 + strength;
  const target = luminance(red, green, blue);
  return [
    clamp(target + (red - target) * factor),
    clamp(target + (green - target) * factor),
    clamp(target + (blue - target) * factor),
  ];
}

/** Apply exposure, vibrance and optional B&W in a stable order. */
export function applyPhotoAdjustmentsPixels(
  source: PhotoPixels,
  value: Partial<PhotoAdjustments> | undefined,
): PhotoPixels {
  assertPixels(source);
  const settings = effectivePhotoAdjustments(value);
  const output = new Uint8ClampedArray(source);
  if (isNeutralPhotoAdjustments(settings)) return output;

  // A stop is a factor of two. Clamp the multiplier to a finite byte-safe
  // range even though the persisted EV value itself is tightly bounded.
  const exposureScale = Math.pow(2, settings.exposure);
  for (let offset = 0; offset < source.length; offset += 4) {
    if (source[offset + 3] === 0) continue;
    let red = clamp(source[offset] * exposureScale);
    let green = clamp(source[offset + 1] * exposureScale);
    let blue = clamp(source[offset + 2] * exposureScale);

    [red, green, blue] = applyRawTonalControls(red, green, blue, settings);
    [red, green, blue] = applyVibrance(red, green, blue, settings.vibrance);
    if (settings.blackAndWhite) {
      const gray = luminance(red, green, blue);
      red = gray;
      green = gray;
      blue = gray;
    }
    output[offset] = Math.round(red);
    output[offset + 1] = Math.round(green);
    output[offset + 2] = Math.round(blue);
    output[offset + 3] = source[offset + 3];
  }
  return output;
}

/** Apply the editable correction to a canvas surface without mutating source assets. */
export function applyPhotoAdjustments(
  canvas: HTMLCanvasElement,
  value: Partial<PhotoAdjustments> | undefined,
): HTMLCanvasElement {
  // Neutral controls are common on imported/legacy layers. Avoid a full
  // readback/copy when no photographic correction is requested.
  if (isNeutralPhotoAdjustments(value)) return canvas;
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  image.data.set(applyPhotoAdjustmentsPixels(image.data, value));
  context.putImageData(image, 0, 0);
  return canvas;
}
