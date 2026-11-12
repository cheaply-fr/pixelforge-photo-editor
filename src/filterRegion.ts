/**
 * Filter regions: the selection a live filter was applied through.
 *
 * Photoshop applies a filter (Render > Clouds, a blur…) only inside the
 * active selection, and keeps that selection as the filter mask of a Smart
 * Filter. PixelForge keeps filters live, so the selection active when a
 * filter is chosen is stored with the filter as a small geometric region in
 * the layer's own pixel space: rectangle, ellipse and lasso parts become
 * polygons, normalised to the layer surface (0..1), with their selection
 * operations, feather and inversion. The renderer rasterises the region at
 * the surface size and blends the filtered pixels over the unfiltered ones
 * through it, so a filter never changes pixels outside its selection and the
 * region follows the layer when it is moved, resized or resampled.
 *
 * Colour-based selections (an alpha mask asset) have no geometry and are not
 * stored here; the caller says so instead of silently covering the layer.
 *
 * This module is pure (no DOM, no document imports) so filter workers and
 * unit tests can use it.
 */

export type FilterRegionPoint = { x: number; y: number };
export type FilterRegionOperation = 'replace' | 'add' | 'subtract' | 'intersect';
export type FilterRegionPart = {
  operation: FilterRegionOperation;
  /** Closed polygon, nonzero winding, in surface units (0..1 spans the layer). */
  points: FilterRegionPoint[];
};
export type FilterRegion = {
  parts: FilterRegionPart[];
  /** Gaussian feather sigma as a fraction of the surface width. */
  feather: number;
  inverted: boolean;
  /**
   * The canvas rectangle in surface units: a selection never reaches past the
   * canvas, so coverage is clipped to it after inversion.
   */
  clip?: FilterRegionPoint[];
};

export const MAX_FILTER_REGION_PARTS = 64;
export const MAX_FILTER_REGION_POINTS = 20_000;
/** Surface-unit bound for stored vertices (a layer may extend far past the canvas). */
const POINT_LIMIT = 64;
const OPERATIONS: readonly FilterRegionOperation[] = ['replace', 'add', 'subtract', 'intersect'];

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const validPoints = (value: unknown, min: number): value is FilterRegionPoint[] =>
  Array.isArray(value) &&
  value.length >= min &&
  value.length <= MAX_FILTER_REGION_POINTS &&
  value.every(
    (point) =>
      point && typeof point === 'object' &&
      finite(point.x) && Math.abs(point.x) <= POINT_LIMIT &&
      finite(point.y) && Math.abs(point.y) <= POINT_LIMIT,
  );

export function validFilterRegion(value: unknown): value is FilterRegion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const region = value as Partial<FilterRegion>;
  if (
    !Array.isArray(region.parts) ||
    region.parts.length < 1 ||
    region.parts.length > MAX_FILTER_REGION_PARTS ||
    !finite(region.feather) || region.feather < 0 || region.feather > 1 ||
    typeof region.inverted !== 'boolean' ||
    (region.clip !== undefined && !validPoints(region.clip, 3))
  )
    return false;
  let total = region.clip?.length ?? 0;
  for (const part of region.parts) {
    if (!part || typeof part !== 'object' || !OPERATIONS.includes(part.operation) || !validPoints(part.points, 3))
      return false;
    total += part.points.length;
  }
  return total <= MAX_FILTER_REGION_POINTS;
}

type Affine = readonly [number, number, number, number, number, number];
const apply = (m: Affine, point: FilterRegionPoint): FilterRegionPoint => ({
  x: m[0] * point.x + m[2] * point.y + m[4],
  y: m[1] * point.x + m[3] * point.y + m[5],
});
function invert(m: Affine): Affine | undefined {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return undefined;
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

/** Vertices of an ellipse inscribed in a box, about one per 2 px of arc (32–1024). */
export function ellipseRegionPoints(x: number, y: number, w: number, h: number): FilterRegionPoint[] {
  const rx = Math.abs(w) / 2, ry = Math.abs(h) / 2;
  const count = Math.max(32, Math.min(1024, Math.ceil((Math.PI * 2 * Math.max(rx, ry)) / 2)));
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return { x: x + w / 2 + rx * Math.cos(angle), y: y + h / 2 + ry * Math.sin(angle) };
  });
}

/** The geometric subset of a document selection (see document.ts `Selection`). */
export type RegionSelection = {
  shape: 'rectangle' | 'ellipse' | 'polygon';
  x: number;
  y: number;
  w: number;
  h: number;
  feather: number;
  inverted: boolean;
  points?: FilterRegionPoint[];
  parts?: Array<{
    shape: 'rectangle' | 'ellipse' | 'polygon';
    x: number;
    y: number;
    w: number;
    h: number;
    operation: FilterRegionOperation;
    points?: FilterRegionPoint[];
  }>;
  mask?: string;
  matrix?: Affine;
};

/**
 * Convert a canvas-space selection to a region of a layer surface. `layer`
 * maps surface pixels to canvas pixels (the layer matrix); `width`/`height`
 * are the surface size and `frame` the canvas size. Undefined when the
 * selection has no geometry (a colour-based mask), the layer matrix is
 * singular, or the outline is too large to store.
 */
export function filterRegionFromSelection(
  selection: RegionSelection,
  layer: Affine,
  width: number,
  height: number,
  frame: { w: number; h: number },
): FilterRegion | undefined {
  if (selection.mask || !(width > 0) || !(height > 0)) return undefined;
  const inverse = invert(layer);
  if (!inverse) return undefined;
  const selectionMatrix: Affine = selection.matrix ?? [1, 0, 0, 1, 0, 0];
  const toSurface = (point: FilterRegionPoint) => {
    const local = apply(inverse, apply(selectionMatrix, point));
    return { x: local.x / width, y: local.y / height };
  };
  const sources = selection.parts?.length
    ? selection.parts
    : [{ ...selection, operation: 'replace' as const }];
  const parts: FilterRegionPart[] = [];
  let total = 0;
  for (const source of sources) {
    const outline =
      source.shape === 'polygon' && source.points && source.points.length >= 3
        ? source.points
        : source.shape === 'ellipse'
          ? ellipseRegionPoints(source.x, source.y, source.w, source.h)
          : [
              { x: source.x, y: source.y },
              { x: source.x + source.w, y: source.y },
              { x: source.x + source.w, y: source.y + source.h },
              { x: source.x, y: source.y + source.h },
            ];
    const points = outline.map(toSurface);
    if (points.some((point) => !(Math.abs(point.x) <= POINT_LIMIT && Math.abs(point.y) <= POINT_LIMIT)))
      return undefined;
    total += points.length;
    parts.push({ operation: OPERATIONS.includes(source.operation) ? source.operation : 'add', points });
  }
  const clip = [
    { x: 0, y: 0 },
    { x: frame.w, y: 0 },
    { x: frame.w, y: frame.h },
    { x: 0, y: frame.h },
  ].map((point) => {
    const local = apply(inverse, point);
    return { x: local.x / width, y: local.y / height };
  });
  if (clip.some((point) => !(Math.abs(point.x) <= POINT_LIMIT && Math.abs(point.y) <= POINT_LIMIT)))
    return undefined;
  total += clip.length;
  if (!parts.length || parts.length > MAX_FILTER_REGION_PARTS || total > MAX_FILTER_REGION_POINTS) return undefined;
  // Feather is a canvas-space radius: scale it into surface pixels.
  const scale = Math.sqrt(
    Math.abs(selectionMatrix[0] * selectionMatrix[3] - selectionMatrix[1] * selectionMatrix[2]) /
      Math.abs(layer[0] * layer[3] - layer[1] * layer[2]),
  );
  const feather = finite(selection.feather) && selection.feather > 0 ? Math.min(1, (selection.feather * scale) / width) : 0;
  const region: FilterRegion = { parts, feather, inverted: Boolean(selection.inverted), clip };
  return validFilterRegion(region) ? region : undefined;
}

/** Sub-scanlines per pixel row for anti-aliased edges. */
const SUBSAMPLES = 4;

/** Nonzero-winding coverage (0..1) of one polygon over a width x height grid. */
function polygonCoverage(points: readonly FilterRegionPoint[], width: number, height: number): Float32Array<ArrayBuffer> {
  const coverage = new Float32Array(width * height);
  type Edge = { x0: number; y0: number; y1: number; slope: number; winding: number };
  const edges: Edge[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index], b = points[(index + 1) % points.length];
    const ax = a.x * width, ay = a.y * height, bx = b.x * width, by = b.y * height;
    if (ay === by) continue;
    const down = ay < by;
    const top = down ? { x: ax, y: ay } : { x: bx, y: by }, bottom = down ? { x: bx, y: by } : { x: ax, y: ay };
    if (bottom.y <= 0 || top.y >= height) continue;
    edges.push({
      x0: top.x,
      y0: top.y,
      y1: bottom.y,
      slope: (bottom.x - top.x) / (bottom.y - top.y),
      winding: down ? 1 : -1,
    });
  }
  edges.sort((a, b) => a.y0 - b.y0);
  let next = 0;
  let active: Edge[] = [];
  const crossings: Array<{ x: number; winding: number }> = [];
  const weight = 1 / SUBSAMPLES;
  for (let row = 0; row < height; row += 1) {
    const base = row * width;
    for (let sub = 0; sub < SUBSAMPLES; sub += 1) {
      const y = row + (sub + 0.5) / SUBSAMPLES;
      while (next < edges.length && edges[next].y0 <= y) active.push(edges[next++]);
      active = active.filter((edge) => edge.y1 > y);
      crossings.length = 0;
      for (const edge of active)
        if (edge.y0 <= y) crossings.push({ x: edge.x0 + (y - edge.y0) * edge.slope, winding: edge.winding });
      if (crossings.length < 2) continue;
      crossings.sort((a, b) => a.x - b.x);
      let winding = 0;
      for (let index = 0; index < crossings.length - 1; index += 1) {
        winding += crossings[index].winding;
        if (winding === 0) continue;
        const start = Math.max(0, crossings[index].x), end = Math.min(width, crossings[index + 1].x);
        if (end <= start) continue;
        const first = Math.floor(start), last = Math.floor(end);
        if (first === last) {
          coverage[base + first] += (end - start) * weight;
          continue;
        }
        coverage[base + first] += (first + 1 - start) * weight;
        for (let column = first + 1; column < last; column += 1) coverage[base + column] += weight;
        if (last < width) coverage[base + last] += (end - last) * weight;
      }
    }
  }
  for (let index = 0; index < coverage.length; index += 1) if (coverage[index] > 1) coverage[index] = 1;
  return coverage;
}

/** Three box passes per axis approximate a Gaussian of the given sigma. */
function featherCoverage(coverage: Float32Array<ArrayBuffer>, width: number, height: number, sigma: number): Float32Array<ArrayBuffer> {
  if (!(sigma > 0.05)) return coverage;
  const radius = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2 - 0.5));
  let current = coverage, scratch = new Float32Array(coverage.length);
  const pass = (start: number, length: number, stride: number) => {
    const span = radius * 2 + 1;
    let sum = 0;
    for (let index = -radius; index <= radius; index += 1)
      if (index >= 0 && index < length) sum += current[start + index * stride];
    for (let index = 0; index < length; index += 1) {
      scratch[start + index * stride] = sum / span;
      const leaving = index - radius, entering = index + radius + 1;
      if (leaving >= 0) sum -= current[start + leaving * stride];
      if (entering < length) sum += current[start + entering * stride];
    }
  };
  for (let round = 0; round < 3; round += 1) {
    for (let row = 0; row < height; row += 1) pass(row * width, width, 1);
    [current, scratch] = [scratch, current];
  }
  for (let round = 0; round < 3; round += 1) {
    for (let column = 0; column < width; column += 1) pass(column, height, width);
    [current, scratch] = [scratch, current];
  }
  return current;
}

/** Rasterise a region over a width x height surface as 8-bit coverage. */
export function rasterizeFilterRegion(region: FilterRegion, width: number, height: number): Uint8ClampedArray {
  let accumulated: Float32Array<ArrayBuffer> = new Float32Array(width * height);
  for (const part of region.parts) {
    const coverage = polygonCoverage(part.points, width, height);
    if (part.operation === 'replace') accumulated = coverage;
    else if (part.operation === 'add')
      for (let index = 0; index < coverage.length; index += 1)
        accumulated[index] = coverage[index] + accumulated[index] * (1 - coverage[index]);
    else if (part.operation === 'subtract')
      for (let index = 0; index < coverage.length; index += 1) accumulated[index] *= 1 - coverage[index];
    else for (let index = 0; index < coverage.length; index += 1) accumulated[index] *= coverage[index];
  }
  accumulated = featherCoverage(accumulated, width, height, region.feather * width);
  if (region.inverted) for (let index = 0; index < accumulated.length; index += 1) accumulated[index] = 1 - accumulated[index];
  if (region.clip) {
    const clip = polygonCoverage(region.clip, width, height);
    for (let index = 0; index < clip.length; index += 1) accumulated[index] *= clip[index];
  }
  const mask = new Uint8ClampedArray(width * height);
  for (let index = 0; index < mask.length; index += 1) mask[index] = Math.round(accumulated[index] * 255);
  return mask;
}

/**
 * Blend filtered RGBA over the unfiltered source through an 8-bit mask
 * (premultiplied, so a filter that fills transparent pixels, such as Clouds
 * on an empty layer, fades in cleanly at feathered edges). Neither input is
 * modified.
 */
export function blendThroughRegion(
  source: Uint8ClampedArray,
  filtered: Uint8ClampedArray,
  mask: Uint8ClampedArray,
): Uint8ClampedArray {
  if (source.length !== filtered.length || mask.length * 4 !== source.length)
    throw new Error('Filter region buffers do not match');
  const output = new Uint8ClampedArray(source.length);
  for (let pixel = 0, offset = 0; pixel < mask.length; pixel += 1, offset += 4) {
    const weight = mask[pixel];
    if (weight === 255) {
      output[offset] = filtered[offset];
      output[offset + 1] = filtered[offset + 1];
      output[offset + 2] = filtered[offset + 2];
      output[offset + 3] = filtered[offset + 3];
      continue;
    }
    if (weight === 0) {
      output[offset] = source[offset];
      output[offset + 1] = source[offset + 1];
      output[offset + 2] = source[offset + 2];
      output[offset + 3] = source[offset + 3];
      continue;
    }
    const t = weight / 255, sourceAlpha = source[offset + 3], filteredAlpha = filtered[offset + 3];
    const alpha = sourceAlpha * (1 - t) + filteredAlpha * t;
    output[offset + 3] = Math.round(alpha);
    if (alpha <= 0) continue;
    for (let channel = 0; channel < 3; channel += 1)
      output[offset + channel] = Math.round(
        (source[offset + channel] * sourceAlpha * (1 - t) + filtered[offset + channel] * filteredAlpha * t) / alpha,
      );
  }
  return output;
}

/** Short user-facing description of a region ("rectangular selection"…). */
export function describeFilterRegion(region: FilterRegion): string {
  const single = region.parts.length === 1;
  const shape = single && region.parts[0].points.length === 4 ? 'rectangular ' : '';
  return `${region.inverted ? 'inverted ' : ''}${shape}selection${region.feather > 0 ? ', feathered' : ''}`;
}
