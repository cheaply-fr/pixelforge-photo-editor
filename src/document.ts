import { rotateHuePixels } from './hue.ts';
import {
  applyColorBalancePixels,
  effectiveColorBalance,
  isNeutralColorBalance,
  neutralColorBalance,
  validColorBalance,
  type ColorBalance,
} from './colorBalance.ts';
import {
  applySharpenNoisePixels,
  effectiveSharpenNoise,
  isNeutralSharpenNoise,
  neutralSharpenNoise,
  validSharpenNoise,
  type SharpenNoise,
} from './sharpenNoise.ts';
import type { SavedSelectionBook } from './savedSelections.ts';
import {
  parseSavedSelections,
  referencedSelectionMasks,
} from './savedSelections.ts';
import {
  applyCurvesPixels,
  effectiveCurves,
  isNeutralCurves,
  neutralCurves,
  validCurves,
  type Curves,
} from './curves.ts';
import {
  applyAutoAdjustmentsPixels,
  effectiveAutoAdjustments,
  isNeutralAuto,
  neutralAuto,
  validAutoAdjustments,
  type AutoAdjustments,
} from './auto.ts';
import {
  effectiveImageSize,
  validImageSizeMetadata,
  type ImageSizeMetadata,
  type ResampleMethod,
} from './imageSize.ts';
import { validatePath, type PathModel } from './paths.ts';
import { applyLayerMaskPixels, effectiveLayerMask } from './masks.ts';
import {
  shapePoints,
  validateShapeVariant,
  type ParametricShapeVariant,
} from './vectorShapes.ts';
import {
  validMeasurements,
  type MeasurementAnnotation,
} from './measurements.ts';
import {
  applyFilterEffects,
  effectiveFilterEffects,
  isNeutralFilterEffects,
  neutralFilterEffects,
  validFilterEffects,
  type FilterEffects,
} from './filterEffects.ts';
import {
  transformArtboard,
  validArtboards,
  type Artboard,
} from './artboards.ts';
import {
  applyPhotoAdjustments,
  effectivePhotoAdjustments,
  isNeutralPhotoAdjustments,
  neutralPhotoAdjustments,
  validPhotoAdjustments,
  type PhotoAdjustments,
} from './photoAdjustments.ts';
import {
  validSpotHealingStrokes,
  applySpotHealingStrokes,
  type SpotHealingStroke,
} from './spotHealing.ts';

/** Version 2 stores immutable raster assets once; history contains editable layer metadata. */
export const BLENDS = [
  'source-over',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'difference',
] as const;
export const FONTS = ['Arial', 'Georgia', 'Courier New', 'Verdana'] as const;
export const TEXT_ALIGNS = ['left', 'center', 'right'] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];
/** Canvas text flow modes. Older drafts omit orientation and remain horizontal. */
export const TEXT_ORIENTATIONS = ['horizontal', 'vertical'] as const;
export type TextOrientation = (typeof TEXT_ORIENTATIONS)[number];
export type Matrix = [number, number, number, number, number, number];
export type Adjustments = {
  brightness: number;
  contrast: number;
  saturation: number;
  /** HSL hue rotation in degrees. Zero leaves source colours unchanged. */
  hue: number;
  blur: number;
  filter: string;
  /** Input black point for a nondestructive levels correction (0-254). */
  levelsBlack: number;
  /** Input white point for a nondestructive levels correction (1-255). */
  levelsWhite: number;
  /** Midtone gamma for a nondestructive levels correction (0.1-3). */
  levelsGamma: number;
  /** Tonal color-balance channels, retained as editable metadata. */
  colorBalance: ColorBalance;
  /** Nondestructive unsharp-mask and deterministic noise controls. */
  sharpenNoise: SharpenNoise;
  /** Editable composite and per-channel curves, retained as control points. */
  curves: Curves;
  /** Nondestructive deterministic one-click tonal corrections. */
  auto: AutoAdjustments;
  /** Nondestructive local Filter menu effect parameters. */
  filterEffects: FilterEffects;
  /** Nondestructive photographic finishing controls. */
  photoAdjustments: PhotoAdjustments;
};
export const neutral: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  blur: 0,
  filter: 'none',
  levelsBlack: 0,
  levelsWhite: 255,
  levelsGamma: 1,
  colorBalance: { ...neutralColorBalance },
  sharpenNoise: { ...neutralSharpenNoise },
  curves: {
    rgb: neutralCurves.rgb,
    red: neutralCurves.red,
    green: neutralCurves.green,
    blue: neutralCurves.blue,
  },
  auto: { ...neutralAuto },
  filterEffects: { ...neutralFilterEffects },
  photoAdjustments: { ...neutralPhotoAdjustments },
};
export const FILTER_VALUES = [
  'none',
  'saturate(1.45) contrast(1.08)',
  'grayscale(1) contrast(1.12)',
  'sepia(.35) saturate(1.2)',
  'hue-rotate(18deg) saturate(.9)',
];
type Common = {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: (typeof BLENDS)[number];
  matrix: Matrix;
  adjustments: Adjustments;
  /** Optional canvas-space alpha mask asset. Source pixels remain untouched. */
  mask?: string;
  /** Persisted non-destructive mask controls; omitted in legacy drafts. */
  maskEnabled?: boolean;
  maskInverted?: boolean;
  /** Optional editable folder membership. Groups are metadata; source pixels stay local to the layer. */
  groupId?: string;
  /** Optional nondestructive local object-cleanup strokes. */
  spotHealing?: SpotHealingStroke[];
};
export type Layer = Common &
  (
    | { kind: 'raster'; asset: string }
    | {
        kind: 'text';
        text: string;
        color: string;
        fontSize: number;
        fontFamily: (typeof FONTS)[number];
        bold: boolean;
        /** Width of the editable text box used for alignment. */
        boxWidth: number;
        textAlign: TextAlign;
        /** Multiplier applied to font size between baselines. */
        lineHeight: number;
        /** Extra advance in pixels between glyphs. */
        letterSpacing: number;
        /** Text flow direction; omitted legacy values normalize to horizontal. */
        orientation: TextOrientation;
      }
    | {
        kind: 'rectangle';
        width: number;
        height: number;
        color: string;
        stroke: number;
        fill: boolean;
      }
    | {
        kind: 'ellipse';
        width: number;
        height: number;
        color: string;
        stroke: number;
        fill: boolean;
      }
    | {
        /** A parametric segment from the layer origin to width/height. */
        kind: 'line';
        width: number;
        height: number;
        color: string;
        stroke: number;
      }
    | {
        /** A parametric polygon, triangle or star inscribed in the layer box. */
        kind: 'polygon';
        width: number;
        height: number;
        color: string;
        stroke: number;
        fill: boolean;
        sides: number;
        /** Legacy drafts omit this and render as a regular polygon. */
        variant?: ParametricShapeVariant;
      }
    | {
        /** A local-coordinate, straight-segment Pen path. */
        kind: 'path';
        path: PathModel;
      }
  );
/** A persisted, editable layer folder. Layers keep their own order in Frame.layers. */
export type Group = {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: (typeof BLENDS)[number];
  /** UI-only state persisted with the draft so a reopened project keeps its workspace. */
  collapsed: boolean;
};
export type SelectionOperation = 'replace' | 'add' | 'subtract' | 'intersect';
export type SelectionPart = {
  shape: 'rectangle' | 'ellipse' | 'polygon';
  x: number;
  y: number;
  w: number;
  h: number;
  operation: SelectionOperation;
  points?: { x: number; y: number }[];
};
export type Selection = {
  shape: SelectionPart['shape'];
  x: number;
  y: number;
  w: number;
  h: number;
  feather: number;
  inverted: boolean;
  points?: { x: number; y: number }[];
  parts?: SelectionPart[];
  /** Canvas-sized alpha asset for a color-based selection. */
  mask?: string;
  /** Optional affine transform applied nondestructively at render time. */
  matrix?: Matrix;
};
export type Frame = {
  w: number;
  h: number;
  /** Optional print-size metadata; omitted in legacy drafts and defaults to 72 ppi. */
  imageSize?: ImageSizeMetadata;
  layers: Layer[];
  active: string;
  /** Optional for backwards compatibility with v2 drafts created before folders. */
  groups?: Group[];
  selection?: Selection;
  /** Last committed selection, retained so Select > Reselect can restore it. */
  previousSelection?: Selection;
  /** Named selection snapshots retained with the document history. */
  savedSelections?: SavedSelectionBook;
  /** Persisted Quick Mask alpha asset while the mode is active. */
  quickMask?: { asset: string; active: boolean };
  /** Workspace-only sampling, ruler, note and count overlays. */
  measurements?: MeasurementAnnotation[];
  /** Bounded named viewports; artboards do not duplicate or flatten assets. */
  artboards?: Artboard[];
  /** Optional active artboard pointer, validated against `artboards`. */
  activeArtboardId?: string;
};
export type Asset = { url: string; w: number; h: number };
export type Assets = Record<string, Asset>;
export const identity = (): Matrix => [1, 0, 0, 1, 0, 0];

/** Return true for a finite, non-singular affine matrix within safe bounds. */
export function validMatrix(value: unknown): value is Matrix {
  return (
    Array.isArray(value) &&
    value.length === 6 &&
    value.every((entry) => number(entry, -1000000, 1000000)) &&
    Math.abs(
      Number(value[0]) * Number(value[3]) - Number(value[1]) * Number(value[2]),
    ) >= 0.000000000001
  );
}

/** Compose an affine transform onto a selection without baking any pixels. */
export function transformSelection(
  selection: Selection,
  matrix: Matrix,
): Selection {
  if (!validMatrix(matrix)) throw new Error('Invalid selection transform');
  const combined = multiply(matrix, selection.matrix || identity());
  if (!validMatrix(combined))
    throw new Error('Selection transform exceeds safe limits');
  return {
    ...selection,
    matrix: combined,
  };
}

export type SelectionTransform = {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  skewX: number;
  skewY: number;
  flipX: boolean;
  flipY: boolean;
};

export type LayerTransformBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Parse a single locale-neutral decimal, accepting a decimal comma. */
export function selectionDecimal(value: string): number {
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value.trim())) return NaN;
  return Number(value.trim().replace(',', '.'));
}

/** Compute the transform about the current selection's geometric centre. */
export function selectionTransformMatrix(
  selection: Selection,
  values: SelectionTransform,
): Matrix {
  if (
    !number(values.offsetX, -16000, 16000) ||
    !number(values.offsetY, -16000, 16000) ||
    !number(values.scaleX, 1, 1000) ||
    !number(values.scaleY, 1, 1000) ||
    !number(values.angle, -180, 180) ||
    !number(values.skewX, -80, 80) ||
    !number(values.skewY, -80, 80) ||
    typeof values.flipX !== 'boolean' ||
    typeof values.flipY !== 'boolean'
  )
    throw new Error(
      'Choose valid transform values within the displayed limits.',
    );
  const parts = selection.parts?.length ? selection.parts : [selection],
    left = Math.min(...parts.map((part) => part.x)),
    top = Math.min(...parts.map((part) => part.y)),
    right = Math.max(...parts.map((part) => part.x + part.w)),
    bottom = Math.max(...parts.map((part) => part.y + part.h)),
    sourceX = (left + right) / 2,
    sourceY = (top + bottom) / 2,
    m = selection.matrix || identity(),
    cx = m[0] * sourceX + m[2] * sourceY + m[4],
    cy = m[1] * sourceX + m[3] * sourceY + m[5],
    angle = (values.angle * Math.PI) / 180,
    sx = (values.scaleX / 100) * (values.flipX ? -1 : 1),
    sy = (values.scaleY / 100) * (values.flipY ? -1 : 1),
    skew: Matrix = [
      1,
      Math.tan((values.skewY * Math.PI) / 180),
      Math.tan((values.skewX * Math.PI) / 180),
      1,
      0,
      0,
    ],
    rotation: Matrix = [
      Math.cos(angle),
      Math.sin(angle),
      -Math.sin(angle),
      Math.cos(angle),
      0,
      0,
    ],
    result = multiply(
      [1, 0, 0, 1, cx + values.offsetX, cy + values.offsetY],
      multiply(
        rotation,
        multiply(skew, multiply([sx, 0, 0, sy, 0, 0], [1, 0, 0, 1, -cx, -cy])),
      ),
    );
  if (!validMatrix(result))
    throw new Error(
      'This skew combination collapses the selection. Choose different angles.',
    );
  return result.map((value) => (Math.abs(value) < 1e-12 ? 0 : value)) as Matrix;
}

/**
 * Build a nondestructive transform delta for an editable layer. The caller
 * composes the returned delta with the layer's existing matrix, so source
 * assets and masks remain untouched and the operation is undoable.
 */
export function layerTransformMatrix(
  bounds: LayerTransformBounds,
  layerMatrix: Matrix,
  values: SelectionTransform,
): Matrix {
  if (
    !validMatrix(layerMatrix) ||
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    bounds.width > 16000 ||
    bounds.height > 16000
  )
    throw new Error('Layer transform bounds are invalid');
  return selectionTransformMatrix(
    {
      shape: 'rectangle',
      x: bounds.x,
      y: bounds.y,
      w: bounds.width,
      h: bounds.height,
      feather: 0,
      inverted: false,
      matrix: layerMatrix,
    },
    values,
  );
}
export const commonLayer = (name: string): Common => ({
  id: crypto.randomUUID(),
  name,
  visible: true,
  locked: false,
  opacity: 1,
  blend: 'source-over',
  matrix: identity(),
  adjustments: { ...neutral },
});
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
export const transformFrame = (
  frame: Frame,
  matrix: Matrix,
  w = frame.w,
  h = frame.h,
): Frame => {
  const artboards = frame.artboards?.flatMap((artboard) => {
    try {
      return [transformArtboard(artboard, matrix, w, h)];
    } catch {
      // A crop may remove a named viewport completely. Dropping that metadata
      // is safer than retaining an invalid pointer or changing pixel assets.
      return [];
    }
  });
  const activeArtboardId =
    frame.activeArtboardId && artboards?.some((item) => item.id === frame.activeArtboardId)
      ? frame.activeArtboardId
      : artboards?.[0]?.id;
  return {
    ...frame,
    w,
    h,
    imageSize: effectiveImageSize(frame.imageSize),
    selection: undefined,
    previousSelection: undefined,
    // Geometric transforms change the canvas bounds. Named snapshots are
    // cleared until they can be transformed with an explicit selection contract.
    savedSelections: undefined,
    quickMask: undefined,
    layers: frame.layers.map((layer) => ({
      ...layer,
      matrix: multiply(matrix, layer.matrix),
    })),
    ...(artboards?.length
      ? { artboards, ...(activeArtboardId ? { activeArtboardId } : {}) }
      : {}),
  };
};

/**
 * Applies a document transform while also transforming canvas-space layer
 * masks. Raster source assets stay untouched; masks are regenerated at the
 * new frame dimensions so resize/crop/rotate can never leave an invalid mask
 * reference behind.
 */
export async function transformFrameWithMasks(
  frame: Frame,
  matrix: Matrix,
  assets: Assets,
  w = frame.w,
  h = frame.h,
  resampleMethod: ResampleMethod = 'automatic',
): Promise<Frame> {
  const next = transformFrame(frame, matrix, w, h);
  const layers = await Promise.all(
    next.layers.map(async (layer) => {
      if (layer.kind !== 'raster' || !layer.mask) return layer;
      const mask = assets[layer.mask];
      if (!mask) throw new Error('Layer mask asset is missing');
      const image = await decodeAsset(mask),
        transformed = surface(w, h),
        context = transformed.getContext('2d')!;
      context.imageSmoothingEnabled = resampleMethod !== 'nearest';
      context.setTransform(...matrix);
      context.drawImage(image, 0, 0);
      context.setTransform(1, 0, 0, 1, 0, 0);
      return { ...layer, mask: addAsset(assets, transformed) };
    }),
  );
  const savedSelections = frame.savedSelections && {
    version: 1 as const,
    selections: await Promise.all(
      frame.savedSelections.selections.map(async (entry) => {
        const { renderSelection } = await import('./selections.ts');
        const original = await renderSelection(
            entry.selection,
            frame.w,
            frame.h,
            assets,
          ),
          transformed = surface(w, h),
          context = transformed.getContext('2d')!;
        context.imageSmoothingEnabled = resampleMethod !== 'nearest';
        context.setTransform(...matrix);
        context.drawImage(original, 0, 0);
        return {
          id: entry.id,
          name: entry.name,
          selection: {
            shape: 'rectangle' as const,
            x: 0,
            y: 0,
            w,
            h,
            feather: 0,
            inverted: false,
            mask: addAsset(assets, transformed),
          },
        };
      }),
    ),
  };
  return { ...next, layers, ...(savedSelections ? { savedSelections } : {}) };
}

/** Map a frame-space pointer into a raster layer's untransformed asset space. */
export function inversePoint(
  matrix: Matrix,
  point: { x: number; y: number },
): { x: number; y: number } | null {
  const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2];
  if (Math.abs(determinant) < 0.000000000001) return null;
  const dx = point.x - matrix[4],
    dy = point.y - matrix[5];
  return {
    x: (matrix[3] * dx - matrix[2] * dy) / determinant,
    y: (-matrix[1] * dx + matrix[0] * dy) / determinant,
  };
}

/** Convert a display-space diameter to a conservative local-space diameter. */
export function localSize(matrix: Matrix, diameter: number): number {
  const determinant = Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]);
  return Math.max(0.25, diameter / Math.max(0.0001, Math.sqrt(determinant)));
}
export const filterCSS = (a: Adjustments) =>
  `${a.filter === 'none' ? '' : a.filter} brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturation}%) blur(${a.blur}px)`;

/** Fill in adjustment fields introduced after the v2 document format.
 *
 * Older v2 drafts did not contain levels values. Keeping this helper at the
 * rendering boundary lets those documents open safely while every new edit
 * writes the complete adjustment model back to history.
 */
export function effectiveAdjustments(value: Partial<Adjustments>): Adjustments {
  return {
    ...neutral,
    ...value,
    colorBalance: effectiveColorBalance(value.colorBalance),
    sharpenNoise: effectiveSharpenNoise(value.sharpenNoise),
    curves: effectiveCurves(value.curves),
    auto: effectiveAutoAdjustments(value.auto),
    filterEffects: effectiveFilterEffects(value.filterEffects),
    photoAdjustments: effectivePhotoAdjustments(value.photoAdjustments),
  };
}

/** Convert one 8-bit channel through an input-levels correction. */
export function levelsChannel(
  value: number,
  black: number,
  white: number,
  gamma: number,
): number {
  const span = Math.max(1, white - black),
    normalized = Math.max(0, Math.min(1, (value - black) / span)),
    corrected = Math.pow(normalized, 1 / Math.max(0.1, gamma));
  return Math.max(0, Math.min(255, Math.round(corrected * 255)));
}

/** Apply input levels in-place while preserving alpha and source pixels. */
export function applyLevels(
  canvas: HTMLCanvasElement,
  adjustments: Partial<Adjustments>,
): HTMLCanvasElement {
  const a = effectiveAdjustments(adjustments),
    black = Math.max(0, Math.min(254, a.levelsBlack)),
    white = Math.max(black + 1, Math.min(255, a.levelsWhite)),
    gamma = Math.max(0.1, Math.min(3, a.levelsGamma));
  if (black === 0 && white === 255 && gamma === 1) return canvas;
  const context = canvas.getContext('2d')!,
    image = context.getImageData(0, 0, canvas.width, canvas.height),
    data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = levelsChannel(data[i], black, white, gamma);
    data[i + 1] = levelsChannel(data[i + 1], black, white, gamma);
    data[i + 2] = levelsChannel(data[i + 2], black, white, gamma);
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

/** Apply an HSL hue correction to rendered pixels, preserving alpha. */
export function applyHue(
  canvas: HTMLCanvasElement,
  adjustments: Partial<Adjustments>,
): HTMLCanvasElement {
  const degrees = effectiveAdjustments(adjustments).hue;
  if (degrees === 0) return canvas;
  const context = canvas.getContext('2d')!,
    image = context.getImageData(0, 0, canvas.width, canvas.height);
  rotateHuePixels(image.data, degrees);
  context.putImageData(image, 0, 0);
  return canvas;
}

/** Apply editable tonal color-balance channels to a rendered surface. */
export function applyColorBalance(
  canvas: HTMLCanvasElement,
  adjustments: Partial<Adjustments>,
): HTMLCanvasElement {
  const value = effectiveAdjustments(adjustments).colorBalance;
  if (isNeutralColorBalance(value)) return canvas;
  const context = canvas.getContext('2d')!,
    image = context.getImageData(0, 0, canvas.width, canvas.height);
  applyColorBalancePixels(image.data, value);
  context.putImageData(image, 0, 0);
  return canvas;
}

/** Apply bounded sharpen/noise effects to a rendered surface. */
export function applySharpenNoise(
  canvas: HTMLCanvasElement,
  adjustments: Partial<Adjustments>,
): HTMLCanvasElement {
  const value = effectiveAdjustments(adjustments).sharpenNoise;
  if (isNeutralSharpenNoise(value)) return canvas;
  const context = canvas.getContext('2d')!,
    image = context.getImageData(0, 0, canvas.width, canvas.height);
  applySharpenNoisePixels(image.data, canvas.width, canvas.height, value);
  context.putImageData(image, 0, 0);
  return canvas;
}

/** Apply editable RGB and per-channel curves to a rendered surface. */
export function applyCurves(
  canvas: HTMLCanvasElement,
  adjustments: Partial<Adjustments>,
): HTMLCanvasElement {
  const value = effectiveAdjustments(adjustments).curves;
  if (isNeutralCurves(value)) return canvas;
  const context = canvas.getContext('2d')!,
    image = context.getImageData(0, 0, canvas.width, canvas.height);
  applyCurvesPixels(image.data, value);
  context.putImageData(image, 0, 0);
  return canvas;
}

/** Apply deterministic one-click tonal corrections to a rendered surface. */
export function applyAutoAdjustments(
  canvas: HTMLCanvasElement,
  adjustments: Partial<Adjustments>,
): HTMLCanvasElement {
  const value = effectiveAdjustments(adjustments).auto;
  if (isNeutralAuto(value)) return canvas;
  const context = canvas.getContext('2d')!,
    image = context.getImageData(0, 0, canvas.width, canvas.height);
  const result = applyAutoAdjustmentsPixels(image.data, value);
  image.data.set(result.data);
  context.putImageData(image, 0, 0);
  return canvas;
}

/** Measure one text line including custom tracking in canvas pixels. */
export function trackedTextWidth(
  context: CanvasRenderingContext2D,
  text: string,
  letterSpacing: number,
): number {
  const spacing = Number.isFinite(letterSpacing) ? letterSpacing : 0;
  return Math.max(
    0,
    context.measureText(text).width +
      Math.max(0, Array.from(text).length - 1) * spacing,
  );
}

/** Return the x offset for a line inside an editable text box. */
export function alignedTextOffset(
  width: number,
  boxWidth: number,
  align: TextAlign,
): number {
  if (align === 'center') return (boxWidth - width) / 2;
  if (align === 'right') return boxWidth - width;
  return 0;
}

/** Draw an editable text layer while retaining alignment and tracking metadata. */
export function drawTextLayer(
  context: CanvasRenderingContext2D,
  layer: Extract<Layer, { kind: 'text' }>,
): void {
  const boxWidth = Math.max(1, layer.boxWidth ?? 640),
    align = layer.textAlign ?? 'left',
    lineHeight = Math.max(0.5, layer.lineHeight ?? 1.2),
    spacing = layer.letterSpacing ?? 0,
    orientation = layer.orientation ?? 'horizontal';
  if (orientation === 'vertical') {
    const columnAdvance = Math.max(1, layer.fontSize * lineHeight);
    for (const [columnIndex, line] of layer.text.split('\n').entries()) {
      let y = 0;
      const x = columnIndex * columnAdvance;
      for (const glyph of Array.from(line)) {
        context.fillText(glyph, x, y);
        y += layer.fontSize + spacing;
      }
    }
    return;
  }
  for (const [lineIndex, line] of layer.text.split('\n').entries()) {
    const width = trackedTextWidth(context, line, spacing),
      start = alignedTextOffset(width, boxWidth, align),
      y = lineIndex * layer.fontSize * lineHeight;
    if (spacing === 0) {
      context.fillText(line, start, y);
      continue;
    }
    let x = start;
    for (const glyph of Array.from(line)) {
      context.fillText(glyph, x, y);
      x += context.measureText(glyph).width + spacing;
    }
  }
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const integer = (v: unknown, min: number, max: number) =>
  number(v, min, max) && Number.isInteger(v);
const short = (v: unknown, max: number) =>
  typeof v === 'string' && v.length <= max;
export const validId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9-]{36}$/.test(v);
export function validAdjustments(v: unknown): v is Adjustments {
  return (
    record(v) &&
    number(v.brightness, 0, 200) &&
    number(v.contrast, 0, 200) &&
    number(v.saturation, 0, 200) &&
    number(v.hue ?? neutral.hue, -180, 180) &&
    number(v.blur, 0, 20) &&
    typeof v.filter === 'string' &&
    FILTER_VALUES.includes(v.filter) &&
    // v2 drafts may omit these fields; validateDraft normalizes them before
    // validating frames, while direct callers still receive strict ranges.
    number(v.levelsBlack ?? neutral.levelsBlack, 0, 254) &&
    number(v.levelsWhite ?? neutral.levelsWhite, 1, 255) &&
    number(v.levelsGamma ?? neutral.levelsGamma, 0.1, 3) &&
    Number(v.levelsWhite ?? neutral.levelsWhite) >
      Number(v.levelsBlack ?? neutral.levelsBlack) &&
    validColorBalance(v.colorBalance ?? neutral.colorBalance) &&
    validSharpenNoise(v.sharpenNoise ?? neutral.sharpenNoise) &&
    validCurves(v.curves ?? neutral.curves) &&
    validAutoAdjustments(v.auto ?? neutral.auto) &&
    validFilterEffects(v.filterEffects ?? neutral.filterEffects) &&
    // Omitted photo metadata is the legacy neutral default; an explicitly
    // supplied value must be a complete, bounded record so imports fail closed.
    validPhotoAdjustments(
      v.photoAdjustments === undefined
        ? neutral.photoAdjustments
        : v.photoAdjustments,
    )
  );
}
export function validAsset(value: unknown): value is Asset {
  if (
    !record(value) ||
    !integer(value.w, 1, 16000) ||
    !integer(value.h, 1, 16000) ||
    Number(value.w) * Number(value.h) > 16000000 ||
    typeof value.url !== 'string' ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.url)
  )
    return false;
  // Verify the PNG header before decoding a potentially oversized bitmap.
  try {
    const header = atob(value.url.slice(22, 66));
    const bytes = Uint8Array.from(header, (c) => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    return (
      view.getUint32(0) === 0x89504e47 &&
      view.getUint32(4) === 0x0d0a1a0a &&
      view.getUint32(12) === 0x49484452 &&
      view.getUint32(16) === value.w &&
      view.getUint32(20) === value.h
    );
  } catch {
    return false;
  }
}

/**
 * Normalize text presentation fields introduced after the initial text-layer
 * contract. Keeping this at the persistence boundary lets older bookmarks
 * open without changing their left-aligned, 1.2x-spaced rendering.
 */
export function effectiveTextLayer<T extends Layer>(
  layer: T,
  frameWidth?: number,
): T {
  if (layer.kind !== 'text') return layer;
  const value = layer as T & Partial<Extract<Layer, { kind: 'text' }>>;
  return {
    ...layer,
    boxWidth: value.boxWidth ?? Math.max(1, frameWidth ?? 640),
    textAlign: value.textAlign ?? 'left',
    lineHeight: value.lineHeight ?? 1.2,
    letterSpacing: value.letterSpacing ?? 0,
    orientation: value.orientation ?? 'horizontal',
  } as T;
}
export function validateFrame(
  value: unknown,
  assets: Assets,
): asserts value is Frame {
  const fail = () => {
    throw new Error('Invalid layer document');
  };
  if (
    !record(value) ||
    !integer(value.w, 1, 16000) ||
    !integer(value.h, 1, 16000) ||
    Number(value.w) * Number(value.h) > 16000000 ||
    !Array.isArray(value.layers) ||
    !value.layers.length ||
    value.layers.length > 32
  )
    return fail();
  if (value.imageSize !== undefined && !validImageSizeMetadata(value.imageSize))
    return fail();
  const ids = new Set<string>();
  if (value.groups !== undefined && !Array.isArray(value.groups)) return fail();
  const groups = Array.isArray(value.groups) ? value.groups : [];
  if (groups.length > 32) return fail();
  for (const group of groups) {
    if (
      !record(group) ||
      !validId(group.id) ||
      ids.has(group.id) ||
      !short(group.name, 160) ||
      typeof group.visible !== 'boolean' ||
      typeof group.locked !== 'boolean' ||
      !number(group.opacity, 0, 1) ||
      !BLENDS.includes(group.blend as (typeof BLENDS)[number]) ||
      typeof group.collapsed !== 'boolean'
    )
      return fail();
    ids.add(group.id);
  }
  if (
    value.artboards !== undefined &&
    (!validArtboards(
      value.artboards,
      Number(value.w),
      Number(value.h),
      value.activeArtboardId,
    ))
  )
    return fail();
  if (value.artboards === undefined && value.activeArtboardId !== undefined)
    return fail();
  const groupIds = new Set(groups.map((group) => group.id));
  let pixels = 0;
  for (const layer of value.layers) {
    if (
      !record(layer) ||
      !validId(layer.id) ||
      ids.has(layer.id) ||
      !short(layer.name, 160) ||
      typeof layer.visible !== 'boolean' ||
      typeof layer.locked !== 'boolean' ||
      !number(layer.opacity, 0, 1) ||
      !BLENDS.includes(layer.blend as (typeof BLENDS)[number]) ||
      !Array.isArray(layer.matrix) ||
      layer.matrix.length !== 6 ||
      !layer.matrix.every((v) => number(v, -1000000, 1000000)) ||
      !validAdjustments(layer.adjustments) ||
      (layer.groupId !== undefined &&
        (!validId(layer.groupId) || !groupIds.has(layer.groupId)))
    )
      return fail();
    const m = layer.matrix as Matrix;
    if (Math.abs(m[0] * m[3] - m[1] * m[2]) < 0.000000000001) return fail();
    ids.add(layer.id);
    if (
      layer.kind !== 'raster' &&
      (layer.mask !== undefined ||
        layer.maskEnabled !== undefined ||
        layer.maskInverted !== undefined ||
        layer.spotHealing !== undefined)
    )
      return fail();
    if (layer.kind === 'raster') {
      if (!validId(layer.asset) || !Object.hasOwn(assets, layer.asset))
        return fail();
      if (
        (layer.maskEnabled !== undefined &&
          typeof layer.maskEnabled !== 'boolean') ||
        (layer.maskInverted !== undefined &&
          typeof layer.maskInverted !== 'boolean') ||
        ((layer.maskEnabled !== undefined ||
          layer.maskInverted !== undefined) &&
          layer.mask === undefined)
      )
        return fail();
      if (
        layer.mask !== undefined &&
        (!validId(layer.mask) ||
          !Object.hasOwn(assets, layer.mask) ||
          assets[layer.mask].w !== value.w ||
          assets[layer.mask].h !== value.h)
      )
        return fail();
      if (
        layer.spotHealing !== undefined &&
        !validSpotHealingStrokes(layer.spotHealing, assets[layer.asset].w, assets[layer.asset].h)
      )
        return fail();
      pixels += assets[layer.asset].w * assets[layer.asset].h;
    } else if (layer.kind === 'text') {
      if (
        !short(layer.text, 10000) ||
        !/^#[a-f\d]{6}$/i.test(String(layer.color)) ||
        !number(layer.fontSize, 1, 1000) ||
        !FONTS.includes(layer.fontFamily as (typeof FONTS)[number]) ||
        typeof layer.bold !== 'boolean' ||
        !number(layer.boxWidth ?? 640, 1, 16000) ||
        !TEXT_ALIGNS.includes((layer.textAlign ?? 'left') as TextAlign) ||
        !number(layer.lineHeight ?? 1.2, 0.5, 4) ||
        !number(layer.letterSpacing ?? 0, -100, 100) ||
        !TEXT_ORIENTATIONS.includes(
          (layer.orientation ?? 'horizontal') as TextOrientation,
        )
      )
        return fail();
    } else if (
      layer.kind === 'rectangle' ||
      layer.kind === 'ellipse' ||
      layer.kind === 'line' ||
      layer.kind === 'polygon'
    ) {
      if (
        !number(layer.width, 1, 16000) ||
        !number(layer.height, 1, 16000) ||
        !number(layer.stroke, 1, 100) ||
        !/^#[a-f\d]{6}$/i.test(String(layer.color)) ||
        (layer.kind !== 'line' && typeof layer.fill !== 'boolean') ||
        (layer.kind === 'polygon' &&
          (!integer(layer.sides, 3, 32) ||
            (() => {
              try {
                validateShapeVariant(layer.variant);
                return false;
              } catch {
                return true;
              }
            })()))
      )
        return fail();
    } else if (layer.kind === 'path') {
      try {
        validatePath(layer.path);
      } catch {
        return fail();
      }
    } else return fail();
  }
  const frameWidth = Number(value.w),
    frameHeight = Number(value.h);
  if (value.savedSelections !== undefined) {
    try {
      const book = parseSavedSelections(value.savedSelections, {
        w: frameWidth,
        h: frameHeight,
      });
      if (
        referencedSelectionMasks(book).some(
          (id) =>
            !Object.hasOwn(assets, id) ||
            assets[id].w !== frameWidth ||
            assets[id].h !== frameHeight,
        )
      )
        return fail();
    } catch {
      return fail();
    }
  }
  const validSelection = (selection: unknown): selection is Selection => {
    if (!record(selection)) return false;
    const s = selection as Record<string, unknown>;
    const validPart = (part: unknown, requireOperation: boolean) => {
      if (!record(part)) return false;
      const p = part as Record<string, unknown>;
      return (
        ['rectangle', 'ellipse', 'polygon'].includes(String(p.shape)) &&
        number(p.x, 0, frameWidth) &&
        number(p.y, 0, frameHeight) &&
        number(p.w, 1, frameWidth) &&
        number(p.h, 1, frameHeight) &&
        Number(p.x) + Number(p.w) <= frameWidth &&
        Number(p.y) + Number(p.h) <= frameHeight &&
        (!requireOperation ||
          ['replace', 'add', 'subtract', 'intersect'].includes(
            String(p.operation),
          )) &&
        (p.shape !== 'polygon' ||
          (Array.isArray(p.points) &&
            p.points.length >= 3 &&
            p.points.length <= 10000 &&
            p.points.every(
              (point) =>
                record(point) &&
                number(point.x, 0, frameWidth) &&
                number(point.y, 0, frameHeight),
            )))
      );
    };
    return (
      validPart({ ...s, operation: 'replace' }, false) &&
      number(s.feather, 0, 1000) &&
      typeof s.inverted === 'boolean' &&
      (s.matrix === undefined || validMatrix(s.matrix)) &&
      (s.parts === undefined ||
        (Array.isArray(s.parts) &&
          s.parts.length >= 1 &&
          s.parts.length <= 1000 &&
          s.parts.every((part) => validPart(part, true)))) &&
      (s.mask === undefined ||
        (validId(s.mask) &&
          Object.hasOwn(assets, s.mask) &&
          assets[s.mask].w === frameWidth &&
          assets[s.mask].h === frameHeight))
    );
  };
  if (
    (value.selection !== undefined && !validSelection(value.selection)) ||
    (value.previousSelection !== undefined &&
      !validSelection(value.previousSelection)) ||
    (value.quickMask !== undefined &&
      (!record(value.quickMask) ||
        !validId(value.quickMask.asset) ||
        typeof value.quickMask.active !== 'boolean' ||
        !Object.hasOwn(assets, value.quickMask.asset) ||
        assets[value.quickMask.asset].w !== frameWidth ||
        assets[value.quickMask.asset].h !== frameHeight)) ||
    !validMeasurements(value.measurements, frameWidth, frameHeight)
  )
    return fail();
  if (pixels > 64000000 || !validId(value.active) || !ids.has(value.active))
    return fail();
}
export function referencedAssets(history: Frame[], assets: Assets): Assets {
  const used: Assets = {};
  for (const frame of history) {
    if (frame.selection?.mask)
      used[frame.selection.mask] = assets[frame.selection.mask];
    if (frame.previousSelection?.mask)
      used[frame.previousSelection.mask] = assets[frame.previousSelection.mask];
    if (frame.quickMask?.asset && assets[frame.quickMask.asset])
      used[frame.quickMask.asset] = assets[frame.quickMask.asset];
    for (const entry of frame.savedSelections?.selections || []) {
      if (entry.selection.mask && assets[entry.selection.mask])
        used[entry.selection.mask] = assets[entry.selection.mask];
    }
    for (const layer of frame.layers)
      if (layer.kind === 'raster') {
        used[layer.asset] = assets[layer.asset];
        if (layer.mask) used[layer.mask] = assets[layer.mask];
      }
  }
  return used;
}
export function addAsset(assets: Assets, canvas: HTMLCanvasElement): string {
  const url = canvas.toDataURL();
  const existing = Object.keys(assets).find((id) => assets[id].url === url);
  if (existing) return existing;
  const id = crypto.randomUUID();
  assets[id] = { url, w: canvas.width, h: canvas.height };
  return id;
}
export function rasterFrame(
  canvas: HTMLCanvasElement,
  assets: Assets,
  name = 'Background',
): Frame {
  const layer: Layer = {
    ...commonLayer(name),
    kind: 'raster',
    asset: addAsset(assets, canvas),
  };
  return {
    w: canvas.width,
    h: canvas.height,
    layers: [layer],
    active: layer.id,
  };
}
const decoded = new Map<Asset, Promise<HTMLImageElement>>();
export function decodeAsset(asset: Asset): Promise<HTMLImageElement> {
  const cached = decoded.get(asset);
  if (cached) {
    decoded.delete(asset);
    decoded.set(asset, cached);
    return cached;
  }
  const pending = decodeNewAsset(asset);
  decoded.set(asset, pending);
  let pixels = Array.from(decoded.keys()).reduce(
    (sum, item) => sum + item.w * item.h,
    0,
  );
  while (pixels > 64000000 && decoded.size > 1) {
    const oldest = decoded.keys().next().value!;
    pixels -= oldest.w * oldest.h;
    decoded.delete(oldest);
  }
  return pending;
}
async function decodeNewAsset(asset: Asset): Promise<HTMLImageElement> {
  if (!validAsset(asset)) throw new Error('Invalid or oversized project image');
  if (typeof Image === 'function') {
    const image = new Image();
    image.src = asset.url;
    await image.decode();
    if (image.naturalWidth !== asset.w || image.naturalHeight !== asset.h)
      throw new Error('Project image dimensions do not match');
    return image;
  }
  if (typeof createImageBitmap === 'function' && typeof Blob === 'function') {
    const encoded = asset.url.slice(asset.url.indexOf(',') + 1),
      binary = atob(encoded),
      bytes = Uint8Array.from(binary, (value) => value.charCodeAt(0)),
      image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    if (image.width !== asset.w || image.height !== asset.h)
      throw new Error('Project image dimensions do not match');
    return image as unknown as HTMLImageElement;
  }
  throw new Error('Image decoding is unavailable in this browser.');
}
export function surface(w: number, h: number) {
  const canvas =
    typeof document !== 'undefined'
      ? document.createElement('canvas')
      : typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(w, h)
        : undefined;
  if (!canvas)
    throw new Error('Canvas rendering is unavailable in this browser.');
  canvas.width = w;
  canvas.height = h;
  return canvas as unknown as HTMLCanvasElement;
}
/** Paints a contiguous region, preserving antialias-free source pixels for undo. */
export function floodFill(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  color: string,
  tolerance = 24,
) {
  const context = canvas.getContext('2d')!,
    image = context.getImageData(0, 0, canvas.width, canvas.height),
    data = image.data,
    startX = Math.max(0, Math.min(canvas.width - 1, Math.floor(x))),
    startY = Math.max(0, Math.min(canvas.height - 1, Math.floor(y))),
    start = (startY * canvas.width + startX) * 4,
    target = [data[start], data[start + 1], data[start + 2], data[start + 3]],
    match = color.match(/^#([a-f\d]{6})$/i);
  if (!match) throw new Error('Fill color is invalid');
  const replacement = [
    parseInt(match[1].slice(0, 2), 16),
    parseInt(match[1].slice(2, 4), 16),
    parseInt(match[1].slice(4, 6), 16),
    255,
  ];
  const same = (index: number) =>
    Math.max(
      Math.abs(data[index] - target[0]),
      Math.abs(data[index + 1] - target[1]),
      Math.abs(data[index + 2] - target[2]),
      Math.abs(data[index + 3] - target[3]),
    ) <= tolerance;
  if (!same(start)) return false;
  const seen = new Uint8Array(canvas.width * canvas.height),
    queue = [startX, startY];
  while (queue.length) {
    const cy = queue.pop()!,
      cx = queue.pop()!,
      offset = (cy * canvas.width + cx) * 4;
    if (seen[cy * canvas.width + cx] || !same(offset)) continue;
    seen[cy * canvas.width + cx] = 1;
    data.set(replacement, offset);
    if (cx > 0) queue.push(cx - 1, cy);
    if (cx + 1 < canvas.width) queue.push(cx + 1, cy);
    if (cy > 0) queue.push(cx, cy - 1);
    if (cy + 1 < canvas.height) queue.push(cx, cy + 1);
  }
  context.putImageData(image, 0, 0);
  return true;
}

/**
 * Replaces sampled colors under a circular brush stroke while preserving the
 * source alpha. The source surface remains immutable so repeated pointer
 * events cannot gradually widen the sampled color range.
 */
export function replaceColorStroke(
  source: HTMLCanvasElement,
  output: HTMLCanvasElement,
  target: [number, number, number, number],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  size: number,
  tolerance = 24,
  opacity = 1,
) {
  const match = color.match(/^#([a-f\d]{6})$/i);
  if (!match) throw new Error('Replacement color is invalid');
  const replacement = [
    parseInt(match[1].slice(0, 2), 16),
    parseInt(match[1].slice(2, 4), 16),
    parseInt(match[1].slice(4, 6), 16),
  ];
  const width = source.width,
    height = source.height,
    sourceData = source
      .getContext('2d')!
      .getImageData(0, 0, width, height).data,
    context = output.getContext('2d')!,
    image = context.getImageData(0, 0, width, height),
    outputData = image.data,
    radius = Math.max(1, size / 2),
    distance = Math.hypot(x2 - x1, y2 - y1),
    steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.5))),
    amount = Math.max(0, Math.min(1, opacity));
  let changed = false;
  const matches = (offset: number) =>
    sourceData[offset + 3] > 0 &&
    Math.max(
      Math.abs(sourceData[offset] - target[0]),
      Math.abs(sourceData[offset + 1] - target[1]),
      Math.abs(sourceData[offset + 2] - target[2]),
      Math.abs(sourceData[offset + 3] - target[3]),
    ) <= tolerance;
  for (let step = 0; step <= steps; step += 1) {
    const cx = x1 + ((x2 - x1) * step) / steps,
      cy = y1 + ((y2 - y1) * step) / steps,
      left = Math.max(0, Math.floor(cx - radius)),
      right = Math.min(width - 1, Math.ceil(cx + radius)),
      top = Math.max(0, Math.floor(cy - radius)),
      bottom = Math.min(height - 1, Math.ceil(cy + radius));
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        if (Math.hypot(x - cx, y - cy) > radius) continue;
        const offset = (y * width + x) * 4;
        if (!matches(offset)) continue;
        for (let channel = 0; channel < 3; channel += 1)
          outputData[offset + channel] = Math.round(
            sourceData[offset + channel] * (1 - amount) +
              replacement[channel] * amount,
          );
        outputData[offset + 3] = sourceData[offset + 3];
        changed = true;
      }
    }
  }
  if (changed) context.putImageData(image, 0, 0);
  return changed;
}

/** Creates a canvas-sized alpha mask for a contiguous color selection. */
export function colorSelectMask(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  tolerance = 24,
) {
  const context = canvas.getContext('2d')!,
    source = context.getImageData(0, 0, canvas.width, canvas.height),
    output = context.createImageData(canvas.width, canvas.height),
    data = source.data,
    startX = Math.max(0, Math.min(canvas.width - 1, Math.floor(x))),
    startY = Math.max(0, Math.min(canvas.height - 1, Math.floor(y))),
    start = (startY * canvas.width + startX) * 4,
    target = [data[start], data[start + 1], data[start + 2], data[start + 3]],
    same = (index: number) =>
      Math.max(
        Math.abs(data[index] - target[0]),
        Math.abs(data[index + 1] - target[1]),
        Math.abs(data[index + 2] - target[2]),
        Math.abs(data[index + 3] - target[3]),
      ) <= tolerance;
  if (!same(start)) return surface(canvas.width, canvas.height);
  const seen = new Uint8Array(canvas.width * canvas.height),
    queue = [startX, startY];
  while (queue.length) {
    const cy = queue.pop()!,
      cx = queue.pop()!,
      pixel = cy * canvas.width + cx,
      offset = pixel * 4;
    if (seen[pixel] || !same(offset)) continue;
    seen[pixel] = 1;
    output.data[offset] = 255;
    output.data[offset + 1] = 255;
    output.data[offset + 2] = 255;
    output.data[offset + 3] = 255;
    if (cx > 0) queue.push(cx - 1, cy);
    if (cx + 1 < canvas.width) queue.push(cx + 1, cy);
    if (cy > 0) queue.push(cx, cy - 1);
    if (cy + 1 < canvas.height) queue.push(cx, cy + 1);
  }
  const mask = surface(canvas.width, canvas.height);
  mask.getContext('2d')!.putImageData(output, 0, 0);
  return mask;
}
/** Render into an isolated surface. Callers publish only the newest completed render. */
export type RenderOptions = {
  /** Return true between layers to cancel a worker render without publishing it. */
  isCancelled?: () => boolean;
  /** Yield to the worker event loop every N layers so cancellation is observable. */
  yieldEveryLayers?: number;
  /** Report completed top-level layer passes. Progress is monotonic and bounded. */
  onProgress?: (completed: number, total: number) => void;
};

export async function renderFrame(
  frame: Frame,
  assets: Assets,
  overrides?: Record<string, HTMLCanvasElement>,
  options?: RenderOptions,
): Promise<HTMLCanvasElement> {
  const out = surface(frame.w, frame.h),
    context = out.getContext('2d')!,
    groups = new Map((frame.groups || []).map((group) => [group.id, group]));
  const reportProgress = (layerIndex: number) =>
    options?.onProgress?.(layerIndex + 1, frame.layers.length);
  for (const [layerIndex, layer] of frame.layers.entries()) {
    if (options?.isCancelled?.())
      throw new DOMException('Document rendering cancelled', 'AbortError');
    if (
      options?.yieldEveryLayers &&
      layerIndex > 0 &&
      layerIndex % options.yieldEveryLayers === 0
    )
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const group = layer.groupId ? groups.get(layer.groupId) : undefined;
    if (!layer.visible || (group && !group.visible)) {
      reportProgress(layerIndex);
      continue;
    }
    const groupOpacity = group?.opacity ?? 1;
    const override = overrides?.[layer.id];
    const image =
      layer.kind === 'raster' && !override
        ? await decodeAsset(assets[layer.asset])
        : undefined;
    // Overrides are raw, layer-local buffers. They must travel through the
    // exact same matrix, opacity, blend, adjustment and mask pipeline as the
    // immutable source asset; resetting the transform here would bake a
    // translated/scaled layer into the wrong frame coordinates.
    let rasterSource: CanvasImageSource | undefined = override || image;
    if (layer.kind === 'raster' && rasterSource && layer.spotHealing?.length) {
      // Spot Healing is metadata over the immutable source asset. Replay it in
      // local layer space before transforms, masks and adjustments so undo,
      // reload, export and worker rendering share the exact cleanup behavior.
      const asset = assets[layer.asset],
        cleaned = surface(override?.width ?? asset.w, override?.height ?? asset.h),
        cleanedContext = cleaned.getContext('2d')!;
      cleanedContext.drawImage(rasterSource, 0, 0);
      const imageData = cleanedContext.getImageData(0, 0, cleaned.width, cleaned.height);
      imageData.data.set(
        applySpotHealingStrokes(imageData.data, cleaned.width, cleaned.height, layer.spotHealing),
      );
      cleanedContext.putImageData(imageData, 0, 0);
      rasterSource = cleaned;
    }
    const filterEffect = effectiveFilterEffects(
      layer.adjustments.filterEffects,
    );
    if (
      layer.kind === 'raster' &&
      rasterSource &&
      !isNeutralFilterEffects(filterEffect)
    ) {
      // Filter geometry is layer-local, so moving/resizing a layer never bakes
      // the effect into frame coordinates. Masks are still applied afterward.
      const asset = assets[layer.asset],
        filtered = surface(
          override?.width ?? asset.w,
          override?.height ?? asset.h,
        );
      filtered.getContext('2d')!.drawImage(rasterSource, 0, 0);
      applyFilterEffects(filtered, filterEffect);
      rasterSource = filtered;
    }
    if (
      layer.kind !== 'raster' &&
      (effectiveAdjustments(layer.adjustments).hue !== 0 ||
        effectiveAdjustments(layer.adjustments).levelsBlack !==
          neutral.levelsBlack ||
        effectiveAdjustments(layer.adjustments).levelsWhite !==
          neutral.levelsWhite ||
        effectiveAdjustments(layer.adjustments).levelsGamma !==
          neutral.levelsGamma ||
        !isNeutralColorBalance(
          effectiveAdjustments(layer.adjustments).colorBalance,
        ) ||
        !isNeutralSharpenNoise(
          effectiveAdjustments(layer.adjustments).sharpenNoise,
        ) ||
        !isNeutralCurves(effectiveAdjustments(layer.adjustments).curves) ||
        !isNeutralAuto(effectiveAdjustments(layer.adjustments).auto) ||
        !isNeutralFilterEffects(
          effectiveAdjustments(layer.adjustments).filterEffects,
        ) ||
        !isNeutralPhotoAdjustments(
          effectiveAdjustments(layer.adjustments).photoAdjustments,
        ))
    ) {
      // Keep text and shape layers editable: render their existing transform
      // and CSS corrections into an isolated surface, then rotate HSL colour.
      const coloured = await renderFrame(
        {
          ...frame,
          layers: [
            {
              ...layer,
              groupId: undefined,
              opacity: 1,
              blend: 'source-over',
              adjustments: {
                ...effectiveAdjustments(layer.adjustments),
                hue: 0,
                levelsBlack: neutral.levelsBlack,
                levelsWhite: neutral.levelsWhite,
                levelsGamma: neutral.levelsGamma,
                colorBalance: { ...neutralColorBalance },
                sharpenNoise: { ...neutralSharpenNoise },
                curves: effectiveCurves(undefined),
                auto: { ...neutralAuto },
                filterEffects: { ...neutralFilterEffects },
                photoAdjustments: { ...neutralPhotoAdjustments },
              },
            },
          ],
          groups: [],
        },
        assets,
        overrides,
        // A decorated text/vector layer uses a nested one-layer render. Keep
        // progress scoped to the outer frame so worker clients receive a
        // monotonic bounded sequence rather than duplicate totals.
        options?.onProgress ? { ...options, onProgress: undefined } : options,
      );
      applyHue(coloured, layer.adjustments);
      applyLevels(coloured, layer.adjustments);
      applyColorBalance(coloured, layer.adjustments);
      applySharpenNoise(coloured, layer.adjustments);
      applyCurves(coloured, layer.adjustments);
      applyAutoAdjustments(coloured, layer.adjustments);
      applyFilterEffects(coloured, layer.adjustments.filterEffects);
      applyPhotoAdjustments(coloured, layer.adjustments.photoAdjustments);
      context.save();
      context.globalAlpha = layer.opacity * groupOpacity;
      context.globalCompositeOperation = layer.blend;
      context.drawImage(coloured, 0, 0);
      context.restore();
      reportProgress(layerIndex);
      continue;
    }
    const maskSettings =
      layer.kind === 'raster'
        ? effectiveLayerMask({
            enabled: layer.maskEnabled,
            inverted: layer.maskInverted,
          })
        : undefined;
    if (
      layer.kind === 'raster' &&
      layer.mask &&
      rasterSource &&
      maskSettings?.enabled
    ) {
      const masked = surface(frame.w, frame.h),
        maskContext = masked.getContext('2d')!;
      maskContext.save();
      maskContext.setTransform(...layer.matrix);
      maskContext.globalAlpha = 1;
      maskContext.globalCompositeOperation = 'source-over';
      maskContext.filter = filterCSS(layer.adjustments);
      maskContext.drawImage(rasterSource, 0, 0);
      maskContext.restore();
      applyHue(masked, layer.adjustments);
      applyLevels(masked, layer.adjustments);
      applyColorBalance(masked, layer.adjustments);
      applySharpenNoise(masked, layer.adjustments);
      applyCurves(masked, layer.adjustments);
      applyAutoAdjustments(masked, layer.adjustments);
      applyPhotoAdjustments(masked, layer.adjustments.photoAdjustments);
      const maskImage = await decodeAsset(assets[layer.mask]);
      if (!maskSettings.inverted) {
        // The common path can use the compositor directly and avoids a second
        // full-frame surface for large images.
        maskContext.save();
        maskContext.globalCompositeOperation = 'destination-in';
        maskContext.setTransform(1, 0, 0, 1, 0, 0);
        maskContext.drawImage(maskImage, 0, 0);
        maskContext.restore();
      } else {
        // Canvas has no alpha-invert composite operation. Build the inverted
        // alpha only for this branch, keeping the immutable mask asset intact.
        const maskCanvas = surface(frame.w, frame.h),
          maskCanvasContext = maskCanvas.getContext('2d')!;
        maskCanvasContext.drawImage(maskImage, 0, 0);
        const maskData = maskCanvasContext.getImageData(
            0,
            0,
            frame.w,
            frame.h,
          ).data,
          maskAlpha = new Uint8ClampedArray(frame.w * frame.h);
        for (let pixel = 0; pixel < maskAlpha.length; pixel += 1)
          maskAlpha[pixel] = maskData[pixel * 4 + 3];
        const maskedImage = maskContext.getImageData(0, 0, frame.w, frame.h);
        maskedImage.data.set(
          applyLayerMaskPixels(maskedImage.data, maskAlpha, maskSettings),
        );
        maskContext.putImageData(maskedImage, 0, 0);
      }
      context.save();
      context.globalAlpha = layer.opacity * groupOpacity;
      context.globalCompositeOperation = layer.blend;
      context.drawImage(masked, 0, 0);
      context.restore();
      reportProgress(layerIndex);
      continue;
    }
    // Canvas 2D has no levels filter. Render raster layers into a frame-space
    // buffer first, apply the input-levels LUT, then composite the result so
    // transforms, blend modes and opacity remain nondestructive metadata.
    if (
      layer.kind === 'raster' &&
      rasterSource &&
      (effectiveAdjustments(layer.adjustments).hue !== 0 ||
        layer.adjustments.levelsBlack !== neutral.levelsBlack ||
        layer.adjustments.levelsWhite !== neutral.levelsWhite ||
        layer.adjustments.levelsGamma !== neutral.levelsGamma ||
        !isNeutralColorBalance(
          effectiveAdjustments(layer.adjustments).colorBalance,
        ) ||
        !isNeutralSharpenNoise(
          effectiveAdjustments(layer.adjustments).sharpenNoise,
        ) ||
        !isNeutralCurves(effectiveAdjustments(layer.adjustments).curves) ||
        !isNeutralAuto(effectiveAdjustments(layer.adjustments).auto) ||
        !isNeutralPhotoAdjustments(
          effectiveAdjustments(layer.adjustments).photoAdjustments,
        ))
    ) {
      const leveled = surface(frame.w, frame.h),
        leveledContext = leveled.getContext('2d')!;
      leveledContext.save();
      leveledContext.setTransform(...layer.matrix);
      leveledContext.globalAlpha = 1;
      leveledContext.globalCompositeOperation = 'source-over';
      leveledContext.filter = filterCSS(layer.adjustments);
      leveledContext.drawImage(rasterSource, 0, 0);
      leveledContext.restore();
      applyHue(leveled, layer.adjustments);
      applyLevels(leveled, layer.adjustments);
      applyColorBalance(leveled, layer.adjustments);
      applySharpenNoise(leveled, layer.adjustments);
      applyCurves(leveled, layer.adjustments);
      applyAutoAdjustments(leveled, layer.adjustments);
      applyPhotoAdjustments(leveled, layer.adjustments.photoAdjustments);
      context.save();
      context.globalAlpha = layer.opacity * groupOpacity;
      context.globalCompositeOperation = layer.blend;
      context.drawImage(leveled, 0, 0);
      context.restore();
      reportProgress(layerIndex);
      continue;
    }
    context.save();
    context.setTransform(...layer.matrix);
    context.globalAlpha = layer.opacity * groupOpacity;
    context.globalCompositeOperation = layer.blend;
    context.filter = filterCSS(layer.adjustments);
    if (override) {
      context.drawImage(rasterSource!, 0, 0);
      context.restore();
      reportProgress(layerIndex);
      continue;
    }
    if (layer.kind === 'raster' && rasterSource)
      context.drawImage(rasterSource, 0, 0);
    if (layer.kind === 'text') {
      context.fillStyle = layer.color;
      context.font = `${layer.bold ? '700' : '400'} ${layer.fontSize}px "${layer.fontFamily}"`;
      context.textBaseline = 'top';
      drawTextLayer(context, layer);
    }
    if (layer.kind === 'rectangle') {
      context.fillStyle = layer.color;
      context.strokeStyle = layer.color;
      context.lineWidth = layer.stroke;
      if (layer.fill) context.fillRect(0, 0, layer.width, layer.height);
      else context.strokeRect(0, 0, layer.width, layer.height);
    }
    if (layer.kind === 'ellipse') {
      context.fillStyle = layer.color;
      context.strokeStyle = layer.color;
      context.lineWidth = layer.stroke;
      context.beginPath();
      context.ellipse(
        layer.width / 2,
        layer.height / 2,
        layer.width / 2,
        layer.height / 2,
        0,
        0,
        Math.PI * 2,
      );
      if (layer.fill) context.fill();
      else context.stroke();
    }
    if (layer.kind === 'line') {
      context.strokeStyle = layer.color;
      context.lineWidth = layer.stroke;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(layer.width, layer.height);
      context.stroke();
    }
    if (layer.kind === 'polygon') {
      context.fillStyle = layer.color;
      context.strokeStyle = layer.color;
      context.lineWidth = layer.stroke;
      context.beginPath();
      const points = shapePoints(
        Math.max(1, layer.width - layer.stroke),
        Math.max(1, layer.height - layer.stroke),
        layer.variant,
        layer.sides,
      ).map((point) => ({
        x: point.x + layer.stroke / 2,
        y: point.y + layer.stroke / 2,
      }));
      points.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.closePath();
      if (layer.fill) context.fill();
      else context.stroke();
    }
    if (layer.kind === 'path') {
      context.beginPath();
      const [first, ...rest] = layer.path.nodes;
      if (first) {
        context.moveTo(first.x, first.y);
        for (const node of rest) context.lineTo(node.x, node.y);
        if (layer.path.closed) context.closePath();
        if (layer.path.fill && layer.path.closed) {
          context.fillStyle = layer.path.fillColor;
          context.fill();
        }
        if (layer.path.stroke) {
          context.strokeStyle = layer.path.strokeColor;
          context.lineWidth = layer.path.strokeWidth;
          context.lineJoin = 'round';
          context.lineCap = 'round';
          context.stroke();
        }
      }
    }
    context.restore();
    reportProgress(layerIndex);
  }
  return out;
}
