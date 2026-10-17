import { validPatternId, type PatternId } from './patternStamp.ts';

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
};

export type InnerShadowStyle = {
  enabled: boolean;
  color: string;
  opacity: number;
  offsetX: number;
  offsetY: number;
  blur: number;
  distance: number;
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

export type LayerStyles = {
  dropShadow: DropShadowStyle;
  innerShadow: InnerShadowStyle;
  bevelEmboss: BevelEmbossStyle;
  outline: OutlineStyle;
  colorOverlay: ColorOverlayStyle;
  gradientOverlay: GradientOverlayStyle;
  patternOverlay: PatternOverlayStyle;
};

export const neutralLayerStyles: LayerStyles = {
  dropShadow: {
    enabled: false,
    color: '#000000',
    opacity: 0.5,
    offsetX: 8,
    offsetY: 8,
    blur: 12,
  },
  innerShadow: {
    enabled: false,
    color: '#000000',
    opacity: 0.5,
    offsetX: 4,
    offsetY: 4,
    blur: 8,
    distance: 4,
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
};

const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

const hex = (value: unknown): value is string =>
  typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value);

export function effectiveLayerStyles(value: Partial<LayerStyles> | undefined): LayerStyles {
  const shadow = value?.dropShadow;
  const innerShadow = value?.innerShadow;
  const bevelEmboss = value?.bevelEmboss;
  const outline = value?.outline;
  const colorOverlay = value?.colorOverlay;
  const gradientOverlay = value?.gradientOverlay;
  const patternOverlay = value?.patternOverlay;
  return {
    dropShadow: {
      ...neutralLayerStyles.dropShadow,
      ...shadow,
      color: hex(shadow?.color) ? shadow!.color : neutralLayerStyles.dropShadow.color,
      opacity: finite(shadow?.opacity, 0, 1)
        ? shadow!.opacity
        : neutralLayerStyles.dropShadow.opacity,
      offsetX: finite(shadow?.offsetX, -256, 256)
        ? shadow!.offsetX
        : neutralLayerStyles.dropShadow.offsetX,
      offsetY: finite(shadow?.offsetY, -256, 256)
        ? shadow!.offsetY
        : neutralLayerStyles.dropShadow.offsetY,
      blur: finite(shadow?.blur, 0, 64)
        ? shadow!.blur
        : neutralLayerStyles.dropShadow.blur,
      enabled: typeof shadow?.enabled === 'boolean'
        ? shadow.enabled
        : neutralLayerStyles.dropShadow.enabled,
    },
    innerShadow: {
      ...neutralLayerStyles.innerShadow,
      ...innerShadow,
      color: hex(innerShadow?.color) ? innerShadow!.color : neutralLayerStyles.innerShadow.color,
      opacity: finite(innerShadow?.opacity, 0, 1)
        ? innerShadow!.opacity
        : neutralLayerStyles.innerShadow.opacity,
      offsetX: finite(innerShadow?.offsetX, -256, 256)
        ? innerShadow!.offsetX
        : neutralLayerStyles.innerShadow.offsetX,
      offsetY: finite(innerShadow?.offsetY, -256, 256)
        ? innerShadow!.offsetY
        : neutralLayerStyles.innerShadow.offsetY,
      blur: finite(innerShadow?.blur, 0, 64)
        ? innerShadow!.blur
        : neutralLayerStyles.innerShadow.blur,
      distance: finite(innerShadow?.distance, 1, 32)
        ? innerShadow!.distance
        : neutralLayerStyles.innerShadow.distance,
      enabled: typeof innerShadow?.enabled === 'boolean'
        ? innerShadow.enabled
        : neutralLayerStyles.innerShadow.enabled,
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
      finite(shadow.offsetX, -256, 256) &&
      finite(shadow.offsetY, -256, 256) &&
      finite(shadow.blur, 0, 64) &&
      (innerShadow === undefined || (
        innerShadow &&
        typeof innerShadow === 'object' &&
        typeof innerShadow.enabled === 'boolean' &&
        hex(innerShadow.color) &&
        finite(innerShadow.opacity, 0, 1) &&
        finite(innerShadow.offsetX, -256, 256) &&
        finite(innerShadow.offsetY, -256, 256) &&
        finite(innerShadow.blur, 0, 64) &&
        finite(innerShadow.distance, 1, 32)
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
      )),
  );
}

export function isNeutralLayerStyles(value: Partial<LayerStyles> | undefined): boolean {
  const styles = effectiveLayerStyles(value);
  return !styles.dropShadow.enabled && !styles.innerShadow.enabled && !styles.bevelEmboss.enabled && !styles.outline.enabled &&
    !styles.colorOverlay.enabled && !styles.gradientOverlay.enabled && !styles.patternOverlay.enabled;
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
 * Apply the editable style stack to RGBA pixels without mutating the source.
 * This pure function is shared by the main thread and the render worker.
 */
export function applyLayerStylesPixels(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  value: Partial<LayerStyles> | undefined,
): Uint8ClampedArray {
  const styles = effectiveLayerStyles(value);
  if (isNeutralLayerStyles(styles) || width <= 0 || height <= 0) return source.slice();
  // Start from a detached source copy so transparent pixels retain their
  // hidden RGB bytes even when a style only touches painted bounds.
  const output = source.slice(), alpha = new Uint8ClampedArray(width * height);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = source[i * 4 + 3];
  const bounds = alphaBounds(source, width, height);
  if (!bounds) return source.slice();
  if (styles.dropShadow.enabled) {
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
    const shadowAlpha = blurAlpha(crop, sourceWidth, sourceHeight, radius);
    const [r, g, b] = color(styles.dropShadow.color);
    const offsetX = Math.round(styles.dropShadow.offsetX), offsetY = Math.round(styles.dropShadow.offsetY);
    for (let y = 0; y < sourceHeight; y += 1)
      for (let x = 0; x < sourceWidth; x += 1) {
        const dx = sourceX + x + offsetX, dy = sourceY + y + offsetY;
        if (dx >= 0 && dx < width && dy >= 0 && dy < height)
          over(output, (dy * width + dx) * 4, r, g, b, shadowAlpha[y * sourceWidth + x] * styles.dropShadow.opacity);
      }
  }
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
  if (styles.innerShadow.enabled) {
    const distance = Math.round(styles.innerShadow.distance);
    const blur = Math.round(styles.innerShadow.blur);
    const padding = distance + blur + Math.max(
      Math.abs(Math.round(styles.innerShadow.offsetX)),
      Math.abs(Math.round(styles.innerShadow.offsetY)),
    );
    const sourceX = Math.max(0, bounds.minX - padding);
    const sourceY = Math.max(0, bounds.minY - padding);
    const sourceRight = Math.min(width - 1, bounds.maxX + padding);
    const sourceBottom = Math.min(height - 1, bounds.maxY + padding);
    const sourceWidth = sourceRight - sourceX + 1;
    const sourceHeight = sourceBottom - sourceY + 1;
    const edge = new Uint8ClampedArray(sourceWidth * sourceHeight);
    for (let y = 0; y < sourceHeight; y += 1)
      for (let x = 0; x < sourceWidth; x += 1) {
        const gx = sourceX + x, gy = sourceY + y;
        const own = alpha[gy * width + gx];
        if (own === 0) continue;
        let minimum = 255;
        for (let oy = -distance; oy <= distance; oy += 1)
          for (let ox = -distance; ox <= distance; ox += 1) {
            const nx = gx + ox, ny = gy + oy;
            const neighbour = nx >= 0 && nx < width && ny >= 0 && ny < height
              ? alpha[ny * width + nx]
              : 0;
            minimum = Math.min(minimum, neighbour);
          }
        edge[y * sourceWidth + x] = Math.max(0, own - minimum);
      }
    const softened = blurAlpha(edge, sourceWidth, sourceHeight, blur);
    const [r, g, b] = color(styles.innerShadow.color);
    const offsetX = Math.round(styles.innerShadow.offsetX);
    const offsetY = Math.round(styles.innerShadow.offsetY);
    for (let y = bounds.minY; y <= bounds.maxY; y += 1)
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const destination = (y * width + x) * 4;
        if (source[destination + 3] === 0) continue;
        const sx = x - offsetX - sourceX;
        const sy = y - offsetY - sourceY;
        if (sx < 0 || sx >= sourceWidth || sy < 0 || sy >= sourceHeight) continue;
        const amount = softened[sy * sourceWidth + sx] *
          (source[destination + 3] / 255) * styles.innerShadow.opacity;
        over(output, destination, r, g, b, amount);
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
