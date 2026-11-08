/**
 * Brush / Pencil blend mode ("Mode" in the tool options).
 *
 * Normal (`source-over`) keeps the legacy path: every dab is stamped straight
 * onto the gesture buffer, so Normal strokes stay byte-identical to strokes
 * painted before this option existed.
 *
 * Any other mode paints the stroke on its own transparent stroke buffer with
 * the ordinary dab arithmetic (opacity × flow per dab, scatter, colour
 * dynamics, texture and so on, all source-over against the stroke buffer), and
 * each touched rectangle of the layer is then recomposited from the
 * stroke-start pixels: `layer = original ⊕mode stroke`. Overlapping dabs of one
 * stroke therefore never blend against each other in the chosen mode (a
 * Multiply stroke does not darken itself where its dabs overlap); they only
 * build up coverage the way Normal does. Selection confinement is applied to
 * that composite, and the live preview shows the same buffer the commit stores.
 *
 * Only blend modes that Canvas 2D implements natively are offered (the same
 * list as Edit → Fill). The pixels are composited with the shared W3C
 * reference in `blendModes.ts`; this is a bounded local approximation, not a
 * claim of parity with any other editor.
 */
import {
  BLEND_MODE_GROUPS,
  NATIVE_CANVAS_BLEND_MODES,
  blendModeLabel,
  blendPixelsInPlace,
  type LayerBlendMode,
} from './blendModes.ts';
import { mixRectByMask, type PixelRect } from './selectionClip.ts';

export type BrushBlendMode = LayerBlendMode;

export const BRUSH_BLEND_DEFAULT: BrushBlendMode = 'source-over';

/** Display groups filtered to the Canvas-native modes, in menu order. */
export const BRUSH_BLEND_MODE_GROUPS: ReadonlyArray<{
  label: string;
  modes: ReadonlyArray<{ value: BrushBlendMode; label: string }>;
}> = Object.freeze(
  BLEND_MODE_GROUPS.map((group) => ({
    label: group.label,
    modes: group.modes.filter((mode) => NATIVE_CANVAS_BLEND_MODES.has(mode.value)),
  })).filter((group) => group.modes.length > 0),
);

/** Every mode the Brush and Pencil accept, Normal first. */
export const BRUSH_BLEND_MODES: readonly BrushBlendMode[] = Object.freeze(
  BRUSH_BLEND_MODE_GROUPS.flatMap((group) => group.modes.map((mode) => mode.value)),
);

export function validBrushBlendMode(value: unknown): value is BrushBlendMode {
  return typeof value === 'string' && (BRUSH_BLEND_MODES as readonly string[]).includes(value);
}

/** Unknown or missing values (older drafts and presets) are Normal. */
export function normalizeBrushBlendMode(value: unknown): BrushBlendMode {
  return validBrushBlendMode(value) ? value : BRUSH_BLEND_DEFAULT;
}

export function brushBlendModeLabel(mode: BrushBlendMode): string {
  return blendModeLabel(mode);
}

/** Tools whose strokes honour the blend mode (the Eraser and retouch tools do not). */
export function brushToolUsesBlendMode(tool: string): boolean {
  return tool === 'brush' || tool === 'pencil';
}

/**
 * True when a stroke of `tool` must be painted on a separate stroke buffer and
 * composited with `mode`; false keeps the legacy direct-stamp path.
 */
export function usesBrushBlendStroke(tool: string, mode: unknown): boolean {
  return brushToolUsesBlendMode(tool) && normalizeBrushBlendMode(mode) !== BRUSH_BLEND_DEFAULT;
}

/**
 * Composite one rectangle of a blend-mode stroke. `original` (stroke-start
 * layer pixels) and the optional selection `mask` cover the whole layer
 * (`layerWidth` wide); `stroke` and the result cover only `rect`. The result is
 * `original ⊕mode stroke`, then mixed back over `original` by the selection
 * coverage when a mask is given. Transparent stroke pixels leave the original
 * bytes untouched.
 */
export function compositeBrushBlendRect(
  original: Uint8ClampedArray,
  stroke: Uint8ClampedArray,
  layerWidth: number,
  rect: PixelRect,
  mode: BrushBlendMode,
  mask?: Uint8ClampedArray,
): Uint8ClampedArray {
  if (!validBrushBlendMode(mode)) throw new Error('Brush blend mode is invalid');
  const layerHeight = layerWidth > 0 ? original.length / 4 / layerWidth : 0;
  if (
    !Number.isInteger(layerWidth) || layerWidth <= 0 || !Number.isInteger(layerHeight) ||
    !Number.isInteger(rect.x) || !Number.isInteger(rect.y) ||
    !Number.isInteger(rect.width) || !Number.isInteger(rect.height) ||
    rect.x < 0 || rect.y < 0 || rect.width < 0 || rect.height < 0 ||
    rect.x + rect.width > layerWidth || rect.y + rect.height > layerHeight ||
    stroke.length !== rect.width * rect.height * 4 ||
    (mask !== undefined && mask.length * 4 !== original.length)
  )
    throw new Error('Brush blend stroke does not match the layer');
  const out = new Uint8ClampedArray(stroke.length);
  for (let row = 0; row < rect.height; row += 1) {
    const start = ((rect.y + row) * layerWidth + rect.x) * 4;
    out.set(original.subarray(start, start + rect.width * 4), row * rect.width * 4);
  }
  blendPixelsInPlace(out, stroke, 1, mode);
  return mask ? mixRectByMask(original, out, mask, layerWidth, rect) : out;
}

/** Whole-layer counterpart of {@link compositeBrushBlendRect} (Stroke Path with Brush). */
export function compositeBrushBlendLayer(
  original: Uint8ClampedArray,
  stroke: Uint8ClampedArray,
  layerWidth: number,
  mode: BrushBlendMode,
  mask?: Uint8ClampedArray,
): Uint8ClampedArray {
  if (original.length !== stroke.length) throw new Error('Brush blend stroke does not match the layer');
  const height = layerWidth > 0 ? original.length / 4 / layerWidth : 0;
  return compositeBrushBlendRect(original, stroke, layerWidth, { x: 0, y: 0, width: layerWidth, height }, mode, mask);
}
