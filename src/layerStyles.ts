import { validPatternId, type PatternId } from './patternStamp.ts';
import { blendColorAt, validBlendMode, type LayerBlendMode } from './blendModes.ts';
import { gaussianBoxHalfWidths } from './filterEffects.ts';

/**
 * Bounds that scale to large documents. Shadow and glow blurs are sliding
 * window box passes whose cost does not grow with the radius, and the inner
 * shadow edge uses a separable van Herk/Gil-Werman erosion, so raising these
 * limits only grows the cropped working area (painted bounds plus padding).
 */
export const STYLE_MAX_BLUR = 250;
export const STYLE_MAX_OFFSET = 1000;
export const INNER_SHADOW_MAX_DISTANCE = 250;
export const GLOW_MAX_SIZE = 250;
export const GLOW_SOURCES = ['edge', 'center'] as const;
export type GlowSource = (typeof GLOW_SOURCES)[number];
/**
 * Shadow blur falloff. `box` is the historical single box pass (a linear
 * ramp at large radii); `gaussian` cascades three matched box passes from the
 * Gaussian Blur filter for a bell-shaped falloff at the same visible extent.
 * Stored shadows without the field are legacy documents and keep `box`;
 * shadows created from the neutral defaults use `gaussian`.
 */
export const SHADOW_FALLOFFS = ['gaussian', 'box'] as const;
export type ShadowFalloff = (typeof SHADOW_FALLOFFS)[number];

/**
 * Bounded, nondestructive layer decorations.  These values intentionally live
 * beside layer metadata instead of being baked into an asset so moving,
 * duplicating, undoing and reopening a document preserve the original pixels.
 */
export type DropShadowStyle = {
  enabled: boolean;
  color: string;
  opacity: number;
  offsetX: number;
  offsetY: number;
  blur: number;
  /** How the shadow composites onto the pixels beneath the layer (default Normal). */
  blend: LayerBlendMode;
  falloff: ShadowFalloff;
};

export type InnerShadowStyle = {
  enabled: boolean;
  color: string;
  opacity: number;
  offsetX: number;
  offsetY: number;
  blur: number;
  distance: number;
  falloff: ShadowFalloff;
};

export type BevelEmbossStyle = {
  enabled: boolean;
  highlightColor: string;
  shadowColor: string;
  opacity: number;
  angle: number;
  depth: number;
  blur: number;
};

export type OutlineStyle = {
  enabled: boolean;
  color: string;
  opacity: number;
  width: number;
};

export type ColorOverlayStyle = {
  enabled: boolean;
  color: string;
  opacity: number;
};

export type GradientOverlayStyle = {
  enabled: boolean;
  startColor: string;
  endColor: string;
  opacity: number;
  angle: number;
  reverse: boolean;
};

export type PatternOverlayStyle = {
  enabled: boolean;
  pattern: PatternId;
  foregroundColor: string;
  backgroundColor: string;
  opacity: number;
  tileSize: number;
};

export type OuterGlowStyle = {
  enabled: boolean;
  color: string;
  opacity: number;
  /** Blur extent in pixels, `0..GLOW_MAX_SIZE`. */
  size: number;
  /** Percentage `0..100` that hardens the glow before it fades. */
  spread: number;
  blend: LayerBlendMode;
};

export type InnerGlowStyle = {
  enabled: boolean;
  color: string;
  opacity: number;
  size: number;
  /** Percentage `0..100` that hardens the glow before it fades. */
  choke: number;
  source: GlowSource;
  blend: LayerBlendMode;
};

export type LayerStyles = {
  dropShadow: DropShadowStyle;
  innerShadow: InnerShadowStyle;
  bevelEmboss: BevelEmbossStyle;
  outline: OutlineStyle;
  colorOverlay: ColorOverlayStyle;
  gradientOverlay: GradientOverlayStyle;
  patternOverlay: PatternOverlayStyle;
  outerGlow: OuterGlowStyle;
  innerGlow: InnerGlowStyle;
};

export const neutralLayerStyles: LayerStyles = {
  dropShadow: {
    enabled: false,
    color: '#000000',
    opacity: 0.5,
    offsetX: 8,
    offsetY: 8,
    blur: 12,
    blend: 'source-over',
    falloff: 'gaussian',
  },
  innerShadow: {
    enabled: false,
    color: '#000000',
    opacity: 0.5,
    offsetX: 4,
    offsetY: 4,
    blur: 8,
    distance: 4,
    falloff: 'gaussian',
  },
  bevelEmboss: {
    enabled: false,
    highlightColor: '#ffffff',
    shadowColor: '#000000',
    opacity: 0.5,
    angle: 45,
    depth: 4,
    blur: 0,
  },
  outline: {
    enabled: false,
    color: '#ffffff',
    opacity: 1,
    width: 2,
  },
  colorOverlay: {
    enabled: false,
    color: '#ffffff',
    opacity: 1,
  },
  gradientOverlay: {
    enabled: false,
    startColor: '#000000',
    endColor: '#ffffff',
    opacity: 1,
    angle: 0,
    reverse: false,
  },
  patternOverlay: {
    enabled: false,
    pattern: 'checker',
    foregroundColor: '#000000',
    backgroundColor: '#ffffff',
    opacity: 1,
    tileSize: 32,
  },
  outerGlow: {
    enabled: false,
    color: '#ffffbe',
    opacity: 0.75,
    size: 16,
    spread: 0,
    blend: 'screen',
  },
  innerGlow: {
    enabled: false,
    color: '#ffffbe',
    opacity: 0.75,
    size: 16,
    choke: 0,
    source: 'edge',
    blend: 'screen',
  },
};

const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

const hex = (value: unknown): value is string =>
  typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value);

const glowSource = (value: unknown): value is GlowSource =>
  GLOW_SOURCES.includes(value as GlowSource);

const shadowFalloff = (value: unknown): value is ShadowFalloff =>
  SHADOW_FALLOFFS.includes(value as ShadowFalloff);

/** A stored shadow without a falloff predates the option and keeps the box pass. */
const resolvedFalloff = (shadow: { falloff?: unknown } | undefined, fallback: ShadowFalloff): ShadowFalloff =>
  shadowFalloff(shadow?.falloff) ? shadow!.falloff as ShadowFalloff : shadow && typeof shadow === 'object' ? 'box' : fallback;

function validOuterGlow(value: unknown): value is OuterGlowStyle {
  const glow = value as Partial<OuterGlowStyle> | undefined;
  return Boolean(
    glow &&
      typeof glow === 'object' &&
      typeof glow.enabled === 'boolean' &&
      hex(glow.color) &&
      finite(glow.opacity, 0, 1) &&
      finite(glow.size, 0, GLOW_MAX_SIZE) &&
      finite(glow.spread, 0, 100) &&
      validBlendMode(glow.blend),
  );
}

function validInnerGlow(value: unknown): value is InnerGlowStyle {
  const glow = value as Partial<InnerGlowStyle> | undefined;
  return Boolean(
    glow &&
      typeof glow === 'object' &&
      typeof glow.enabled === 'boolean' &&
      hex(glow.color) &&
      finite(glow.opacity, 0, 1) &&
      finite(glow.size, 0, GLOW_MAX_SIZE) &&
      finite(glow.choke, 0, 100) &&
      glowSource(glow.source) &&
      validBlendMode(glow.blend),
  );
}

export function effectiveLayerStyles(value: Partial<LayerStyles> | undefined): LayerStyles {
  const shadow = value?.dropShadow;
  const innerShadow = value?.innerShadow;
  const bevelEmboss = value?.bevelEmboss;
  const outline = value?.outline;
  const colorOverlay = value?.colorOverlay;
  const gradientOverlay = value?.gradientOverlay;
  const patternOverlay = value?.patternOverlay;
  const outerGlow = value?.outerGlow;
  const innerGlow = value?.innerGlow;
  const neutralOuter = neutralLayerStyles.outerGlow, neutralInner = neutralLayerStyles.innerGlow;
  return {
    dropShadow: {
      ...neutralLayerStyles.dropShadow,
      ...shadow,
      color: hex(shadow?.color) ? shadow!.color : neutralLayerStyles.dropShadow.color,
      opacity: finite(shadow?.opacity, 0, 1)
        ? shadow!.opacity
        : neutralLayerStyles.dropShadow.opacity,
      offsetX: finite(shadow?.offsetX, -STYLE_MAX_OFFSET, STYLE_MAX_OFFSET)
        ? shadow!.offsetX
        : neutralLayerStyles.dropShadow.offsetX,
      offsetY: finite(shadow?.offsetY, -STYLE_MAX_OFFSET, STYLE_MAX_OFFSET)
        ? shadow!.offsetY
        : neutralLayerStyles.dropShadow.offsetY,
      blur: finite(shadow?.blur, 0, STYLE_MAX_BLUR)
        ? shadow!.blur
        : neutralLayerStyles.dropShadow.blur,
      enabled: typeof shadow?.enabled === 'boolean'
        ? shadow.enabled
        : neutralLayerStyles.dropShadow.enabled,
      blend: validBlendMode(shadow?.blend) ? shadow!.blend : neutralLayerStyles.dropShadow.blend,
      falloff: resolvedFalloff(shadow, neutralLayerStyles.dropShadow.falloff),
    },
    innerShadow: {
      ...neutralLayerStyles.innerShadow,
      ...innerShadow,
      color: hex(innerShadow?.color) ? innerShadow!.color : neutralLayerStyles.innerShadow.color,
      opacity: finite(innerShadow?.opacity, 0, 1)
        ? innerShadow!.opacity
        : neutralLayerStyles.innerShadow.opacity,
      offsetX: finite(innerShadow?.offsetX, -STYLE_MAX_OFFSET, STYLE_MAX_OFFSET)
        ? innerShadow!.offsetX
        : neutralLayerStyles.innerShadow.offsetX,
      offsetY: finite(innerShadow?.offsetY, -STYLE_MAX_OFFSET, STYLE_MAX_OFFSET)
        ? innerShadow!.offsetY
        : neutralLayerStyles.innerShadow.offsetY,
      blur: finite(innerShadow?.blur, 0, STYLE_MAX_BLUR)
        ? innerShadow!.blur
        : neutralLayerStyles.innerShadow.blur,
      distance: finite(innerShadow?.distance, 1, INNER_SHADOW_MAX_DISTANCE)
        ? innerShadow!.distance
        : neutralLayerStyles.innerShadow.distance,
      enabled: typeof innerShadow?.enabled === 'boolean'
        ? innerShadow.enabled
        : neutralLayerStyles.innerShadow.enabled,
      falloff: resolvedFalloff(innerShadow, neutralLayerStyles.innerShadow.falloff),
    },
    bevelEmboss: {
      ...neutralLayerStyles.bevelEmboss,
      ...bevelEmboss,
      highlightColor: hex(bevelEmboss?.highlightColor)
        ? bevelEmboss!.highlightColor
        : neutralLayerStyles.bevelEmboss.highlightColor,
      shadowColor: hex(bevelEmboss?.shadowColor)
        ? bevelEmboss!.shadowColor
        : neutralLayerStyles.bevelEmboss.shadowColor,
      opacity: finite(bevelEmboss?.opacity, 0, 1)
        ? bevelEmboss!.opacity
        : neutralLayerStyles.bevelEmboss.opacity,
      angle: finite(bevelEmboss?.angle, -180, 180)
        ? bevelEmboss!.angle
        : neutralLayerStyles.bevelEmboss.angle,
      depth: finite(bevelEmboss?.depth, 1, 32)
        ? bevelEmboss!.depth
        : neutralLayerStyles.bevelEmboss.depth,
      blur: finite(bevelEmboss?.blur, 0, 32)
        ? bevelEmboss!.blur
        : neutralLayerStyles.bevelEmboss.blur,
      enabled: typeof bevelEmboss?.enabled === 'boolean'
        ? bevelEmboss.enabled
        : neutralLayerStyles.bevelEmboss.enabled,
    },
    outline: {
      ...neutralLayerStyles.outline,
      ...outline,
      color: hex(outline?.color) ? outline!.color : neutralLayerStyles.outline.color,
      opacity: finite(outline?.opacity, 0, 1)
        ? outline!.opacity
        : neutralLayerStyles.outline.opacity,
      width: finite(outline?.width, 1, 32)
        ? outline!.width
        : neutralLayerStyles.outline.width,
      enabled: typeof outline?.enabled === 'boolean'
        ? outline.enabled
        : neutralLayerStyles.outline.enabled,
    },
    colorOverlay: {
      ...neutralLayerStyles.colorOverlay,
      ...colorOverlay,
      color: hex(colorOverlay?.color) ? colorOverlay!.color : neutralLayerStyles.colorOverlay.color,
      opacity: finite(colorOverlay?.opacity, 0, 1)
        ? colorOverlay!.opacity
        : neutralLayerStyles.colorOverlay.opacity,
      enabled: typeof colorOverlay?.enabled === 'boolean'
        ? colorOverlay.enabled
        : neutralLayerStyles.colorOverlay.enabled,
    },
    gradientOverlay: {
      ...neutralLayerStyles.gradientOverlay,
      ...gradientOverlay,
      startColor: hex(gradientOverlay?.startColor)
        ? gradientOverlay!.startColor
        : neutralLayerStyles.gradientOverlay.startColor,
      endColor: hex(gradientOverlay?.endColor)
        ? gradientOverlay!.endColor
        : neutralLayerStyles.gradientOverlay.endColor,
      opacity: finite(gradientOverlay?.opacity, 0, 1)
        ? gradientOverlay!.opacity
        : neutralLayerStyles.gradientOverlay.opacity,
      angle: finite(gradientOverlay?.angle, -180, 180)
        ? gradientOverlay!.angle
        : neutralLayerStyles.gradientOverlay.angle,
      reverse: typeof gradientOverlay?.reverse === 'boolean'
        ? gradientOverlay.reverse
        : neutralLayerStyles.gradientOverlay.reverse,
      enabled: typeof gradientOverlay?.enabled === 'boolean'
        ? gradientOverlay.enabled
        : neutralLayerStyles.gradientOverlay.enabled,
    },
    patternOverlay: {
      ...neutralLayerStyles.patternOverlay,
      ...patternOverlay,
      pattern: validPatternId(patternOverlay?.pattern)
        ? patternOverlay!.pattern
        : neutralLayerStyles.patternOverlay.pattern,
      foregroundColor: hex(patternOverlay?.foregroundColor)
        ? patternOverlay!.foregroundColor
        : neutralLayerStyles.patternOverlay.foregroundColor,
      backgroundColor: hex(patternOverlay?.backgroundColor)
        ? patternOverlay!.backgroundColor
        : neutralLayerStyles.patternOverlay.backgroundColor,
      opacity: finite(patternOverlay?.opacity, 0, 1)
        ? patternOverlay!.opacity
        : neutralLayerStyles.patternOverlay.opacity,
      tileSize: finite(patternOverlay?.tileSize, 4, 128) && Number.isInteger(patternOverlay!.tileSize)
        ? patternOverlay!.tileSize
        : neutralLayerStyles.patternOverlay.tileSize,
      enabled: typeof patternOverlay?.enabled === 'boolean'
        ? patternOverlay.enabled
        : neutralLayerStyles.patternOverlay.enabled,
    },
    outerGlow: {
      enabled: typeof outerGlow?.enabled === 'boolean' ? outerGlow.enabled : neutralOuter.enabled,
      color: hex(outerGlow?.color) ? outerGlow!.color : neutralOuter.color,
      opacity: finite(outerGlow?.opacity, 0, 1) ? outerGlow!.opacity : neutralOuter.opacity,
      size: finite(outerGlow?.size, 0, GLOW_MAX_SIZE) ? outerGlow!.size : neutralOuter.size,
      spread: finite(outerGlow?.spread, 0, 100) ? outerGlow!.spread : neutralOuter.spread,
      blend: validBlendMode(outerGlow?.blend) ? outerGlow!.blend : neutralOuter.blend,
    },
    innerGlow: {
      enabled: typeof innerGlow?.enabled === 'boolean' ? innerGlow.enabled : neutralInner.enabled,
      color: hex(innerGlow?.color) ? innerGlow!.color : neutralInner.color,
      opacity: finite(innerGlow?.opacity, 0, 1) ? innerGlow!.opacity : neutralInner.opacity,
      size: finite(innerGlow?.size, 0, GLOW_MAX_SIZE) ? innerGlow!.size : neutralInner.size,
      choke: finite(innerGlow?.choke, 0, 100) ? innerGlow!.choke : neutralInner.choke,
      source: glowSource(innerGlow?.source) ? innerGlow!.source : neutralInner.source,
      blend: validBlendMode(innerGlow?.blend) ? innerGlow!.blend : neutralInner.blend,
    },
  };
}

export function validLayerStyles(value: unknown): value is LayerStyles {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LayerStyles>;
  const shadow = candidate.dropShadow,
    innerShadow = candidate.innerShadow,
    bevelEmboss = candidate.bevelEmboss,
    outline = candidate.outline,
    gradientOverlay = candidate.gradientOverlay,
    patternOverlay = candidate.patternOverlay;
  return Boolean(
    shadow &&
      typeof shadow === 'object' &&
      typeof shadow.enabled === 'boolean' &&
      hex(shadow.color) &&
      finite(shadow.opacity, 0, 1) &&
      finite(shadow.offsetX, -STYLE_MAX_OFFSET, STYLE_MAX_OFFSET) &&
      finite(shadow.offsetY, -STYLE_MAX_OFFSET, STYLE_MAX_OFFSET) &&
      finite(shadow.blur, 0, STYLE_MAX_BLUR) &&
      (shadow.blend === undefined || validBlendMode(shadow.blend)) &&
      (shadow.falloff === undefined || shadowFalloff(shadow.falloff)) &&
      (innerShadow === undefined || (
        innerShadow &&
        typeof innerShadow === 'object' &&
        typeof innerShadow.enabled === 'boolean' &&
        hex(innerShadow.color) &&
        finite(innerShadow.opacity, 0, 1) &&
        finite(innerShadow.offsetX, -STYLE_MAX_OFFSET, STYLE_MAX_OFFSET) &&
        finite(innerShadow.offsetY, -STYLE_MAX_OFFSET, STYLE_MAX_OFFSET) &&
        finite(innerShadow.blur, 0, STYLE_MAX_BLUR) &&
        finite(innerShadow.distance, 1, INNER_SHADOW_MAX_DISTANCE) &&
        (innerShadow.falloff === undefined || shadowFalloff(innerShadow.falloff))
      )) &&
      (bevelEmboss === undefined || (
        bevelEmboss &&
        typeof bevelEmboss === 'object' &&
        typeof bevelEmboss.enabled === 'boolean' &&
        hex(bevelEmboss.highlightColor) &&
        hex(bevelEmboss.shadowColor) &&
        finite(bevelEmboss.opacity, 0, 1) &&
        finite(bevelEmboss.angle, -180, 180) &&
        finite(bevelEmboss.depth, 1, 32) &&
        finite(bevelEmboss.blur, 0, 32)
      )) &&
      outline &&
      typeof outline === 'object' &&
      typeof outline.enabled === 'boolean' &&
      hex(outline.color) &&
      finite(outline.opacity, 0, 1) &&
      finite(outline.width, 1, 32) &&
      (candidate.colorOverlay === undefined || (
        candidate.colorOverlay &&
        typeof candidate.colorOverlay === 'object' &&
        typeof candidate.colorOverlay.enabled === 'boolean' &&
        hex(candidate.colorOverlay.color) &&
        finite(candidate.colorOverlay.opacity, 0, 1)
      )) &&
      (gradientOverlay === undefined || (
        gradientOverlay &&
        typeof gradientOverlay === 'object' &&
        typeof gradientOverlay.enabled === 'boolean' &&
        hex(gradientOverlay.startColor) &&
        hex(gradientOverlay.endColor) &&
        finite(gradientOverlay.opacity, 0, 1) &&
        finite(gradientOverlay.angle, -180, 180) &&
        typeof gradientOverlay.reverse === 'boolean'
      )) &&
      (patternOverlay === undefined || (
        patternOverlay &&
        typeof patternOverlay === 'object' &&
        typeof patternOverlay.enabled === 'boolean' &&
        validPatternId(patternOverlay.pattern) &&
        hex(patternOverlay.foregroundColor) &&
        hex(patternOverlay.backgroundColor) &&
        finite(patternOverlay.opacity, 0, 1) &&
        finite(patternOverlay.tileSize, 4, 128) &&
        Number.isInteger(patternOverlay.tileSize)
      )) &&
      (candidate.outerGlow === undefined || validOuterGlow(candidate.outerGlow)) &&
      (candidate.innerGlow === undefined || validInnerGlow(candidate.innerGlow)),
  );
}

export function isNeutralLayerStyles(value: Partial<LayerStyles> | undefined): boolean {
  const styles = effectiveLayerStyles(value);
  return !styles.dropShadow.enabled && !styles.innerShadow.enabled && !styles.bevelEmboss.enabled && !styles.outline.enabled &&
    !styles.colorOverlay.enabled && !styles.gradientOverlay.enabled && !styles.patternOverlay.enabled &&
    !styles.outerGlow.enabled && !styles.innerGlow.enabled;
}

function color(value: string): [number, number, number] {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function over(
  target: Uint8ClampedArray,
  offset: number,
  red: number,
  green: number,
  blue: number,
  alpha: number,
) {
  if (alpha <= 0) return;
  const source = Math.max(0, Math.min(1, alpha / 255));
  const destination = target[offset + 3] / 255;
  const result = source + destination * (1 - source);
  if (result <= 0) return;
  target[offset] = Math.round((red * source + target[offset] * destination * (1 - source)) / result);
  target[offset + 1] = Math.round((green * source + target[offset + 1] * destination * (1 - source)) / result);
  target[offset + 2] = Math.round((blue * source + target[offset + 2] * destination * (1 - source)) / result);
  target[offset + 3] = Math.round(result * 255);
}

/** A deterministic separable box blur over alpha only. */
function blurAlpha(source: Uint8ClampedArray, width: number, height: number, radius: number) {
  if (radius <= 0) return source.slice();
  const horizontal = new Uint8ClampedArray(width * height), output = new Uint8ClampedArray(width * height), span = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let x = -radius; x < width + radius; x += 1) {
      if (x + radius < width && x + radius >= 0) sum += source[y * width + x + radius];
      if (x - radius - 1 >= 0 && x - radius - 1 < width) sum -= source[y * width + x - radius - 1];
      if (x >= 0 && x < width) horizontal[y * width + x] = Math.round(sum / span);
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -radius; y < height + radius; y += 1) {
      if (y + radius < height && y + radius >= 0) sum += horizontal[(y + radius) * width + x];
      if (y - radius - 1 >= 0 && y - radius - 1 < height) sum -= horizontal[(y - radius - 1) * width + x];
      if (y >= 0 && y < height) output[y * width + x] = Math.round(sum / span);
    }
  }
  return output;
}

/**
 * Exact 1-D squared Euclidean distance transform (Felzenszwalb and
 * Huttenlocher): `output[i] = min_q (i - q)^2 + input[q]` over one line.
 */
function distanceLine(
  values: Float32Array,
  start: number,
  stride: number,
  length: number,
  input: Float64Array,
  output: Float64Array,
  hull: Int32Array,
  bounds: Float64Array,
) {
  for (let i = 0; i < length; i += 1) input[i] = values[start + i * stride];
  let k = 0;
  hull[0] = 0;
  bounds[0] = -Infinity;
  bounds[1] = Infinity;
  for (let q = 1; q < length; q += 1) {
    // bounds[0] is -Infinity, so this always stops at k = 0 at the latest.
    let p = hull[k];
    let crossing = ((input[q] + q * q) - (input[p] + p * p)) / (2 * q - 2 * p);
    while (crossing <= bounds[k]) {
      k -= 1;
      p = hull[k];
      crossing = ((input[q] + q * q) - (input[p] + p * p)) / (2 * q - 2 * p);
    }
    k += 1;
    hull[k] = q;
    bounds[k] = crossing;
    bounds[k + 1] = Infinity;
  }
  k = 0;
  for (let i = 0; i < length; i += 1) {
    while (bounds[k + 1] < i) k += 1;
    const p = hull[k];
    output[i] = (i - p) * (i - p) + input[p];
  }
  for (let i = 0; i < length; i += 1) values[start + i * stride] = output[i];
}

/**
 * Squared Euclidean distance from each sample to the nearest `outside`
 * sample, capped at `cap` (larger distances read as `cap`). Separable and
 * linear in the area, so the cost does not depend on the choke distance.
 */
export function squaredDistanceToOutside(
  outside: Uint8Array,
  width: number,
  height: number,
  cap: number,
): Float32Array {
  const field = new Float32Array(width * height);
  for (let i = 0; i < field.length; i += 1) field[i] = outside[i] ? 0 : cap;
  const longest = Math.max(width, height);
  const input = new Float64Array(longest), output = new Float64Array(longest);
  const hull = new Int32Array(longest), bounds = new Float64Array(longest + 1);
  for (let x = 0; x < width; x += 1) distanceLine(field, x, width, height, input, output, hull, bounds);
  for (let y = 0; y < height; y += 1) distanceLine(field, y * width, 1, width, input, output, hull, bounds);
  for (let i = 0; i < field.length; i += 1) if (field[i] > cap) field[i] = cap;
  return field;
}

export type InnerShadowBand = {
  /** Shadow source alpha over a crop of the layer (255 = full shadow). */
  mask: Uint8ClampedArray;
  /** Crop origin and size in layer pixels (may extend past the layer). */
  x: number;
  y: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  blur: number;
};

/**
 * The Inner Shadow source before blur: everything outside the layer's alpha
 * plus a choke band `distance` pixels wide inside its edge, measured with a
 * Euclidean distance (a circle chokes to a smaller circle, not a diamond or
 * square). Pixels beyond the layer bounds count as outside. The crop covers
 * the painted bounds moved back by the offset, padded by the blur support, so
 * every destination pixel can read `band[p - offset]` without edge cases.
 */
export function innerShadowBand(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  bounds: AlphaBounds,
  shadow: Pick<InnerShadowStyle, 'distance' | 'blur' | 'offsetX' | 'offsetY'>,
): InnerShadowBand {
  const distance = Math.max(0, Math.round(shadow.distance));
  const blur = Math.max(0, Math.round(shadow.blur));
  const offsetX = Math.round(shadow.offsetX), offsetY = Math.round(shadow.offsetY);
  const reach = blur + 1;
  const x = bounds.minX - offsetX - reach, y = bounds.minY - offsetY - reach;
  const cropWidth = bounds.maxX - bounds.minX + 1 + reach * 2;
  const cropHeight = bounds.maxY - bounds.minY + 1 + reach * 2;
  // The distance field needs every outside sample within `distance + 1` of
  // the crop, so it runs over a slightly larger area.
  const margin = distance + 1;
  const fieldX = x - margin, fieldY = y - margin;
  const fieldWidth = cropWidth + margin * 2, fieldHeight = cropHeight + margin * 2;
  // Coverage is measured relative to the layer's most opaque pixel, so a
  // uniformly semi-transparent layer (an 85% Clouds fill) is shaded at its
  // edges only instead of being tinted everywhere.
  let peak = 0;
  for (let y = bounds.minY; y <= bounds.maxY; y += 1)
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) peak = Math.max(peak, alpha[y * width + x]);
  const scale = peak > 0 ? 255 / peak : 0;
  const sample = (gx: number, gy: number) =>
    gx >= 0 && gx < width && gy >= 0 && gy < height ? Math.min(255, alpha[gy * width + gx] * scale) : 0;
  const outside = new Uint8Array(fieldWidth * fieldHeight);
  for (let fy = 0; fy < fieldHeight; fy += 1)
    for (let fx = 0; fx < fieldWidth; fx += 1)
      outside[fy * fieldWidth + fx] = sample(fieldX + fx, fieldY + fy) < 128 ? 1 : 0;
  const cap = (distance + 2) * (distance + 2);
  const field = squaredDistanceToOutside(outside, fieldWidth, fieldHeight, cap);
  const mask = new Uint8ClampedArray(cropWidth * cropHeight);
  for (let cy = 0; cy < cropHeight; cy += 1)
    for (let cx = 0; cx < cropWidth; cx += 1) {
      const own = sample(x + cx, y + cy);
      let value = Math.round(255 - own);
      if (own >= 128 && distance > 0) {
        const squared = field[(cy + margin) * fieldWidth + cx + margin];
        // Full shadow up to `distance` pixels from the edge, then a one-pixel
        // antialiased ramp.
        const coverage = distance + 1 - Math.sqrt(squared);
        if (coverage > 0) value = Math.max(value, Math.round(Math.min(1, coverage) * 255));
      }
      mask[cy * cropWidth + cx] = value;
    }
  return { mask, x, y, width: cropWidth, height: cropHeight, offsetX, offsetY, blur };
}

/**
 * Gaussian-quality shadow blur: the Gaussian Blur filter's cascade of three
 * running-sum box passes with matched variance (sigma = blur / 3) and total
 * support <= blur, so the visible extent matches the legacy single box pass
 * while the falloff is bell-shaped instead of a linear ramp. Intermediate
 * passes stay in floating point and samples outside the area are zero.
 */
export function shadowGaussianHalfWidths(blur: number): number[] {
  const radius = Math.round(blur);
  return radius > 0 ? gaussianBoxHalfWidths(radius, 3, STYLE_MAX_BLUR) : [];
}

function boxPassFloat(input: Float32Array, output: Float32Array, start: number, stride: number, length: number, half: number) {
  const span = half * 2 + 1;
  let sum = 0;
  for (let i = 0; i <= Math.min(length - 1, half); i += 1) sum += input[start + i * stride];
  for (let i = 0; i < length; i += 1) {
    output[start + i * stride] = sum / span;
    const entering = i + half + 1, leaving = i - half;
    if (entering < length) sum += input[start + entering * stride];
    if (leaving >= 0) sum -= input[start + leaving * stride];
  }
}

function blurAlphaGaussian(source: Uint8ClampedArray, width: number, height: number, blur: number) {
  const halves = shadowGaussianHalfWidths(blur);
  if (!halves.length) return source.slice();
  let from = Float32Array.from(source), to = new Float32Array(source.length);
  for (const half of halves) {
    if (half <= 0) continue;
    for (let y = 0; y < height; y += 1) boxPassFloat(from, to, y * width, 1, width, half);
    [from, to] = [to, from];
    for (let x = 0; x < width; x += 1) boxPassFloat(from, to, x, width, height, half);
    [from, to] = [to, from];
  }
  const output = new Uint8ClampedArray(source.length);
  for (let i = 0; i < output.length; i += 1) output[i] = Math.round(from[i]);
  return output;
}

function blurShadowAlpha(source: Uint8ClampedArray, width: number, height: number, blur: number, falloff: ShadowFalloff) {
  return falloff === 'gaussian'
    ? blurAlphaGaussian(source, width, height, blur)
    : blurAlpha(source, width, height, blur);
}

/**
 * Three box passes approximate a Gaussian falloff whose visible extent is
 * about `size` pixels. Each pass is a radius-independent sliding window.
 */
function glowBlurRadius(size: number) {
  return size > 0 ? Math.ceil(size / 3) : 0;
}

function blurAlphaSmooth(source: Uint8ClampedArray, width: number, height: number, size: number) {
  const radius = glowBlurRadius(size);
  if (radius <= 0) return source.slice();
  return blurAlpha(blurAlpha(blurAlpha(source, width, height, radius), width, height, radius), width, height, radius);
}

/** Spread/choke hardens the blurred mask like a levels clip: 100% is a hard edge. */
function hardenMask(value: number, percent: number) {
  if (percent <= 0) return value;
  if (percent >= 100) return value > 0 ? 255 : 0;
  return Math.min(255, value / (1 - percent / 100));
}

type AlphaBounds = { minX: number; minY: number; maxX: number; maxY: number };

/** Find the painted extent so sparse layers do not pay for a full-frame blur. */
function alphaBounds(source: Uint8ClampedArray, width: number, height: number): AlphaBounds | undefined {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      if (source[(y * width + x) * 4 + 3] > 0) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
  return maxX >= 0 ? { minX, minY, maxX, maxY } : undefined;
}

/**
 * Which slice of the style stack a render pass produces. `all` is the whole
 * decorated layer (the historical single pass). When an outer effect (Drop
 * Shadow, Outer Glow) uses a blend mode other than Normal, the renderer
 * composites each outer effect onto the pixels beneath the layer with its own
 * mode, then the `body` (everything else) with the layer's mode, so a Screen
 * glow brightens the backdrop instead of reducing to Normal over transparency.
 */
export type LayerStyleRenderPart = 'all' | 'body' | 'drop-shadow' | 'outer-glow';

/**
 * Render-only styles with a part tag. The tag is never persisted: the
 * renderer adds it to one-layer copies it builds internally, and it is part
 * of those copies' local filter-cache key because it lives on `styles`.
 */
export type LayerStylesWithPart = Partial<LayerStyles> & { renderPart?: LayerStyleRenderPart };

export function withLayerStylePart(
  value: Partial<LayerStyles> | undefined,
  part: Exclude<LayerStyleRenderPart, 'all'>,
): LayerStyles & { renderPart: LayerStyleRenderPart } {
  return { ...effectiveLayerStyles(value), renderPart: part };
}

const renderPartOf = (value: LayerStylesWithPart | undefined): LayerStyleRenderPart => {
  const part = value?.renderPart;
  return part === 'body' || part === 'drop-shadow' || part === 'outer-glow' ? part : 'all';
};

export type LayerStyleBackdropPass = { part: 'drop-shadow' | 'outer-glow'; blend: LayerBlendMode };

/**
 * Outer effects that must be composited separately against the backdrop,
 * bottom to top. Empty (one combined pass, unchanged pixels) unless an
 * enabled, visible Drop Shadow or Outer Glow uses a non-Normal blend mode;
 * then both enabled outer effects are split out so their order is kept.
 */
export function layerStyleBackdropPasses(value: LayerStylesWithPart | undefined): LayerStyleBackdropPass[] {
  if (renderPartOf(value) !== 'all') return [];
  const styles = effectiveLayerStyles(value);
  const shadow = styles.dropShadow.enabled && styles.dropShadow.opacity > 0;
  const glow = styles.outerGlow.enabled && styles.outerGlow.opacity > 0;
  if (!(shadow && styles.dropShadow.blend !== 'source-over') && !(glow && styles.outerGlow.blend !== 'source-over'))
    return [];
  const passes: LayerStyleBackdropPass[] = [];
  if (shadow) passes.push({ part: 'drop-shadow', blend: styles.dropShadow.blend });
  if (glow) passes.push({ part: 'outer-glow', blend: styles.outerGlow.blend });
  return passes;
}

/**
 * Apply the editable style stack to RGBA pixels without mutating the source.
 * This pure function is shared by the main thread and the render worker.
 * A `renderPart` tag (see `withLayerStylePart`) selects one slice: an outer
 * effect alone over transparency, or the body without outer effects.
 */
export function applyLayerStylesPixels(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  value: LayerStylesWithPart | undefined,
): Uint8ClampedArray {
  const styles = effectiveLayerStyles(value), part = renderPartOf(value);
  const effectOnly = part === 'drop-shadow' || part === 'outer-glow';
  if (part === 'body') {
    styles.dropShadow = { ...styles.dropShadow, enabled: false };
    styles.outerGlow = { ...styles.outerGlow, enabled: false };
  }
  if (effectOnly && (width <= 0 || height <= 0)) return new Uint8ClampedArray(source.length);
  if (isNeutralLayerStyles(styles) || width <= 0 || height <= 0) return source.slice();
  // Start from a detached source copy so transparent pixels retain their
  // hidden RGB bytes even when a style only touches painted bounds. An outer
  // effect pass starts from transparency and draws only that effect.
  const output = effectOnly ? new Uint8ClampedArray(source.length) : source.slice(),
    alpha = new Uint8ClampedArray(width * height);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = source[i * 4 + 3];
  const bounds = alphaBounds(source, width, height);
  if (!bounds) return effectOnly ? output : source.slice();
  // The source is composited back over the outer effects below. Clear the
  // copy's coverage first (RGB bytes stay), so a semi-transparent pixel is
  // not composited over itself and does not become more opaque just because
  // a style is enabled. Every covered pixel is inside `bounds` and is drawn
  // again by the source pass, so fully opaque pixels are unchanged.
  if (!effectOnly)
    for (let y = bounds.minY; y <= bounds.maxY; y += 1)
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) output[(y * width + x) * 4 + 3] = 0;
  if (styles.dropShadow.enabled && (part === 'all' || part === 'drop-shadow')) {
    const radius = Math.round(styles.dropShadow.blur);
    // Blur only the source extent plus the kernel radius. The previous full
    // frame pass made a single painted dab cost tens of millions of samples.
    const sourceX = Math.max(0, bounds.minX - radius), sourceY = Math.max(0, bounds.minY - radius);
    const sourceRight = Math.min(width - 1, bounds.maxX + radius), sourceBottom = Math.min(height - 1, bounds.maxY + radius);
    const sourceWidth = sourceRight - sourceX + 1, sourceHeight = sourceBottom - sourceY + 1;
    const crop = new Uint8ClampedArray(sourceWidth * sourceHeight);
    for (let y = 0; y < sourceHeight; y += 1)
      for (let x = 0; x < sourceWidth; x += 1)
        crop[y * sourceWidth + x] = alpha[(sourceY + y) * width + sourceX + x];
    const shadowAlpha = blurShadowAlpha(crop, sourceWidth, sourceHeight, radius, styles.dropShadow.falloff);
    const [r, g, b] = color(styles.dropShadow.color);
    const offsetX = Math.round(styles.dropShadow.offsetX), offsetY = Math.round(styles.dropShadow.offsetY);
    for (let y = 0; y < sourceHeight; y += 1)
      for (let x = 0; x < sourceWidth; x += 1) {
        const dx = sourceX + x + offsetX, dy = sourceY + y + offsetY;
        if (dx >= 0 && dx < width && dy >= 0 && dy < height)
          over(output, (dy * width + dx) * 4, r, g, b, shadowAlpha[y * sourceWidth + x] * styles.dropShadow.opacity);
      }
  }
  if (part === 'drop-shadow') return output;
  if (styles.outerGlow.enabled && styles.outerGlow.opacity > 0 && (part === 'all' || part === 'outer-glow')) {
    const glow = styles.outerGlow, size = Math.round(glow.size);
    const padding = glowBlurRadius(size) * 3 + 1;
    const sourceX = Math.max(0, bounds.minX - padding), sourceY = Math.max(0, bounds.minY - padding);
    const sourceRight = Math.min(width - 1, bounds.maxX + padding), sourceBottom = Math.min(height - 1, bounds.maxY + padding);
    const sourceWidth = sourceRight - sourceX + 1, sourceHeight = sourceBottom - sourceY + 1;
    const crop = new Uint8ClampedArray(sourceWidth * sourceHeight);
    for (let y = 0; y < sourceHeight; y += 1)
      for (let x = 0; x < sourceWidth; x += 1)
        crop[y * sourceWidth + x] = alpha[(sourceY + y) * width + sourceX + x];
    const mask = blurAlphaSmooth(crop, sourceWidth, sourceHeight, size);
    const [r, g, b] = color(glow.color), scratch: [number, number, number] = [0, 0, 0];
    for (let y = 0; y < sourceHeight; y += 1)
      for (let x = 0; x < sourceWidth; x += 1) {
        const value = mask[y * sourceWidth + x];
        if (value === 0) continue;
        blendColorAt(
          output,
          ((sourceY + y) * width + sourceX + x) * 4,
          r, g, b,
          hardenMask(value, glow.spread) * glow.opacity,
          glow.blend,
          scratch,
        );
      }
  }
  if (part === 'outer-glow') return output;
  if (styles.outline.enabled) {
    const [r, g, b] = color(styles.outline.color), radius = Math.round(styles.outline.width);
    const minX = Math.max(0, bounds.minX - radius), maxX = Math.min(width - 1, bounds.maxX + radius);
    const minY = Math.max(0, bounds.minY - radius), maxY = Math.min(height - 1, bounds.maxY + radius);
    for (let y = minY; y <= maxY; y += 1)
      for (let x = minX; x <= maxX; x += 1) {
        let max = 0;
        for (let oy = -radius; oy <= radius && max < 255; oy += 1)
          for (let ox = -radius; ox <= radius; ox += 1) {
            const sx = x + ox, sy = y + oy;
            if (sx >= 0 && sx < width && sy >= 0 && sy < height) max = Math.max(max, alpha[sy * width + sx]);
          }
        const own = alpha[y * width + x];
        if (max > own) over(output, (y * width + x) * 4, r, g, b, (max - own) * styles.outline.opacity);
      }
  }
  for (let y = bounds.minY; y <= bounds.maxY; y += 1)
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const i = (y * width + x) * 4;
      over(output, i, source[i], source[i + 1], source[i + 2], source[i + 3]);
    }
  if (styles.innerShadow.enabled && styles.innerShadow.opacity > 0) {
    const shadow = styles.innerShadow;
    const band = innerShadowBand(alpha, width, height, bounds, shadow);
    const softened = blurShadowAlpha(band.mask, band.width, band.height, band.blur, shadow.falloff);
    const [r, g, b] = color(shadow.color);
    for (let y = bounds.minY; y <= bounds.maxY; y += 1)
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const destination = (y * width + x) * 4;
        if (source[destination + 3] === 0) continue;
        // The shadow is the choked outside region moved by the offset: a
        // pixel reads the band `offset` pixels back toward the light.
        const sx = x - band.offsetX - band.x, sy = y - band.offsetY - band.y;
        const amount = softened[sy * band.width + sx] * (source[destination + 3] / 255) * shadow.opacity;
        over(output, destination, r, g, b, amount);
      }
  }
  if (styles.innerGlow.enabled && styles.innerGlow.opacity > 0) {
    const glow = styles.innerGlow, size = Math.round(glow.size);
    // The inverse alpha is opaque outside the layer. Pad the crop by twice
    // the blur extent so the box passes' zero border cannot reach the
    // painted bounds.
    const padding = glowBlurRadius(size) * 6 + 1;
    const sourceX = bounds.minX - padding, sourceY = bounds.minY - padding;
    const sourceWidth = bounds.maxX - bounds.minX + 1 + padding * 2;
    const sourceHeight = bounds.maxY - bounds.minY + 1 + padding * 2;
    const inverse = new Uint8ClampedArray(sourceWidth * sourceHeight);
    for (let y = 0; y < sourceHeight; y += 1)
      for (let x = 0; x < sourceWidth; x += 1) {
        const gx = sourceX + x, gy = sourceY + y;
        inverse[y * sourceWidth + x] = gx >= 0 && gx < width && gy >= 0 && gy < height
          ? 255 - alpha[gy * width + gx]
          : 255;
      }
    const mask = blurAlphaSmooth(inverse, sourceWidth, sourceHeight, size);
    const [r, g, b] = color(glow.color), scratch: [number, number, number] = [0, 0, 0];
    for (let y = bounds.minY; y <= bounds.maxY; y += 1)
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const destination = (y * width + x) * 4;
        const sourceAlpha = source[destination + 3];
        if (sourceAlpha === 0) continue;
        const edgeAmount = hardenMask(mask[(y - sourceY) * sourceWidth + x - sourceX], glow.choke);
        const amount = glow.source === 'edge' ? edgeAmount : 255 - edgeAmount;
        blendColorAt(output, destination, r, g, b, amount * (sourceAlpha / 255) * glow.opacity, glow.blend, scratch);
      }
  }
  if (styles.bevelEmboss.enabled) {
    const depth = Math.round(styles.bevelEmboss.depth);
    const blur = Math.round(styles.bevelEmboss.blur);
    const angle = (styles.bevelEmboss.angle * Math.PI) / 180;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const padding = depth + blur + 1;
    const sourceX = Math.max(0, bounds.minX - padding);
    const sourceY = Math.max(0, bounds.minY - padding);
    const sourceRight = Math.min(width - 1, bounds.maxX + padding);
    const sourceBottom = Math.min(height - 1, bounds.maxY + padding);
    const sourceWidth = sourceRight - sourceX + 1;
    const sourceHeight = sourceBottom - sourceY + 1;
    const highlight = new Uint8ClampedArray(sourceWidth * sourceHeight);
    const shadow = new Uint8ClampedArray(sourceWidth * sourceHeight);
    const sample = (x: number, y: number) =>
      x >= 0 && x < width && y >= 0 && y < height ? alpha[y * width + x] : 0;
    for (let y = 0; y < sourceHeight; y += 1)
      for (let x = 0; x < sourceWidth; x += 1) {
        const gx = sourceX + x, gy = sourceY + y;
        const own = sample(gx, gy);
        if (own === 0) continue;
        const towardLight = sample(
          Math.round(gx - dx * depth),
          Math.round(gy - dy * depth),
        );
        const awayFromLight = sample(
          Math.round(gx + dx * depth),
          Math.round(gy + dy * depth),
        );
        const index = y * sourceWidth + x;
        highlight[index] = Math.max(0, towardLight - awayFromLight);
        shadow[index] = Math.max(0, awayFromLight - towardLight);
      }
    const softenedHighlight = blurAlpha(highlight, sourceWidth, sourceHeight, blur);
    const softenedShadow = blurAlpha(shadow, sourceWidth, sourceHeight, blur);
    const [highlightR, highlightG, highlightB] = color(styles.bevelEmboss.highlightColor);
    const [shadowR, shadowG, shadowB] = color(styles.bevelEmboss.shadowColor);
    for (let y = bounds.minY; y <= bounds.maxY; y += 1)
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const destination = (y * width + x) * 4;
        const sourceAlpha = source[destination + 3];
        if (sourceAlpha === 0) continue;
        const index = (y - sourceY) * sourceWidth + (x - sourceX);
        const scale = (sourceAlpha / 255) * styles.bevelEmboss.opacity;
        over(output, destination, highlightR, highlightG, highlightB, softenedHighlight[index] * scale);
        over(output, destination, shadowR, shadowG, shadowB, softenedShadow[index] * scale);
      }
  }
  if (styles.colorOverlay.enabled) {
    const [r, g, b] = color(styles.colorOverlay.color);
    for (let y = bounds.minY; y <= bounds.maxY; y += 1)
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const i = (y * width + x) * 4;
        over(output, i, r, g, b, source[i + 3] * styles.colorOverlay.opacity);
      }
  }
  if (styles.gradientOverlay.enabled) {
    const [startR, startG, startB] = color(styles.gradientOverlay.startColor);
    const [endR, endG, endB] = color(styles.gradientOverlay.endColor);
    const angle = (styles.gradientOverlay.angle * Math.PI) / 180;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const corners = [
      0,
      (width - 1) * dx,
      (height - 1) * dy,
      (width - 1) * dx + (height - 1) * dy,
    ];
    const min = Math.min(...corners), span = Math.max(1, Math.max(...corners) - min);
    for (let y = bounds.minY; y <= bounds.maxY; y += 1)
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const i = (y * width + x) * 4;
        let t = ((x * dx + y * dy) - min) / span;
        if (styles.gradientOverlay.reverse) t = 1 - t;
        t = Math.max(0, Math.min(1, t));
        over(
          output,
          i,
          startR + (endR - startR) * t,
          startG + (endG - startG) * t,
          startB + (endB - startB) * t,
          source[i + 3] * styles.gradientOverlay.opacity,
        );
      }
  }
  if (styles.patternOverlay.enabled) {
    const [foregroundR, foregroundG, foregroundB] = color(styles.patternOverlay.foregroundColor);
    const [backgroundR, backgroundG, backgroundB] = color(styles.patternOverlay.backgroundColor);
    const foreground = [foregroundR, foregroundG, foregroundB];
    const background = [backgroundR, backgroundG, backgroundB];
    const size = styles.patternOverlay.tileSize;
    for (let y = bounds.minY; y <= bounds.maxY; y += 1)
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const i = (y * width + x) * 4;
        const tileX = ((x % size) + size) % size;
        const tileY = ((y % size) + size) % size;
        const third = Math.max(1, Math.floor(size / 3));
        const half = Math.max(1, Math.floor(size / 2));
        const useForeground = styles.patternOverlay.pattern === 'checker'
          ? (Math.floor(tileX / half) + Math.floor(tileY / half)) % 2 === 0
          : styles.patternOverlay.pattern === 'stripes'
            ? Math.floor((tileX + tileY) / third) % 2 === 0
            : styles.patternOverlay.pattern === 'diagonal'
              ? (tileX + tileY) % size < half
              : styles.patternOverlay.pattern === 'grid'
                ? tileX < 2 || tileY < 2
                : (tileX - half) * (tileX - half) + (tileY - half) * (tileY - half) <= Math.max(1, Math.floor(size * 0.18)) ** 2;
        const pattern = useForeground ? foreground : background;
        over(output, i, pattern[0], pattern[1], pattern[2], source[i + 3] * styles.patternOverlay.opacity);
      }
  }
  return output;
}
