/**
 * Live gradient preview on large layers. A gradient changes every pixel it
 * may touch, so the pointer-up commit renders the full layer, but a drag
 * preview only needs to look right on screen. The preview renders the region
 * the gradient can change (the selection's bounding box, or the whole layer)
 * at a reduced scale so each frame processes at most `budget` pixels, then the
 * canvas upscales that region over the layer. Small regions render at full
 * resolution and match the commit exactly.
 */

export const GRADIENT_PREVIEW_MAX_PIXELS = 1_500_000;

export type PreviewRect = { x: number; y: number; width: number; height: number };

export type GradientPreviewPlan = {
  /** Layer-space region the gradient can change. */
  rect: PreviewRect;
  /** Preview pixels per layer pixel (0 < scale ≤ 1). */
  scale: number;
  /** Size of the reduced preview surface. */
  width: number;
  height: number;
};

/** Bounding box of non-zero coverage, or null when the mask is empty. */
export function maskBounds(mask: Uint8ClampedArray, width: number, height: number): PreviewRect | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || mask.length !== width * height)
    throw new Error('Selection mask does not match the layer size');
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let first = -1, last = -1;
    for (let x = 0; x < width; x += 1)
      if (mask[row + x]) {
        first = x;
        break;
      }
    if (first < 0) continue;
    for (let x = width - 1; x >= first; x -= 1)
      if (mask[row + x]) {
        last = x;
        break;
      }
    if (y < minY) minY = y;
    maxY = y;
    if (first < minX) minX = first;
    if (last > maxX) maxX = last;
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Plan a preview for a `width`×`height` layer. Returns null when the plain
 * full-resolution path is already cheap (whole layer within the budget), so
 * small documents keep a preview identical to the commit.
 */
export function planGradientPreview(
  width: number,
  height: number,
  region: PreviewRect | null = null,
  budget = GRADIENT_PREVIEW_MAX_PIXELS,
): GradientPreviewPlan | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
    throw new Error('Gradient preview needs a positive layer size');
  if (!(budget > 0)) throw new Error('Gradient preview budget must be positive');
  const rect = region
    ? clampRect(region, width, height)
    : { x: 0, y: 0, width, height };
  if (!rect) return { rect: { x: 0, y: 0, width: 0, height: 0 }, scale: 1, width: 0, height: 0 };
  const whole = rect.x === 0 && rect.y === 0 && rect.width === width && rect.height === height;
  const area = rect.width * rect.height;
  if (whole && area <= budget) return null;
  const scale = Math.min(1, Math.sqrt(budget / area));
  return {
    rect,
    scale,
    width: Math.max(1, Math.round(rect.width * scale)),
    height: Math.max(1, Math.round(rect.height * scale)),
  };
}

function clampRect(rect: PreviewRect, width: number, height: number): PreviewRect | null {
  const left = Math.max(0, Math.floor(rect.x)), top = Math.max(0, Math.floor(rect.y));
  const right = Math.min(width, Math.ceil(rect.x + rect.width)), bottom = Math.min(height, Math.ceil(rect.y + rect.height));
  return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

/** Map a layer-space point into the reduced preview surface. */
export function toPreviewPoint(plan: GradientPreviewPlan, point: { x: number; y: number }) {
  const sx = plan.width / plan.rect.width, sy = plan.height / plan.rect.height;
  return { x: (point.x - plan.rect.x) * sx, y: (point.y - plan.rect.y) * sy };
}

/**
 * Nearest-sample the layer-space selection mask into the preview surface
 * (pixel centres), so the preview confines the gradient like the commit.
 */
export function downscaleMask(
  mask: Uint8ClampedArray,
  layerWidth: number,
  plan: GradientPreviewPlan,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(plan.width * plan.height);
  const sx = plan.rect.width / plan.width, sy = plan.rect.height / plan.height;
  for (let y = 0; y < plan.height; y += 1) {
    const sourceY = plan.rect.y + Math.min(plan.rect.height - 1, Math.floor((y + 0.5) * sy));
    for (let x = 0; x < plan.width; x += 1) {
      const sourceX = plan.rect.x + Math.min(plan.rect.width - 1, Math.floor((x + 0.5) * sx));
      out[y * plan.width + x] = mask[sourceY * layerWidth + sourceX];
    }
  }
  return out;
}
