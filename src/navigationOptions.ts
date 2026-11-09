/**
 * Persisted options for the navigation, sampling, measurement and crop tool
 * families (Zoom, Eyedropper, Count, Note, Crop). One bounded record lives in
 * the draft settings as `navigationTools`; every key is optional so older
 * drafts stay valid and absent keys use the defaults below. Validation fails
 * closed for a present-but-invalid value, like the other tool settings.
 *
 * See docs/navigation-tool-options-contract.md.
 */
import {
  DEFAULT_COUNT_GROUP,
  EYEDROPPER_SAMPLE_SIZES,
  validCountGroupName,
  type EyedropperSampleSize,
} from './measurements.ts';

export const ZOOM_MODES = ['in', 'out'] as const;
export type ZoomMode = (typeof ZOOM_MODES)[number];

export const EYEDROPPER_SAMPLE_SOURCES = ['all', 'current'] as const;
export type EyedropperSampleSource = (typeof EYEDROPPER_SAMPLE_SOURCES)[number];

/**
 * Crop constraints. `ratio` uses cropWidth:cropHeight as a free ratio;
 * `size` crops to that ratio and resamples the result to cropWidth ×
 * cropHeight pixels.
 */
export const CROP_RATIO_PRESETS = [
  'free',
  'original',
  '1:1',
  '4:5',
  '5:7',
  '2:3',
  '3:4',
  '16:9',
  'ratio',
  'size',
] as const;
export type CropRatioPreset = (typeof CROP_RATIO_PRESETS)[number];

export const CROP_OVERLAYS = ['thirds', 'grid', 'none'] as const;
export type CropOverlay = (typeof CROP_OVERLAYS)[number];

export const COUNT_LABEL_SIZE_MIN = 8;
export const COUNT_LABEL_SIZE_MAX = 72;
export const CROP_DIMENSION_MAX = 16000;
export const CROP_RESOLUTION_MAX = 2400;

export type NavigationToolSettings = {
  /** Zoom tool click direction; Alt inverts it. */
  zoomMode: ZoomMode;
  /** Drag left/right with the Zoom tool to zoom continuously. */
  scrubbyZoom: boolean;
  eyedropperSize: EyedropperSampleSize;
  eyedropperSample: EyedropperSampleSource;
  countGroup: string;
  countColor: string;
  /** Count marker label size in image pixels. */
  countLabelSize: number;
  /** Colour given to new notes. */
  noteColor: string;
  cropRatio: CropRatioPreset;
  /** Ratio width (`ratio`) or output width in px (`size`). */
  cropWidth: number;
  cropHeight: number;
  /** Output resolution written on apply; 0 keeps the document's resolution. */
  cropResolution: number;
  cropOverlay: CropOverlay;
  /** Trim raster layers to the crop instead of keeping pixels outside the canvas. */
  cropDeletePixels: boolean;
};

export const DEFAULT_NAVIGATION_TOOL_SETTINGS: Readonly<NavigationToolSettings> = Object.freeze({
  zoomMode: 'in',
  scrubbyZoom: false,
  eyedropperSize: 1,
  eyedropperSample: 'all',
  countGroup: DEFAULT_COUNT_GROUP,
  countColor: '#ff5c35',
  countLabelSize: 12,
  noteColor: '#ffb347',
  cropRatio: 'free',
  cropWidth: 1600,
  cropHeight: 900,
  cropResolution: 0,
  cropOverlay: 'thirds',
  cropDeletePixels: false,
});

const hex = (value: unknown): value is string =>
  typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value);
const integerIn = (value: unknown, min: number, max: number): value is number =>
  Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value);

type Validators = { [K in keyof NavigationToolSettings]: (value: unknown) => boolean };

const VALIDATORS: Validators = {
  zoomMode: (value) => oneOf(ZOOM_MODES, value),
  scrubbyZoom: (value) => typeof value === 'boolean',
  eyedropperSize: (value) => (EYEDROPPER_SAMPLE_SIZES as readonly unknown[]).includes(value),
  eyedropperSample: (value) => oneOf(EYEDROPPER_SAMPLE_SOURCES, value),
  countGroup: validCountGroupName,
  countColor: hex,
  countLabelSize: (value) => integerIn(value, COUNT_LABEL_SIZE_MIN, COUNT_LABEL_SIZE_MAX),
  noteColor: hex,
  cropRatio: (value) => oneOf(CROP_RATIO_PRESETS, value),
  cropWidth: (value) => integerIn(value, 1, CROP_DIMENSION_MAX),
  cropHeight: (value) => integerIn(value, 1, CROP_DIMENSION_MAX),
  cropResolution: (value) => integerIn(value, 0, CROP_RESOLUTION_MAX),
  cropOverlay: (value) => oneOf(CROP_OVERLAYS, value),
  cropDeletePixels: (value) => typeof value === 'boolean',
};

const KEYS = Object.keys(VALIDATORS) as (keyof NavigationToolSettings)[];

/** True for a plain object whose known keys all hold valid values. */
export function validNavigationToolSettings(value: unknown): value is Partial<NavigationToolSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return KEYS.every((key) => record[key] === undefined || VALIDATORS[key](record[key]));
}

/** Complete settings: valid values are kept, anything else uses the default. */
export function normalizeNavigationToolSettings(value: unknown): NavigationToolSettings {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const output = { ...DEFAULT_NAVIGATION_TOOL_SETTINGS } as Record<string, unknown>;
  for (const key of KEYS) if (record[key] !== undefined && VALIDATORS[key](record[key])) output[key] = record[key];
  return output as NavigationToolSettings;
}

/** Apply one user edit; an invalid value leaves the settings unchanged. */
export function updateNavigationToolSetting<K extends keyof NavigationToolSettings>(
  settings: NavigationToolSettings,
  key: K,
  value: NavigationToolSettings[K],
): NavigationToolSettings {
  return VALIDATORS[key](value) ? { ...settings, [key]: value } : settings;
}
