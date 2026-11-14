/**
 * Truthful labels, ranges and readouts for the Filter effects panel's shared
 * `radius` and `threshold` controls (docs/filter-panel-controls-contract.md).
 *
 * Every filter stores one integer `radius`, but filters read it differently:
 * as source pixels, degrees, a fraction of the layer, a unitless detail level
 * or not at all. The panel uses these descriptors so each slider says what
 * the renderer actually does with the value.
 */
import {
  FILTER_RADIUS_MAX,
  TREE_TRUNK_RADIUS_MAX,
  distortInfluenceFraction,
  gaussianBlurSliderMax,
  treeTrunkFraction,
  type FilterEffects,
  type FilterEffectType,
} from './filterEffects.ts';

export type FilterRadiusControl = {
  label: string;
  /** Slider value for the stored record (may differ from `radius`). */
  value: number;
  min: number;
  max: number;
  /** Stored `radius` for a slider value. */
  toRadius: (value: number) => number;
  /** Readout shown next to the label, including its unit. */
  readout: (value: number) => string;
};

/**
 * Filters with no radius parameter: their output ignores `radius`, so the
 * panel shows no radius slider (Photoshop's Average, Blur, Despeckle,
 * Sharpen and Solarize have no radius either). Other hidden cases have their
 * own size control (rendered Clouds, Difference Clouds, Light Rays).
 */
export const RADIUS_FREE_FILTERS: readonly FilterEffectType[] = [
  'none', 'average-blur', 'blur', 'despeckle', 'sharpen', 'solarize',
  'deinterlace', 'ntsc-colors', 'find-edges', 'gradient-map', 'add-noise', 'light-rays',
  'difference-clouds',
  // Field Blur pins carry their own radii; a record without pins renders nothing.
  'field-blur',
];

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;
const identity = (value: number) => value;
const px = (value: number) => `${value} px`;

/** Emboss samples ±depth px, depth = round(radius / 8) clamped to 1–8. */
export function embossDepthPixels(radius: number): number {
  return Math.max(1, Math.min(8, Math.round(radius / 8)));
}

/**
 * The radius slider for a filter, or undefined when the filter has no radius.
 * `layer` is the active layer (or document) size for size-relative limits.
 */
export function filterRadiusControl(
  effect: Pick<FilterEffects, 'type' | 'radius' | 'relativeRadius' | 'cloudRender'>,
  layer?: { w: number; h: number },
): FilterRadiusControl | undefined {
  const { type, radius } = effect;
  if (RADIUS_FREE_FILTERS.includes(type)) return undefined;
  if (type === 'clouds' && effect.cloudRender) return undefined;
  const base = {
    value: radius,
    min: 1,
    max: FILTER_RADIUS_MAX,
    toRadius: identity,
    readout: px,
  };
  switch (type) {
    case 'gaussian-blur':
      return {
        ...base,
        label: 'Blur radius',
        max: Math.max(radius, gaussianBlurSliderMax(layer?.w ?? 0, layer?.h ?? 0)),
      };
    case 'blur-more':
      // Blur More is a box blur of twice the stored radius.
      return { ...base, label: 'Blur radius', readout: (value) => px(Math.min(64, value * 2)) };
    case 'high-pass':
      return { ...base, label: 'High Pass radius' };
    case 'box-blur': case 'unsharp-mask': case 'sharpen-more': case 'sharpen-edges':
    case 'smart-sharpen': case 'ai-sharpen': case 'median': case 'lens-blur': case 'iris-blur':
    case 'smart-blur': case 'surface-blur': case 'shape-blur': case 'motion-blur':
    case 'path-blur': case 'tilt-shift':
      return { ...base, label: 'Blur radius' };
    case 'mosaic': case 'crystallize': case 'facet': case 'color-halftone':
    case 'mezzotint': case 'pointillize':
      return { ...base, label: 'Cell size' };
    case 'clouds':
      // Legacy grayscale clouds use a feature size of twice the radius.
      return { ...base, label: 'Cloud scale', readout: (value) => px(Math.min(128, Math.max(2, value * 2))) };
    case 'fibers':
      return { ...base, label: 'Fiber scale', readout: (value) => px(Math.max(2, value)) };
    case 'tree':
      return {
        ...base,
        label: 'Trunk length',
        max: Math.max(TREE_TRUNK_RADIUS_MAX, Math.min(FILTER_RADIUS_MAX, radius)),
        readout: (value) => `${percent(treeTrunkFraction(value))} of shorter side`,
      };
    case 'fragment':
      return { ...base, label: 'Fragment offset' };
    case 'picture-frame':
      return { ...base, label: 'Frame width' };
    case 'flame':
      return { ...base, label: 'Flame detail', readout: (value) => String(Math.max(2, value)) };
    case 'radial-blur': case 'spin-blur':
      return { ...base, label: 'Angular sweep', readout: (value) => `${value}°` };
    case 'pinch': case 'liquify': case 'twirl': case 'spherize': {
      const name = type === 'pinch' ? 'Pinch' : type === 'liquify' ? 'Liquify' : type === 'twirl' ? 'Twirl' : 'Spherize';
      return {
        ...base,
        label: `${name} radius`,
        readout: (value) => `${percent(distortInfluenceFraction(value))} of shorter side`,
      };
    }
    case 'polar-coordinates':
      // The full source height is reached at radius / 64 × half the shorter side.
      return {
        ...base,
        label: 'Polar radius',
        readout: (value) => `${percent(value / FILTER_RADIUS_MAX / 2)} of shorter side`,
      };
    case 'lens-flare':
      return {
        ...base,
        label: 'Flare size',
        readout: (value) => `${percent((value / FILTER_RADIUS_MAX) * 0.92)} of shorter side`,
      };
    case 'lens-correction': case 'adaptive-wide-angle':
      return effect.relativeRadius
        ? {
          ...base,
          label: 'Correction radius',
          readout: (value) => `${percent(value / FILTER_RADIUS_MAX)} of half diagonal`,
        }
        : { ...base, label: 'Correction radius' };
    case 'emboss':
      // The slider works in the real 1–8 px sampling depth; the stored
      // radius is depth × 8, so legacy radii keep their rendering.
      return {
        label: 'Emboss depth',
        value: embossDepthPixels(radius),
        min: 1,
        max: 8,
        toRadius: (value) => Math.max(1, Math.min(8, Math.round(value))) * 8,
        readout: px,
      };
    case 'wave':
      return { ...base, label: 'Wave length' };
    case 'shear':
      return { ...base, label: 'Shear displacement' };
    case 'zigzag':
      return { ...base, label: 'ZigZag wavelength' };
    case 'displace':
      return { ...base, label: 'Displace wavelength' };
    case 'reflection-removal':
      return { ...base, label: 'Cleanup radius' };
    case 'neural-enhance':
      return { ...base, label: 'Neighbourhood radius' };
    default:
      return { ...base, label: 'Radius' };
  }
}

export type FilterThresholdControl = { label: string; fallback: number };

/** The 0–255 level threshold slider of the noise-cleanup filters. */
export function filterThresholdControl(type: FilterEffectType): FilterThresholdControl | undefined {
  switch (type) {
    case 'dust-scratches': return { label: 'Outlier threshold', fallback: 12 };
    case 'reduce-noise': return { label: 'Preserve details', fallback: 25 };
    case 'ai-denoise': return { label: 'Edge protection', fallback: 18 };
    case 'ai-sharpen': return { label: 'Edge threshold', fallback: 22 };
    case 'reflection-removal': return { label: 'Reflection threshold', fallback: 28 };
    default: return undefined;
  }
}

/** Readout for a 0–255 level threshold. */
export const levelsReadout = (value: number) => `${value} / 255`;

/**
 * Path Blur's centre is only read by legacy records without an authored
 * motion path, so the centre sliders are shown only for those.
 */
export function pathBlurUsesCenter(effect: Pick<FilterEffects, 'type' | 'path'>): boolean {
  return effect.type === 'path-blur' && !(effect.path && effect.path.length >= 2);
}
