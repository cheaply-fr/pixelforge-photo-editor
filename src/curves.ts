/**
 * Nondestructive RGB curves. Curves are stored as small, sorted point lists
 * rather than a baked lookup table so the document can remain editable and
 * migrate the representation in the future.
 */

export const CURVE_CHANNELS = ['rgb', 'red', 'green', 'blue'] as const;
export type CurveChannel = (typeof CURVE_CHANNELS)[number];
export type CurvePoint = readonly [number, number];
export type CurvePoints = readonly CurvePoint[];
/**
 * How the control points are joined. `monotone` is a Fritsch-Carlson monotone
 * cubic that never overshoots between neighbouring points; `linear` is the
 * original piecewise-linear response, retained so curves saved before smooth
 * interpolation existed keep rendering identically.
 */
export const CURVE_INTERPOLATIONS = ['linear', 'monotone'] as const;
export type CurveInterpolation = (typeof CURVE_INTERPOLATIONS)[number];
export type Curves = Record<CurveChannel, CurvePoints> & {
  interpolation?: CurveInterpolation;
};

/** Stored point lists may hold up to 33 points (legacy documents). */
export const MAX_STORED_CURVE_POINTS = 33;
/** The editor adds at most 14 interior points plus the two endpoints. */
export const MAX_CURVE_POINTS = 16;
export const MAX_INTERIOR_CURVE_POINTS = MAX_CURVE_POINTS - 2;

export const identityCurve: CurvePoints = [
  [0, 0],
  [255, 255],
];

export const neutralCurves: Curves = {
  rgb: identityCurve,
  red: identityCurve,
  green: identityCurve,
  blue: identityCurve,
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function point(value: unknown): CurvePoint | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const x = Number(value[0]),
    y = Number(value[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [clamp(Math.round(x), 0, 255), clamp(Math.round(y), 0, 255)];
}

/** Normalize points into a deterministic bounded curve with endpoint anchors. */
export function normalizeCurvePoints(value: unknown): CurvePoints {
  const source = Array.isArray(value) ? value : [];
  const sorted = source
    .map(point)
    .filter((item): item is CurvePoint => !!item)
    .sort((a, b) => a[0] - b[0]);
  const deduped: CurvePoint[] = [];
  for (const item of sorted) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous[0] === item[0]) deduped[deduped.length - 1] = item;
    else deduped.push(item);
  }
  if (!deduped.length) return identityCurve;
  if (!deduped.length || deduped[0][0] !== 0) {
    deduped.unshift([0, deduped[0]?.[1] ?? 0]);
  } else {
    deduped[0] = [0, deduped[0][1]];
  }
  const last = deduped[deduped.length - 1];
  if (last[0] !== 255) deduped.push([255, last[1]]);
  else deduped[deduped.length - 1] = [255, last[1]];
  return deduped.length <= MAX_STORED_CURVE_POINTS
    ? deduped
    : [
        deduped[0],
        ...deduped.slice(1, MAX_STORED_CURVE_POINTS - 1),
        deduped[deduped.length - 1],
      ];
}

/**
 * Resolve the interpolation of a stored curves record. An explicit value wins.
 * Records without one predate smooth curves: if any channel already has an
 * interior point it was authored (and rendered) piecewise-linear, so it stays
 * linear; endpoint-only records are straight lines either way and adopt the
 * smooth default for new edits.
 */
export function curveInterpolation(
  value: Partial<Curves> | undefined,
): CurveInterpolation {
  if (
    value?.interpolation &&
    CURVE_INTERPOLATIONS.includes(value.interpolation)
  )
    return value.interpolation;
  if (!value) return 'monotone';
  return CURVE_CHANNELS.some(
    (channel) =>
      normalizeCurvePoints(value[channel] ?? identityCurve).length > 2,
  )
    ? 'linear'
    : 'monotone';
}

export function effectiveCurves(value: Partial<Curves> | undefined): Curves {
  return {
    rgb: normalizeCurvePoints(value?.rgb ?? identityCurve),
    red: normalizeCurvePoints(value?.red ?? identityCurve),
    green: normalizeCurvePoints(value?.green ?? identityCurve),
    blue: normalizeCurvePoints(value?.blue ?? identityCurve),
    // Only an explicit choice is stored; records without one resolve through
    // curveInterpolation() so reopening a document never rewrites it.
    ...(value?.interpolation && CURVE_INTERPOLATIONS.includes(value.interpolation)
      ? { interpolation: value.interpolation }
      : {}),
  };
}

export function validCurvePoints(value: unknown): value is CurvePoints {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    value.length > MAX_STORED_CURVE_POINTS
  )
    return false;
  let previous = -1;
  for (const item of value) {
    if (!Array.isArray(item) || item.length !== 2) return false;
    const x = item[0],
      y = item[1];
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      x > 255 ||
      y < 0 ||
      y > 255 ||
      x <= previous
    )
      return false;
    previous = x;
  }
  return value[0][0] === 0 && value[value.length - 1][0] === 255;
}

export function validCurves(value: unknown): value is Curves {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<Curves>;
  return (
    (candidate.interpolation === undefined ||
      CURVE_INTERPOLATIONS.includes(candidate.interpolation)) &&
    CURVE_CHANNELS.every((channel) => validCurvePoints(candidate[channel]))
  );
}

export function isNeutralCurves(value: Partial<Curves> | undefined): boolean {
  const curves = effectiveCurves(value);
  return CURVE_CHANNELS.every((channel) => {
    const points = curves[channel];
    return points.length === 2 && points[0][1] === 0 && points[1][1] === 255;
  });
}

/**
 * Fritsch-Carlson tangents for a monotone cubic Hermite spline. Each tangent is
 * zero at a local extremum and limited elsewhere so every segment stays within
 * its two control values (no overshoot, no ringing).
 */
export function monotoneTangents(curve: CurvePoints): number[] {
  const count = curve.length;
  const secants: number[] = [];
  for (let index = 0; index < count - 1; index += 1)
    secants.push(
      (curve[index + 1][1] - curve[index][1]) /
        Math.max(1, curve[index + 1][0] - curve[index][0]),
    );
  const tangents = Array.from({ length: count }, () => 0);
  tangents[0] = secants[0];
  tangents[count - 1] = secants[count - 2];
  for (let index = 1; index < count - 1; index += 1) {
    const left = secants[index - 1],
      right = secants[index];
    tangents[index] = left * right <= 0 ? 0 : (left + right) / 2;
  }
  for (let index = 0; index < count - 1; index += 1) {
    const secant = secants[index];
    if (secant === 0) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }
    const alpha = tangents[index] / secant,
      beta = tangents[index + 1] / secant,
      length = Math.hypot(alpha, beta);
    if (length > 3) {
      const scale = 3 / length;
      tangents[index] = scale * alpha * secant;
      tangents[index + 1] = scale * beta * secant;
    }
  }
  return tangents;
}

/** Continuous (unrounded) curve value, used for drawing and table building. */
export function evaluateCurve(
  points: CurvePoints,
  input: number,
  interpolation: CurveInterpolation = 'linear',
): number {
  return evaluateNormalizedCurve(
    normalizeCurvePoints(points),
    input,
    interpolation,
  );
}

function evaluateNormalizedCurve(
  curve: CurvePoints,
  input: number,
  interpolation: CurveInterpolation,
  tangents?: number[],
): number {
  const x = clamp(Number.isFinite(input) ? input : 0, 0, 255);
  if (x <= curve[0][0]) return curve[0][1];
  for (let index = 1; index < curve.length; index += 1) {
    const right = curve[index],
      left = curve[index - 1];
    if (x <= right[0]) {
      const span = Math.max(1, right[0] - left[0]);
      const ratio = (x - left[0]) / span;
      // Two-point curves are straight lines under either interpolation; the
      // linear path keeps their rounding bit-identical to legacy output.
      if (interpolation === 'linear' || curve.length === 2)
        return left[1] + (right[1] - left[1]) * ratio;
      const slopes = tangents ?? monotoneTangents(curve);
      const t2 = ratio * ratio,
        t3 = t2 * ratio;
      const value =
        (2 * t3 - 3 * t2 + 1) * left[1] +
        (t3 - 2 * t2 + ratio) * span * slopes[index - 1] +
        (-2 * t3 + 3 * t2) * right[1] +
        (t3 - t2) * span * slopes[index];
      // Keep float error from stepping outside the segment's value range.
      return clamp(
        value,
        Math.min(left[1], right[1]),
        Math.max(left[1], right[1]),
      );
    }
  }
  return curve[curve.length - 1][1];
}

/** Sample a curve to an 8-bit output (linear unless `interpolation` is given). */
export function sampleCurve(
  points: CurvePoints,
  input: number,
  interpolation: CurveInterpolation = 'linear',
): number {
  return clamp(Math.round(evaluateCurve(points, input, interpolation)), 0, 255);
}

/** Build the 256-entry lookup table for one channel curve. */
export function curveTable(
  points: CurvePoints,
  interpolation: CurveInterpolation = 'linear',
): Uint8Array {
  const curve = normalizeCurvePoints(points),
    tangents =
      interpolation === 'monotone' && curve.length > 2
        ? monotoneTangents(curve)
        : undefined,
    table = new Uint8Array(256);
  for (let input = 0; input < 256; input += 1)
    table[input] = clamp(
      Math.round(
        evaluateNormalizedCurve(curve, input, interpolation, tangents),
      ),
      0,
      255,
    );
  return table;
}

/** Compile once per render; pixel loops only need three bounded table lookups. */
export function compileCurves(
  curves: Partial<Curves> | undefined,
): Uint8Array[] {
  const value = effectiveCurves(curves),
    interpolation = curveInterpolation(curves),
    composite = curveTable(value.rgb, interpolation);
  return (['red', 'green', 'blue'] as const).map((channel) => {
    const channelTable = curveTable(value[channel], interpolation),
      table = new Uint8Array(256);
    for (let input = 0; input < 256; input += 1)
      table[input] = channelTable[composite[input]];
    return table;
  });
}

export function curvesPixel(
  red: number,
  green: number,
  blue: number,
  curves: Partial<Curves> | undefined,
): [number, number, number] {
  const tables = compileCurves(curves),
    index = (value: number) =>
      clamp(Math.round(Number.isFinite(value) ? value : 0), 0, 255);
  return [
    tables[0][index(red)],
    tables[1][index(green)],
    tables[2][index(blue)],
  ];
}

/** Apply curves in-place, preserving alpha and transparent RGB data. */
export function applyCurvesPixels(
  data: Uint8ClampedArray,
  curves: Partial<Curves> | undefined,
): Uint8ClampedArray {
  if (isNeutralCurves(curves)) return data;
  const tables = compileCurves(curves);
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    data[index] = tables[0][data[index]];
    data[index + 1] = tables[1][data[index + 1]];
    data[index + 2] = tables[2][data[index + 2]];
  }
  return data;
}

export function setCurvePoint(
  points: CurvePoints,
  x: number,
  y: number,
): CurvePoints {
  if (!Number.isFinite(x) || !Number.isFinite(y))
    return normalizeCurvePoints(points);
  const inputX = clamp(Math.round(x), 0, 255),
    inputY = clamp(Math.round(y), 0, 255),
    normalized = normalizeCurvePoints(points),
    existing = normalized.findIndex(([pointX]) => pointX === inputX);
  if (existing === 0 || existing === normalized.length - 1)
    return normalized.map((item, index) =>
      index === existing ? [item[0], inputY] : item,
    );
  if (existing >= 0)
    return normalized.map((item, index) =>
      index === existing ? [inputX, inputY] : item,
    );
  return normalizeCurvePoints([...normalized, [inputX, inputY]]);
}

/** Move one point without leaving a trail; endpoint input anchors stay fixed. */
export function moveCurvePoint(
  points: CurvePoints,
  sourceX: number,
  x: number,
  y: number,
): CurvePoints {
  const normalized = normalizeCurvePoints(points);
  if (![sourceX, x, y].every(Number.isFinite)) return normalized;
  const source = Math.round(sourceX);
  if (!normalized.some(([pointX]) => pointX === source)) return normalized;
  if (source === 0 || source === 255)
    return setCurvePoint(normalized, source, y);
  const destination = clamp(Math.round(x), 1, 254);
  return setCurvePoint(removeCurvePoint(normalized, source), destination, y);
}

export function removeCurvePoint(points: CurvePoints, x: number): CurvePoints {
  const normalized = normalizeCurvePoints(points),
    inputX = clamp(Math.round(x), 0, 255);
  if (inputX === 0 || inputX === 255) return normalized;
  return normalizeCurvePoints(
    normalized.filter(([pointX]) => pointX !== inputX),
  );
}

/** Index of the control point nearest to (x, y) within `radius` curve units. */
export function nearestCurvePointIndex(
  points: CurvePoints,
  x: number,
  y: number,
  radius: number,
): number {
  let best = -1,
    bestDistance = Infinity;
  points.forEach(([pointX, pointY], index) => {
    const distance = Math.hypot(pointX - x, pointY - y);
    if (distance <= radius && distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/**
 * Insert an interior control point. Returns null when the curve already has
 * the editable maximum, the input is outside 1-254, or a point already sits
 * at that input level.
 */
export function addCurvePoint(
  points: CurvePoints,
  x: number,
  y: number,
): { points: CurvePoints; index: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const curve = normalizeCurvePoints(points),
    inputX = Math.round(x),
    inputY = clamp(Math.round(y), 0, 255);
  if (inputX < 1 || inputX > 254 || curve.length >= MAX_CURVE_POINTS)
    return null;
  if (curve.some(([pointX]) => pointX === inputX)) return null;
  const index = curve.findIndex(([pointX]) => pointX > inputX);
  const next = [...curve];
  next.splice(index, 0, [inputX, inputY]);
  return { points: next, index };
}

/**
 * Move the point at `index`. Endpoints keep their 0/255 input and only change
 * output; interior inputs are clamped strictly between their neighbours so the
 * order (and therefore point identity) never changes during a drag.
 */
export function moveCurvePointAt(
  points: CurvePoints,
  index: number,
  x: number,
  y: number,
): CurvePoints {
  const curve = normalizeCurvePoints(points);
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= curve.length ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  )
    return curve;
  const outputY = clamp(Math.round(y), 0, 255);
  const inputX =
    index === 0
      ? 0
      : index === curve.length - 1
        ? 255
        : clamp(
            Math.round(x),
            curve[index - 1][0] + 1,
            curve[index + 1][0] - 1,
          );
  if (curve[index][0] === inputX && curve[index][1] === outputY) return curve;
  return curve.map((item, position) =>
    position === index ? ([inputX, outputY] as const) : item,
  );
}

/** Remove the interior point at `index`; endpoints are mandatory. */
export function removeCurvePointAt(
  points: CurvePoints,
  index: number,
): CurvePoints {
  const curve = normalizeCurvePoints(points);
  if (!Number.isInteger(index) || index <= 0 || index >= curve.length - 1)
    return curve;
  return curve.filter((_, position) => position !== index);
}

/** True when `value` is a valid point list within the editor's 16-point cap. */
export function editableCurvePoints(value: unknown): value is CurvePoints {
  return (
    validCurvePoints(value) &&
    (value as CurvePoints).length <= MAX_CURVE_POINTS
  );
}
