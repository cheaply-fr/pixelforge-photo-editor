/**
 * Paint Symmetry: deterministic geometric copies of every brush dab.
 *
 * One painted dab is replicated through a small group of rigid transforms
 * about an editable centre (canvas pixels) and rotation (degrees):
 *
 * - `vertical`   mirror across a vertical axis (left ↔ right)
 * - `horizontal` mirror across a horizontal axis (top ↔ bottom)
 * - `dual`       both axes (four copies, including the 180° turn)
 * - `diagonal`   mirror across a diagonal axis running bottom-left to top-right
 * - `radial`     N rotated copies, 360°/N apart (N = 2–64)
 * - `mandala`    N rotated copies plus their mirror images (2N copies)
 *
 * The rotation turns every axis together. All angles follow the editor's
 * y-down canvas convention, so a positive angle turns clockwise on screen,
 * exactly like the brush tip Angle.
 *
 * Dynamics: each copy is the exact geometric image of the source dab *after*
 * scatter, count and size/angle/opacity jitter have been resolved, so every
 * copy shares the source dab's deterministic jitter. That keeps strokes truly
 * symmetric and repeatable; copies do not draw their own random offsets.
 * Paper-fixed modulation (texture, dual brush, bristle) is evaluated at each
 * copy's own position, as for any other dab placed there.
 *
 * This is a bounded local approximation of symmetry painting, not a claim of
 * equivalence with any other application's implementation.
 */

export const PAINT_SYMMETRY_MODES = [
  'off',
  'vertical',
  'horizontal',
  'dual',
  'diagonal',
  'radial',
  'mandala',
] as const;
export type PaintSymmetryMode = (typeof PAINT_SYMMETRY_MODES)[number];

export const PAINT_SYMMETRY_MODE_LABELS: Record<PaintSymmetryMode, string> = {
  off: 'Off',
  vertical: 'Vertical axis',
  horizontal: 'Horizontal axis',
  dual: 'Dual axis',
  diagonal: 'Diagonal',
  radial: 'Radial',
  mandala: 'Mandala',
};

export const PAINT_SYMMETRY_SEGMENTS_MIN = 2;
export const PAINT_SYMMETRY_SEGMENTS_MAX = 64;
export const PAINT_SYMMETRY_SEGMENTS_DEFAULT = 8;

export type PaintSymmetrySettings = {
  mode: PaintSymmetryMode;
  /** Radial / Mandala segment count, 2–64. */
  segments: number;
  /** Axis rotation in degrees, -180–180 (clockwise on screen). */
  rotation: number;
  /** Centre in canvas pixels; omitted means the canvas centre. */
  center?: { x: number; y: number };
  /** Show the on-canvas axes and centre handle. */
  showGuides: boolean;
};

export const DEFAULT_PAINT_SYMMETRY: PaintSymmetrySettings = Object.freeze({
  mode: 'off',
  segments: PAINT_SYMMETRY_SEGMENTS_DEFAULT,
  rotation: 0,
  showGuides: true,
}) as PaintSymmetrySettings;

/** Affine [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type SymmetryAffine = readonly [number, number, number, number, number, number];

export const IDENTITY_AFFINE: SymmetryAffine = Object.freeze([1, 0, 0, 1, 0, 0]) as unknown as SymmetryAffine;

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Wrap degrees into [-180, 180]. */
export function wrapSymmetryAngle(angle: number): number {
  if (!finite(angle)) return 0;
  let wrapped = ((((angle + 180) % 360) + 360) % 360) - 180;
  if (wrapped === -180 && angle > 0) wrapped = 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

export function normalizeSymmetrySegments(value: unknown): number {
  if (!finite(value)) return PAINT_SYMMETRY_SEGMENTS_DEFAULT;
  return Math.max(PAINT_SYMMETRY_SEGMENTS_MIN, Math.min(PAINT_SYMMETRY_SEGMENTS_MAX, Math.round(value)));
}

/** Strict validator for persisted settings (drafts reject malformed values). */
export function validPaintSymmetry(value: unknown): value is PaintSymmetrySettings {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (!PAINT_SYMMETRY_MODES.includes(candidate.mode as PaintSymmetryMode)) return false;
  if (!Number.isInteger(candidate.segments) ||
    (candidate.segments as number) < PAINT_SYMMETRY_SEGMENTS_MIN ||
    (candidate.segments as number) > PAINT_SYMMETRY_SEGMENTS_MAX) return false;
  if (!finite(candidate.rotation) || candidate.rotation < -180 || candidate.rotation > 180) return false;
  if (typeof candidate.showGuides !== 'boolean') return false;
  if (candidate.center !== undefined) {
    const center = candidate.center as Record<string, unknown> | null;
    if (!center || typeof center !== 'object' || !finite(center.x) || !finite(center.y)) return false;
    if (Math.abs(center.x) > 1_000_000 || Math.abs(center.y) > 1_000_000) return false;
  }
  return true;
}

/** Lenient normalizer: any input becomes valid settings (defaults fill gaps). */
export function normalizePaintSymmetry(value: unknown): PaintSymmetrySettings {
  const candidate = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const mode = PAINT_SYMMETRY_MODES.includes(candidate.mode as PaintSymmetryMode)
    ? (candidate.mode as PaintSymmetryMode)
    : 'off';
  const center = candidate.center as Record<string, unknown> | undefined;
  const validCenter = center && typeof center === 'object' && finite(center.x) && finite(center.y) &&
    Math.abs(center.x) <= 1_000_000 && Math.abs(center.y) <= 1_000_000;
  return {
    mode,
    segments: normalizeSymmetrySegments(candidate.segments),
    rotation: finite(candidate.rotation) ? wrapSymmetryAngle(candidate.rotation) : 0,
    ...(validCenter ? { center: { x: center.x as number, y: center.y as number } } : {}),
    showGuides: typeof candidate.showGuides === 'boolean' ? candidate.showGuides : true,
  };
}

/** Number of dabs painted per input dab (1 when off). */
export function paintSymmetryCopyCount(settings: Pick<PaintSymmetrySettings, 'mode' | 'segments'>): number {
  const segments = normalizeSymmetrySegments(settings.segments);
  switch (settings.mode) {
    case 'vertical':
    case 'horizontal':
    case 'diagonal':
      return 2;
    case 'dual':
      return 4;
    case 'radial':
      return segments;
    case 'mandala':
      return segments * 2;
    default:
      return 1;
  }
}

/** Centre clamped into the canvas; defaults to the canvas centre. */
export function resolvePaintSymmetryCenter(
  settings: Pick<PaintSymmetrySettings, 'center'>,
  width: number,
  height: number,
): { x: number; y: number } {
  const w = finite(width) && width > 0 ? width : 1,
    h = finite(height) && height > 0 ? height : 1;
  if (!settings.center) return { x: w / 2, y: h / 2 };
  return {
    x: Math.max(0, Math.min(w, settings.center.x)),
    y: Math.max(0, Math.min(h, settings.center.y)),
  };
}

/** Snap trigonometric round-off (cos 90° = 6e-17) so axis-aligned copies are exact. */
const snap = (value: number) => {
  const rounded = Math.round(value);
  const result = Math.abs(value - rounded) < 1e-12 ? rounded : value;
  return Object.is(result, -0) ? 0 : result;
};

const rotationLinear = (degrees: number): [number, number, number, number] => {
  const radians = (degrees * Math.PI) / 180,
    cos = snap(Math.cos(radians)),
    sin = snap(Math.sin(radians));
  // Clockwise on a y-down canvas: (1, 0) → (cos, sin).
  return [cos, sin, -sin, cos];
};

/** Reflection across the line through the origin at `degrees` from +x. */
const reflectionLinear = (degrees: number): [number, number, number, number] => {
  const radians = (2 * degrees * Math.PI) / 180,
    cos = snap(Math.cos(radians)),
    sin = snap(Math.sin(radians));
  return [cos, sin, sin, -cos];
};

/**
 * Linear parts (about the origin) of the symmetry group, identity first.
 * Axis angles are in degrees from +x on the y-down canvas.
 */
export function paintSymmetryLinearParts(
  settings: Pick<PaintSymmetrySettings, 'mode' | 'segments' | 'rotation'>,
): Array<[number, number, number, number]> {
  const rotation = finite(settings.rotation) ? settings.rotation : 0,
    segments = normalizeSymmetrySegments(settings.segments),
    identity: [number, number, number, number] = [1, 0, 0, 1];
  switch (settings.mode) {
    case 'vertical':
      return [identity, reflectionLinear(90 + rotation)];
    case 'horizontal':
      return [identity, reflectionLinear(rotation)];
    case 'dual':
      return [identity, reflectionLinear(90 + rotation), reflectionLinear(rotation), rotationLinear(180)];
    case 'diagonal':
      // Bottom-left → top-right on a y-down canvas is -45° from +x.
      return [identity, reflectionLinear(-45 + rotation)];
    case 'radial':
      return Array.from({ length: segments }, (_, k) => (k === 0 ? identity : rotationLinear((360 * k) / segments)));
    case 'mandala': {
      const parts: Array<[number, number, number, number]> = [];
      for (let k = 0; k < segments; k += 1) parts.push(k === 0 ? identity : rotationLinear((360 * k) / segments));
      for (let k = 0; k < segments; k += 1) parts.push(reflectionLinear(rotation + (180 * k) / segments));
      return parts;
    }
    default:
      return [identity];
  }
}

/** Canvas-space transforms about the (clamped) centre, identity first. */
export function paintSymmetryTransforms(
  settings: PaintSymmetrySettings,
  width: number,
  height: number,
): SymmetryAffine[] {
  const center = resolvePaintSymmetryCenter(settings, width, height);
  return paintSymmetryLinearParts(settings).map(([a, b, c, d], index) =>
    index === 0
      ? IDENTITY_AFFINE
      : ([a, b, c, d, center.x - (a * center.x + c * center.y), center.y - (b * center.x + d * center.y)] as const));
}

export function multiplyAffine(left: SymmetryAffine, right: SymmetryAffine): SymmetryAffine {
  // (left ∘ right)(p) = left(right(p))
  const [a1, b1, c1, d1, e1, f1] = left,
    [a2, b2, c2, d2, e2, f2] = right;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function invertAffine(matrix: SymmetryAffine): SymmetryAffine | null {
  const [a, b, c, d, e, f] = matrix,
    det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

export function applyAffine(matrix: SymmetryAffine, point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
  };
}

/** Largest stretch factor of the linear part (spectral norm). */
export function affineMaxScale(matrix: SymmetryAffine): number {
  const [a, b, c, d] = matrix,
    p = a * a + b * b,
    q = c * c + d * d,
    r = a * c + b * d,
    largest = (p + q) / 2 + Math.sqrt(((p - q) / 2) ** 2 + r * r);
  return Math.sqrt(Math.max(0, largest));
}

/**
 * Express canvas-space symmetry in a layer's local (asset) space:
 * L = M⁻¹ · T · M for the layer matrix M. Returns undefined when symmetry is
 * off or the matrix is singular, so callers keep their unchanged code path.
 */
export function paintSymmetryForLayer(
  settings: PaintSymmetrySettings,
  canvasWidth: number,
  canvasHeight: number,
  layerMatrix: SymmetryAffine,
): SymmetryAffine[] | undefined {
  if (settings.mode === 'off') return undefined;
  const inverse = invertAffine(layerMatrix);
  if (!inverse) return undefined;
  return paintSymmetryTransforms(settings, canvasWidth, canvasHeight).map((transform, index) =>
    index === 0 ? IDENTITY_AFFINE : multiplyAffine(inverse, multiplyAffine(transform, layerMatrix)));
}

export type SymmetryDab = {
  x: number;
  y: number;
  /** Tip angle in degrees (clockwise on screen). */
  angle: number;
  flipX: boolean;
  flipY: boolean;
};

/**
 * Map one resolved dab through a transform. Rotations add their angle to the
 * tip; reflections across an axis at α map the tip angle θ to 2α − θ and swap
 * the tip's handedness (its local Y flip), so oriented tips mirror correctly.
 */
export function transformSymmetryDab(matrix: SymmetryAffine, dab: SymmetryDab): SymmetryDab {
  if (matrix === IDENTITY_AFFINE) return dab;
  const point = applyAffine(matrix, dab),
    [a, b, c, d] = matrix,
    mirrored = a * d - b * c < 0,
    turn = (Math.atan2(b, a) * 180) / Math.PI;
  return {
    x: point.x,
    y: point.y,
    angle: wrapSymmetryAngle(mirrored ? turn - dab.angle : turn + dab.angle),
    flipX: dab.flipX,
    flipY: mirrored ? !dab.flipY : dab.flipY,
  };
}

/** Every copy of one dab, source first, in deterministic transform order. */
export function symmetryDabCopies(transforms: readonly SymmetryAffine[], dab: SymmetryDab): SymmetryDab[] {
  return transforms.map((matrix) => transformSymmetryDab(matrix, dab));
}

export type SymmetryGuideLine = { x1: number; y1: number; x2: number; y2: number; kind: 'axis' | 'segment' };

/**
 * Overlay geometry in canvas pixels: full mirror axes for the axis modes,
 * rays from the centre for each radial/mandala segment boundary.
 */
export function paintSymmetryGuides(
  settings: PaintSymmetrySettings,
  width: number,
  height: number,
): { center: { x: number; y: number }; lines: SymmetryGuideLine[] } {
  const center = resolvePaintSymmetryCenter(settings, width, height),
    reach = Math.max(
      Math.hypot(center.x, center.y),
      Math.hypot(width - center.x, center.y),
      Math.hypot(center.x, height - center.y),
      Math.hypot(width - center.x, height - center.y),
      1,
    ),
    rotation = finite(settings.rotation) ? settings.rotation : 0,
    segments = normalizeSymmetrySegments(settings.segments);
  const direction = (degrees: number) => {
    const radians = (degrees * Math.PI) / 180;
    return { x: snap(Math.cos(radians)), y: snap(Math.sin(radians)) };
  };
  const axis = (degrees: number): SymmetryGuideLine => {
    const unit = direction(degrees);
    return {
      x1: center.x - unit.x * reach,
      y1: center.y - unit.y * reach,
      x2: center.x + unit.x * reach,
      y2: center.y + unit.y * reach,
      kind: 'axis',
    };
  };
  const ray = (degrees: number, kind: SymmetryGuideLine['kind']): SymmetryGuideLine => {
    const unit = direction(degrees);
    return { x1: center.x, y1: center.y, x2: center.x + unit.x * reach, y2: center.y + unit.y * reach, kind };
  };
  let lines: SymmetryGuideLine[] = [];
  switch (settings.mode) {
    case 'vertical':
      lines = [axis(90 + rotation)];
      break;
    case 'horizontal':
      lines = [axis(rotation)];
      break;
    case 'dual':
      lines = [axis(90 + rotation), axis(rotation)];
      break;
    case 'diagonal':
      lines = [axis(-45 + rotation)];
      break;
    case 'radial':
      lines = Array.from({ length: segments }, (_, k) => ray(rotation + (360 * k) / segments, 'segment'));
      break;
    case 'mandala':
      // 2N wedges: every mirror axis drawn as two rays, mirrors marked as axes.
      lines = Array.from({ length: segments * 2 }, (_, k) =>
        ray(rotation + (180 * k) / segments, 'axis'));
      break;
    default:
      lines = [];
  }
  return { center, lines };
}

/** Arrow-key nudge for the centre handle: 1 px, Shift 10 px, Home recentres. */
export function nudgePaintSymmetryCenter(
  settings: PaintSymmetrySettings,
  width: number,
  height: number,
  key: string,
  shift: boolean,
): { x: number; y: number } | undefined | null {
  if (key === 'Home') return undefined;
  const step = shift ? 10 : 1,
    center = resolvePaintSymmetryCenter(settings, width, height),
    delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
  const move = delta[key];
  if (!move) return null;
  return resolvePaintSymmetryCenter({ center: { x: center.x + move[0], y: center.y + move[1] } }, width, height);
}

/**
 * Tools whose hand-drawn strokes honour Paint Symmetry. Brush, Pencil and
 * Eraser replicate resolved dabs; Mixer Brush, History Brush and Art History
 * Brush replicate their stroke points; Clone Stamp and Healing Brush
 * replicate the destination dab and map the source sample point through the
 * same transform. Spot Healing and Patch are deliberately excluded (see
 * `docs/paint-symmetry-contract.md`).
 */
export const PAINT_SYMMETRY_TOOLS = [
  'brush',
  'pencil',
  'eraser',
  'mixer-brush',
  'history-brush',
  'art-history-brush',
  'clone',
  'heal',
] as const;
export type PaintSymmetryTool = (typeof PAINT_SYMMETRY_TOOLS)[number];

export function paintSymmetryAppliesToTool(tool: string): tool is PaintSymmetryTool {
  return (PAINT_SYMMETRY_TOOLS as readonly string[]).includes(tool);
}

/** Map an offset vector through the linear part only (no translation). */
export function transformSymmetryVector(matrix: SymmetryAffine, vector: { x: number; y: number }): { x: number; y: number } {
  return { x: matrix[0] * vector.x + matrix[2] * vector.y, y: matrix[1] * vector.x + matrix[3] * vector.y };
}

/** Tip orientation of one copy: rotation adds, reflection maps θ → 2α − θ and swaps handedness. */
export function symmetryTipForTransform(
  matrix: SymmetryAffine,
  tip: { angle: number; flipX: boolean; flipY: boolean },
): { angle: number; flipX: boolean; flipY: boolean } {
  if (matrix === IDENTITY_AFFINE) return { angle: tip.angle, flipX: tip.flipX, flipY: tip.flipY };
  const copy = transformSymmetryDab(matrix, { x: 0, y: 0, ...tip });
  return { angle: copy.angle, flipX: copy.flipX, flipY: copy.flipY };
}

export type SymmetryCloneDab = SymmetryDab & { sourceX: number; sourceY: number };

/**
 * Clone Stamp / Healing Brush copies. The same transform maps the destination
 * dab and its source sample point, so each copy's source offset
 * (source − destination) is the original offset rotated or mirrored by the
 * copy's linear part: T(s) − T(d) = L·(s − d). Pixels are still copied
 * unflipped around that source point (as for any clone dab).
 */
export function symmetryCloneCopies(
  transforms: readonly SymmetryAffine[],
  dab: SymmetryDab,
  source: { x: number; y: number },
): SymmetryCloneDab[] {
  return transforms.map((matrix) => {
    const copy = transformSymmetryDab(matrix, dab),
      mapped = matrix === IDENTITY_AFFINE ? source : applyAffine(matrix, source);
    return { ...copy, sourceX: mapped.x, sourceY: mapped.y };
  });
}

/**
 * Point-list brushes (Mixer, History, Art History): one point list per copy,
 * in transform order (the identity copy first is the original list itself).
 * Extra point fields such as pressure are carried unchanged.
 */
export function symmetryStrokePointCopies<T extends { x: number; y: number }>(
  transforms: readonly SymmetryAffine[],
  points: readonly T[],
): T[][] {
  return transforms.map((matrix) =>
    matrix === IDENTITY_AFFINE
      ? [...points]
      : points.map((point) => ({ ...point, ...applyAffine(matrix, point) })));
}
