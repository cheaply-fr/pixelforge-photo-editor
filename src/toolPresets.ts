import { BRUSH_DEFAULT_ANGLE, BRUSH_DEFAULT_ROUNDNESS, BRUSH_DEFAULT_SPACING, BRUSH_SPACING_MAX, BRUSH_SPACING_MIN } from './brush.ts';
import { BRUSH_BLEND_DEFAULT, validBrushBlendMode, type BrushBlendMode } from './brushBlend.ts';
import {
  BRUSH_SCATTER_MAX,
  DEFAULT_BRUSH_DYNAMICS,
  normalizeBrushDynamics,
  validBrushDynamics,
  type BrushDynamics,
} from './brushDynamics.ts';
import { browserPresetStorage } from './brushPresetLibrary.ts';
import { validBrushPresetId, type BrushPresetId } from './brushPresets.ts';
import { validBrushPressureCurve, type BrushPressureCurve } from './brushPressure.ts';
import { normalizeSecondaryBrushPreset, type SecondaryBrushPreset } from './brushSecondary.ts';
import { validBrushSize } from './brushSize.ts';
import { type SelectionOperation } from './document.ts';
import { FONT_PREVIEW_SIZES, type FontPreviewSize } from './fontPreview.ts';
import { isSelectableFontFamily } from './fontLibrary.ts';
import { GRADIENT_BLEND_DEFAULT, validGradientBlendMode, type GradientBlendMode } from './gradientBlend.ts';
import { isGradientStops, normalizeGradientStops, type GradientStop } from './gradientStops.ts';
import {
  DEFAULT_ART_HISTORY_BRUSH,
  DEFAULT_HISTORY_BRUSH,
  DEFAULT_MIXER_BRUSH,
  effectiveArtHistoryBrush,
  effectiveHistoryBrush,
  effectiveMixerBrush,
  validArtHistoryBrushSettings,
  validHistoryBrushSettings,
  validMixerBrushSettings,
  type ArtHistoryBrushSettings,
  type HistoryBrushSettings,
  type MixerBrushSettings,
} from './mixerHistoryBrush.ts';
import { DEFAULT_PAINT_SYMMETRY, normalizePaintSymmetry, validPaintSymmetry, type PaintSymmetrySettings } from './paintSymmetry.ts';
import { PATTERN_MAX_TILE, PATTERN_MIN_TILE, validPatternId, type PatternId } from './patternStamp.ts';
import { SPONGE_MODES, TONAL_RANGES, type SpongeMode, type TonalRange } from './tonal.ts';
import type { ParametricShapeVariant } from './vectorShapes.ts';

/**
 * Tool presets: named, device-local snapshots of one tool's options.
 *
 * Everything here is pure: the editor passes in its current option values
 * (`ToolSettingValues`) and receives plain objects back to apply through its
 * own setters. Presets hold settings only — never pixels, document content
 * other than the Text tool's default string, credentials or remote
 * references.
 *
 * How to add an option (for example new Smudge options):
 *   1. Add the key and its type to `ToolSettingValues`.
 *   2. Add a `TOOL_SETTING_FIELDS` entry with its default and a strict `parse`
 *      (return `undefined` for anything invalid).
 *   3. Append the key to each tool's list in `TOOL_PRESET_FIELDS`.
 *   4. Add the getter/setter binding in the editor (TypeScript requires it).
 * Presets saved before the option existed simply omit it and the option is
 * applied at its default. Presets naming a key the build does not know are
 * rejected, never partially applied.
 */

export type ToolSettingValues = {
  color: string;
  backgroundColor: string;
  size: number;
  hardness: number;
  brushOpacity: number;
  brushBlendMode: BrushBlendMode;
  brushPreset: BrushPresetId;
  spacing: number;
  brushSmoothing: number;
  brushScatter: number;
  brushDynamics: BrushDynamics;
  brushTexture: number;
  brushDual: number;
  brushBristle: number;
  brushWetEdges: number;
  brushBuildUp: number;
  brushFlow: number;
  angle: number;
  roundness: number;
  flipX: boolean;
  flipY: boolean;
  pressureSize: boolean;
  pressureOpacity: boolean;
  pressureCurve: BrushPressureCurve;
  secondaryBrushPreset: SecondaryBrushPreset;
  paintSymmetry: PaintSymmetrySettings;
  patternId: PatternId;
  patternTileSize: number;
  redEyeThreshold: number;
  redEyeAmount: number;
  colorTolerance: number;
  tonalExposure: number;
  tonalRange: TonalRange;
  spongeMode: SpongeMode;
  spongeVibrance: number;
  mixerBrush: MixerBrushSettings;
  historyBrush: HistoryBrushSettings;
  artHistoryBrush: ArtHistoryBrushSettings;
  gradientMode: 'linear' | 'radial' | 'reflected';
  gradientEnd: 'transparent' | 'background';
  gradientMidpoint: string;
  gradientMidpointPosition: number;
  gradientReverse: boolean;
  gradientDither: number;
  gradientNoise: number;
  gradientBlend: GradientBlendMode;
  gradientOpacity: number;
  gradientStops: GradientStop[];
  polygonVariant: ParametricShapeVariant;
  polygonSides: number;
  polygonInnerRadius: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontPreviewSize: FontPreviewSize;
  selectionOperation: SelectionOperation;
};

export type ToolSettingKey = keyof ToolSettingValues;

/**
 * `color` fields are only stored when a preset opts in with "Include colour"
 * and are never touched by Reset Tool / Reset All Tools (the swatches are
 * shared by every tool). `size` fields follow "Include brush size".
 */
export type ToolSettingCategory = 'option' | 'color' | 'size';

export type ToolSettingField<V> = {
  label: string;
  category: ToolSettingCategory;
  default: V;
  /** Strictly validate and normalise a stored value; `undefined` means invalid. */
  parse: (value: unknown) => V | undefined;
};

const HEX_COLOR = /^#[a-f\d]{6}$/i;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const num =
  (min: number, max: number, integer = false) =>
  (value: unknown): number | undefined =>
    finite(value) && value >= min && value <= max && (!integer || Number.isInteger(value)) ? value : undefined;
const bool = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);
const oneOf =
  <T extends string>(values: readonly T[]) =>
  (value: unknown): T | undefined =>
    typeof value === 'string' && (values as readonly string[]).includes(value) ? (value as T) : undefined;
const hex = (value: unknown): string | undefined =>
  typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : undefined;
const option = <V>(label: string, defaultValue: V, parse: (value: unknown) => V | undefined): ToolSettingField<V> => ({
  label,
  category: 'option',
  default: defaultValue,
  parse,
});

/** Longest Text-tool string a preset may carry. */
export const TOOL_PRESET_TEXT_MAX = 1000;

/** Defaults mirror the editor's initial option state. */
export const TOOL_SETTING_FIELDS: { readonly [K in ToolSettingKey]: ToolSettingField<ToolSettingValues[K]> } = {
  color: { label: 'Foreground colour', category: 'color', default: '#ff5c35', parse: hex },
  backgroundColor: { label: 'Background colour', category: 'color', default: '#ffffff', parse: hex },
  size: { label: 'Size', category: 'size', default: 18, parse: (value) => (validBrushSize(value) ? value : undefined) },
  hardness: option('Hardness', 100, num(0, 100)),
  brushOpacity: option('Opacity', 100, num(1, 100)),
  brushBlendMode: option<BrushBlendMode>('Mode', BRUSH_BLEND_DEFAULT, (value) => (validBrushBlendMode(value) ? value : undefined)),
  brushPreset: option<BrushPresetId>('Brush tip', 'round-hard', (value) => (validBrushPresetId(value) ? value : undefined)),
  spacing: option('Spacing', BRUSH_DEFAULT_SPACING, num(BRUSH_SPACING_MIN, BRUSH_SPACING_MAX)),
  brushSmoothing: option('Smoothing', 0, num(0, 100)),
  brushScatter: option('Scatter', 0, num(0, BRUSH_SCATTER_MAX)),
  brushDynamics: option<BrushDynamics>('Brush dynamics', { ...DEFAULT_BRUSH_DYNAMICS }, (value) =>
    validBrushDynamics(value) ? normalizeBrushDynamics(value) : undefined,
  ),
  brushTexture: option('Texture', 0, num(0, 100)),
  brushDual: option('Dual brush', 0, num(0, 100)),
  brushBristle: option('Bristle', 0, num(0, 100)),
  brushWetEdges: option('Wet edges', 0, num(0, 100)),
  brushBuildUp: option('Build-up', 0, num(0, 100)),
  brushFlow: option('Flow', 100, num(1, 100)),
  angle: option('Angle', BRUSH_DEFAULT_ANGLE, num(-180, 180)),
  roundness: option('Roundness', BRUSH_DEFAULT_ROUNDNESS, num(1, 100)),
  flipX: option('Flip tip horizontal', false, bool),
  flipY: option('Flip tip vertical', false, bool),
  pressureSize: option('Pressure affects size', false, bool),
  pressureOpacity: option('Pressure affects opacity', false, bool),
  pressureCurve: option<BrushPressureCurve>('Pressure curve', 'linear', (value) => (validBrushPressureCurve(value) ? value : undefined)),
  secondaryBrushPreset: option<SecondaryBrushPreset>('Secondary brush tip', 'none', (value) =>
    typeof value === 'string' && normalizeSecondaryBrushPreset(value) === value ? (value as SecondaryBrushPreset) : undefined,
  ),
  paintSymmetry: option<PaintSymmetrySettings>('Paint symmetry', { ...DEFAULT_PAINT_SYMMETRY }, (value) =>
    validPaintSymmetry(value) ? normalizePaintSymmetry(value) : undefined,
  ),
  patternId: option<PatternId>('Pattern', 'checker', (value) => (validPatternId(value) ? value : undefined)),
  patternTileSize: option('Tile size', 32, num(PATTERN_MIN_TILE, PATTERN_MAX_TILE, true)),
  redEyeThreshold: option('Red threshold', 36, num(0, 255)),
  redEyeAmount: option('Correction amount', 100, num(0, 100)),
  colorTolerance: option('Color tolerance', 24, num(0, 255)),
  tonalExposure: option('Exposure', 50, num(1, 100)),
  tonalRange: option<TonalRange>('Tonal range', 'midtones', oneOf(TONAL_RANGES)),
  spongeMode: option<SpongeMode>('Sponge mode', 'saturate', oneOf(SPONGE_MODES)),
  spongeVibrance: option('Vibrance', 50, num(1, 100)),
  mixerBrush: option<MixerBrushSettings>('Mixer settings', { ...DEFAULT_MIXER_BRUSH }, (value) =>
    validMixerBrushSettings(value) ? effectiveMixerBrush(value) : undefined,
  ),
  historyBrush: option<HistoryBrushSettings>('History settings', { ...DEFAULT_HISTORY_BRUSH }, (value) =>
    validHistoryBrushSettings(value) ? effectiveHistoryBrush(value) : undefined,
  ),
  artHistoryBrush: option<ArtHistoryBrushSettings>('Art History settings', { ...DEFAULT_ART_HISTORY_BRUSH }, (value) =>
    validArtHistoryBrushSettings(value) ? effectiveArtHistoryBrush(value) : undefined,
  ),
  gradientMode: option<'linear' | 'radial' | 'reflected'>('Gradient type', 'linear', oneOf(['linear', 'radial', 'reflected'] as const)),
  gradientEnd: option<'transparent' | 'background'>('Gradient end', 'transparent', oneOf(['transparent', 'background'] as const)),
  gradientMidpoint: option('Midpoint colour', 'none', (value) => (value === 'none' ? 'none' : hex(value))),
  gradientMidpointPosition: option('Midpoint position', 50, num(1, 99)),
  gradientReverse: option('Reverse gradient', false, bool),
  gradientDither: option('Dither', 0, num(0, 100)),
  gradientNoise: option('Noise', 0, num(0, 100)),
  gradientBlend: option<GradientBlendMode>('Gradient mode', GRADIENT_BLEND_DEFAULT, (value) => (validGradientBlendMode(value) ? value : undefined)),
  gradientOpacity: option('Gradient opacity', 100, num(1, 100)),
  gradientStops: option<GradientStop[]>('Colour stops', [], (value) => (isGradientStops(value) ? normalizeGradientStops(value) : undefined)),
  polygonVariant: option<ParametricShapeVariant>('Polygon variant', 'polygon', oneOf(['polygon', 'triangle', 'star'] as const)),
  polygonSides: option('Polygon sides', 5, num(3, 32, true)),
  polygonInnerRadius: option('Star inner radius', 0.5, num(0.1, 0.9)),
  text: option('Text content', 'Your text', (value) =>
    typeof value === 'string' && value.length <= TOOL_PRESET_TEXT_MAX ? value : undefined,
  ),
  fontFamily: option<string>('Font', 'Arial', (value) => (isSelectableFontFamily(value) ? value : undefined)),
  fontSize: { label: 'Font size', category: 'size', default: 56, parse: num(16, 160) },
  fontPreviewSize: option<FontPreviewSize>('Font preview size', 'medium', oneOf(FONT_PREVIEW_SIZES)),
  selectionOperation: option<SelectionOperation>('Selection mode', 'replace', oneOf(['replace', 'add', 'subtract', 'intersect'] as const)),
};

export const TOOL_SETTING_KEYS = Object.keys(TOOL_SETTING_FIELDS) as ToolSettingKey[];

const TIP: ToolSettingKey[] = ['spacing', 'angle', 'roundness', 'flipX', 'flipY'];
const PRESSURE: ToolSettingKey[] = ['pressureSize', 'pressureOpacity'];
const STROKE_DYNAMICS: ToolSettingKey[] = [
  'brushSmoothing',
  'brushScatter',
  'brushDynamics',
  'brushTexture',
  'brushDual',
  'brushBristle',
  'brushWetEdges',
  'brushBuildUp',
  'brushFlow',
  'secondaryBrushPreset',
  'paintSymmetry',
];
const BASIC: ToolSettingKey[] = ['size', 'hardness', 'brushOpacity'];

/**
 * Which options each tool's preset captures, matching the controls the tool
 * shows. PixelForge shares several option values (Size, Hardness, Opacity,
 * tip shape…) between related tools, so applying or resetting one tool's
 * preset also updates those shared values for its siblings.
 */
export const TOOL_PRESET_FIELDS = {
  brush: ['color', 'backgroundColor', ...BASIC, 'brushPreset', 'brushBlendMode', ...TIP, ...STROKE_DYNAMICS, ...PRESSURE, 'pressureCurve'],
  pencil: ['color', 'backgroundColor', 'size', 'brushOpacity', 'brushPreset', 'brushBlendMode', ...TIP, ...STROKE_DYNAMICS, 'pressureCurve'],
  eraser: [...BASIC, ...TIP, ...STROKE_DYNAMICS, ...PRESSURE, 'pressureCurve'],
  'background-eraser': [...BASIC, 'colorTolerance', ...PRESSURE],
  'magic-eraser': ['colorTolerance'],
  'color-replace': ['color', 'size', 'brushOpacity', 'colorTolerance'],
  'mixer-brush': ['color', ...BASIC, ...PRESSURE, 'mixerBrush'],
  'history-brush': [...BASIC, ...PRESSURE, 'historyBrush'],
  'art-history-brush': [...BASIC, ...PRESSURE, 'artHistoryBrush'],
  smudge: [...BASIC],
  blur: [...BASIC, ...PRESSURE],
  sharpen: [...BASIC, ...PRESSURE],
  dodge: [...BASIC, 'tonalExposure', 'tonalRange'],
  burn: [...BASIC, 'tonalExposure', 'tonalRange'],
  sponge: [...BASIC, 'spongeMode', 'spongeVibrance'],
  clone: [...BASIC, ...TIP, ...PRESSURE, 'pressureCurve'],
  heal: [...BASIC, ...TIP, ...PRESSURE, 'pressureCurve'],
  'spot-heal': [...BASIC],
  patch: [...BASIC],
  'pattern-stamp': ['color', 'backgroundColor', ...BASIC, ...TIP, ...PRESSURE, 'pressureCurve', 'patternId', 'patternTileSize'],
  'red-eye': ['size', 'redEyeThreshold', 'redEyeAmount'],
  'mask-brush': [...BASIC],
  'mask-eraser': [...BASIC],
  'adjustment-brush': [...BASIC],
  gradient: [
    'color',
    'backgroundColor',
    'gradientMode',
    'gradientEnd',
    'gradientMidpoint',
    'gradientMidpointPosition',
    'gradientStops',
    'gradientBlend',
    'gradientOpacity',
    'gradientDither',
    'gradientNoise',
    'gradientReverse',
  ],
  text: ['color', 'text', 'fontFamily', 'fontSize', 'fontPreviewSize'],
  rectangle: ['color', 'size'],
  ellipse: ['color', 'size'],
  line: ['color', 'size'],
  polygon: ['color', 'size', 'polygonVariant', 'polygonSides', 'polygonInnerRadius'],
  select: ['selectionOperation'],
  'ellipse-select': ['selectionOperation'],
  'row-select': ['selectionOperation'],
  'column-select': ['selectionOperation'],
  lasso: ['selectionOperation'],
  'polygonal-lasso': ['selectionOperation'],
  'magnetic-lasso': ['selectionOperation'],
  'magic-wand': ['selectionOperation'],
  'selection-brush': [...BASIC, ...PRESSURE, 'selectionOperation'],
  'quick-selection': [...BASIC, 'colorTolerance', 'selectionOperation'],
} as const satisfies Record<string, readonly ToolSettingKey[]>;

export type PresetTool = keyof typeof TOOL_PRESET_FIELDS;
export const PRESET_TOOLS = Object.keys(TOOL_PRESET_FIELDS) as PresetTool[];

export const PRESET_TOOL_LABELS: Readonly<Record<PresetTool, string>> = {
  brush: 'Brush',
  pencil: 'Pencil',
  eraser: 'Eraser',
  'background-eraser': 'Background Eraser',
  'magic-eraser': 'Magic Eraser',
  'color-replace': 'Color Replace',
  'mixer-brush': 'Mixer Brush',
  'history-brush': 'History Brush',
  'art-history-brush': 'Art History Brush',
  smudge: 'Smudge',
  blur: 'Blur',
  sharpen: 'Sharpen',
  dodge: 'Dodge',
  burn: 'Burn',
  sponge: 'Sponge',
  clone: 'Clone',
  heal: 'Healing',
  'spot-heal': 'Spot Healing',
  patch: 'Patch',
  'pattern-stamp': 'Pattern Stamp',
  'red-eye': 'Red Eye',
  'mask-brush': 'Mask Brush',
  'mask-eraser': 'Mask Eraser',
  'adjustment-brush': 'Adjustment Brush',
  gradient: 'Gradient',
  text: 'Text',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  polygon: 'Polygon',
  select: 'Rectangular Marquee',
  'ellipse-select': 'Elliptical Marquee',
  'row-select': 'Single Row Marquee',
  'column-select': 'Single Column Marquee',
  lasso: 'Lasso',
  'polygonal-lasso': 'Polygonal Lasso',
  'magnetic-lasso': 'Magnetic Lasso',
  'magic-wand': 'Magic Wand',
  'selection-brush': 'Selection Brush',
  'quick-selection': 'Quick Selection',
};

export function isPresetTool(tool: unknown): tool is PresetTool {
  return typeof tool === 'string' && Object.prototype.hasOwnProperty.call(TOOL_PRESET_FIELDS, tool);
}

export function toolPresetFields(tool: PresetTool): readonly ToolSettingKey[] {
  return TOOL_PRESET_FIELDS[tool];
}

/** True when the tool has a field of this category (so the matching "Include" option is meaningful). */
export function toolHasCategory(tool: PresetTool, category: ToolSettingCategory): boolean {
  return toolPresetFields(tool).some((key) => TOOL_SETTING_FIELDS[key].category === category);
}

const clone = <V>(value: V): V => (value !== null && typeof value === 'object' ? (JSON.parse(JSON.stringify(value)) as V) : value);

/** Deterministic JSON with sorted object keys, for equality checks. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

/** Fresh copy of every option's default. */
export function defaultToolSettingValues(): ToolSettingValues {
  const values: Partial<Record<ToolSettingKey, unknown>> = {};
  for (const key of TOOL_SETTING_KEYS) values[key] = clone(TOOL_SETTING_FIELDS[key].default);
  return values as ToolSettingValues;
}

export type ToolPresetInclude = { includeColor: boolean; includeSize: boolean };

const included = (key: ToolSettingKey, include: ToolPresetInclude) => {
  const { category } = TOOL_SETTING_FIELDS[key];
  return category === 'option' || (category === 'color' ? include.includeColor : include.includeSize);
};

export const TOOL_PRESET_LIMIT = 100;
export const TOOL_PRESET_LABEL_MAX = 80;
/** Upper bound for the serialized device library. */
export const TOOL_PRESET_STORAGE_MAX_BYTES = 256 * 1024;
/** Upper bound for an imported preset file. */
export const TOOL_PRESET_IMPORT_MAX_BYTES = 512 * 1024;
export const TOOL_PRESET_STORAGE_KEY = 'pixelforge.tool-presets.v1';
export const TOOL_PRESET_EXPORT_FORMAT = 'pixelforge-tool-presets';
const STORAGE_VERSION = 1;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;

export type ToolPreset = {
  id: string;
  label: string;
  tool: PresetTool;
  includeColor: boolean;
  includeSize: boolean;
  /** Captured values; colour/size keys are present only when included. Missing option keys apply as defaults. */
  settings: Partial<ToolSettingValues>;
};

const plainRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const cleanLabel = (label: unknown) => (typeof label === 'string' ? label.trim().slice(0, TOOL_PRESET_LABEL_MAX) : '');

/**
 * Strictly validate and normalise one preset. Unknown preset keys, settings
 * the tool does not use, excluded colour/size values and invalid values all
 * reject the whole preset (`undefined`).
 */
export function parseToolPreset(value: unknown): ToolPreset | undefined {
  if (!plainRecord(value)) return undefined;
  const allowed = new Set(['id', 'label', 'tool', 'includeColor', 'includeSize', 'settings']);
  if (Object.keys(value).some((key) => !allowed.has(key))) return undefined;
  const { id, label, tool, includeColor, includeSize, settings } = value;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return undefined;
  if (typeof label !== 'string' || label.length > TOOL_PRESET_LABEL_MAX * 2) return undefined;
  const trimmed = cleanLabel(label);
  if (!trimmed) return undefined;
  if (!isPresetTool(tool) || typeof includeColor !== 'boolean' || typeof includeSize !== 'boolean') return undefined;
  if (!plainRecord(settings)) return undefined;
  const fields = new Set<string>(toolPresetFields(tool));
  const parsed: Partial<Record<ToolSettingKey, unknown>> = {};
  for (const [key, raw] of Object.entries(settings)) {
    if (!fields.has(key)) return undefined;
    const settingKey = key as ToolSettingKey;
    if (!included(settingKey, { includeColor, includeSize })) return undefined;
    const next = TOOL_SETTING_FIELDS[settingKey].parse(raw);
    if (next === undefined) return undefined;
    parsed[settingKey] = clone(next);
  }
  return { id, label: trimmed, tool, includeColor, includeSize, settings: parsed as Partial<ToolSettingValues> };
}

export function validToolPreset(value: unknown): value is ToolPreset {
  return parseToolPreset(value) !== undefined;
}

/** Capture the tool's current options into a preset. Throws for an empty name or bad id. */
export function createToolPreset(
  id: string,
  label: string,
  tool: PresetTool,
  current: ToolSettingValues,
  include: ToolPresetInclude,
): ToolPreset {
  const trimmed = cleanLabel(label);
  if (!trimmed) throw new Error('Tool preset name cannot be empty');
  const settings: Partial<Record<ToolSettingKey, unknown>> = {};
  for (const key of toolPresetFields(tool)) if (included(key, include)) settings[key] = clone(current[key]);
  const preset = parseToolPreset({ id, label: trimmed, tool, ...include, settings });
  if (!preset) throw new Error('Tool preset values are invalid');
  return preset;
}

/**
 * The values applying `preset` sets: every captured option, defaults for
 * options the preset predates, and colour/size only when included.
 */
export function resolveToolPresetSettings(preset: ToolPreset): Partial<ToolSettingValues> {
  const values: Partial<Record<ToolSettingKey, unknown>> = {};
  for (const key of toolPresetFields(preset.tool)) {
    if (!included(key, preset)) continue;
    const stored = preset.settings[key];
    values[key] = clone(stored === undefined ? TOOL_SETTING_FIELDS[key].default : stored);
  }
  return values as Partial<ToolSettingValues>;
}

/** True when the current options equal what applying the preset would set. */
export function toolPresetMatches(preset: ToolPreset, current: ToolSettingValues): boolean {
  const resolved = resolveToolPresetSettings(preset) as Record<string, unknown>;
  return Object.entries(resolved).every(
    ([key, value]) => stableStringify(value) === stableStringify(current[key as ToolSettingKey]),
  );
}

/** Option keys (not colours) whose current value differs from the tool's defaults. */
export function modifiedToolSettings(tool: PresetTool, current: ToolSettingValues): ToolSettingKey[] {
  return toolPresetFields(tool).filter(
    (key) =>
      TOOL_SETTING_FIELDS[key].category !== 'color' &&
      stableStringify(current[key]) !== stableStringify(TOOL_SETTING_FIELDS[key].default),
  );
}

/** Reset Tool: defaults for every option the tool uses (swatch colours are left alone). */
export function toolDefaultSettings(tool: PresetTool): Partial<ToolSettingValues> {
  const values: Partial<Record<ToolSettingKey, unknown>> = {};
  for (const key of toolPresetFields(tool))
    if (TOOL_SETTING_FIELDS[key].category !== 'color') values[key] = clone(TOOL_SETTING_FIELDS[key].default);
  return values as Partial<ToolSettingValues>;
}

/** Reset All Tools: defaults for every tool option (swatch colours are left alone). */
export function allToolDefaultSettings(): Partial<ToolSettingValues> {
  const values: Partial<Record<ToolSettingKey, unknown>> = {};
  for (const tool of PRESET_TOOLS) Object.assign(values, toolDefaultSettings(tool));
  return values as Partial<ToolSettingValues>;
}

/** Validate a list, dropping invalid entries and duplicate ids, keeping the first {@link TOOL_PRESET_LIMIT}. */
export function normalizeToolPresets(value: unknown): ToolPreset[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>(),
    presets: ToolPreset[] = [];
  for (const item of value) {
    const preset = parseToolPreset(item);
    if (!preset || seen.has(preset.id)) continue;
    seen.add(preset.id);
    presets.push(preset);
    if (presets.length >= TOOL_PRESET_LIMIT) break;
  }
  return presets;
}

/** Append a preset; throws when the library is full. */
export function addToolPreset(presets: readonly ToolPreset[], preset: ToolPreset): ToolPreset[] {
  if (presets.length >= TOOL_PRESET_LIMIT) throw new Error(`Tool preset limit reached (${TOOL_PRESET_LIMIT}); delete a preset first`);
  if (presets.some((item) => item.id === preset.id)) throw new Error('Tool preset already exists');
  return [...presets, preset];
}

export function renameToolPreset(presets: readonly ToolPreset[], id: string, label: string): ToolPreset[] {
  const trimmed = cleanLabel(label);
  if (!trimmed) throw new Error('Tool preset name cannot be empty');
  if (!presets.some((preset) => preset.id === id)) throw new Error('Tool preset not found');
  return presets.map((preset) => (preset.id === id ? { ...preset, label: trimmed } : preset));
}

/** Copy a preset (new id, "… copy" name) directly after the original. */
export function duplicateToolPreset(presets: readonly ToolPreset[], id: string, newId: string): ToolPreset[] {
  const index = presets.findIndex((preset) => preset.id === id);
  if (index < 0) throw new Error('Tool preset not found');
  const source = presets[index];
  const copy = parseToolPreset({ ...clone(source), id: newId, label: `${source.label.slice(0, TOOL_PRESET_LABEL_MAX - 5)} copy` });
  if (!copy) throw new Error('Tool preset could not be duplicated');
  if (presets.length >= TOOL_PRESET_LIMIT) throw new Error(`Tool preset limit reached (${TOOL_PRESET_LIMIT}); delete a preset first`);
  return [...presets.slice(0, index + 1), copy, ...presets.slice(index + 1)];
}

export function deleteToolPreset(presets: readonly ToolPreset[], id: string): ToolPreset[] {
  return presets.filter((preset) => preset.id !== id);
}

/** Replace a preset's captured values with the current options (keeping name, tool and include flags). */
export function updateToolPreset(presets: readonly ToolPreset[], id: string, current: ToolSettingValues): ToolPreset[] {
  const existing = presets.find((preset) => preset.id === id);
  if (!existing) throw new Error('Tool preset not found');
  const next = createToolPreset(existing.id, existing.label, existing.tool, current, existing);
  return presets.map((preset) => (preset.id === id ? next : preset));
}

/** Move a preset to an absolute index (clamped); used by drag and drop. */
export function moveToolPresetTo(presets: readonly ToolPreset[], id: string, targetIndex: number): ToolPreset[] {
  const from = presets.findIndex((preset) => preset.id === id);
  if (from < 0 || !Number.isFinite(targetIndex)) return [...presets];
  const to = Math.max(0, Math.min(presets.length - 1, Math.round(targetIndex)));
  const next = [...presets];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Move a preset up (-1) or down (+1) past the neighbouring preset within the
 * visible subset (`visibleIds`), so filtered lists reorder intuitively.
 */
export function moveToolPreset(
  presets: readonly ToolPreset[],
  id: string,
  direction: -1 | 1,
  visibleIds?: readonly string[],
): ToolPreset[] {
  const visible = visibleIds ?? presets.map((preset) => preset.id);
  const position = visible.indexOf(id);
  const neighbour = visible[position + direction];
  if (position < 0 || neighbour === undefined) return [...presets];
  return moveToolPresetTo(presets, id, presets.findIndex((preset) => preset.id === neighbour));
}

/** Presets for one tool (or all when `tool` is null) whose name or tool name contains the query. */
export function filterToolPresets(
  presets: readonly ToolPreset[],
  { tool, query }: { tool: PresetTool | null; query?: string },
): ToolPreset[] {
  const needle = (query ?? '').trim().toLowerCase();
  return presets.filter(
    (preset) =>
      (tool === null || preset.tool === tool) &&
      (!needle ||
        preset.label.toLowerCase().includes(needle) ||
        PRESET_TOOL_LABELS[preset.tool].toLowerCase().includes(needle)),
  );
}

/** Serialize the device library envelope; throws when it would exceed the storage bound. */
export function serializeToolPresetLibrary(presets: readonly ToolPreset[]): string {
  const text = JSON.stringify({ version: STORAGE_VERSION, presets: normalizeToolPresets(presets) });
  if (text.length > TOOL_PRESET_STORAGE_MAX_BYTES) throw new Error('Tool presets exceed the device storage limit');
  return text;
}

/** Parse the device library; corrupt, oversized or unknown-version data yields []. */
export function parseToolPresetLibrary(raw: unknown): ToolPreset[] {
  if (typeof raw !== 'string' || !raw || raw.length > TOOL_PRESET_STORAGE_MAX_BYTES) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!plainRecord(parsed) || parsed.version !== STORAGE_VERSION) return [];
    return normalizeToolPresets(parsed.presets);
  } catch {
    return [];
  }
}

type PresetStorage = Pick<Storage, 'getItem' | 'setItem'>;

export { browserPresetStorage };

export function readStoredToolPresets(storage: PresetStorage | undefined | null): ToolPreset[] {
  try {
    return storage ? parseToolPresetLibrary(storage.getItem(TOOL_PRESET_STORAGE_KEY)) : [];
  } catch {
    return [];
  }
}

/** Persist the library; false when storage is unavailable, full or the library is too large. */
export function writeStoredToolPresets(storage: PresetStorage | undefined | null, presets: readonly ToolPreset[]): boolean {
  try {
    if (!storage) return false;
    storage.setItem(TOOL_PRESET_STORAGE_KEY, serializeToolPresetLibrary(presets));
    return true;
  } catch {
    return false;
  }
}

/** JSON file contents for Export (settings only). */
export function exportToolPresets(presets: readonly ToolPreset[]): string {
  return JSON.stringify(
    { format: TOOL_PRESET_EXPORT_FORMAT, version: STORAGE_VERSION, presets: normalizeToolPresets(presets) },
    null,
    2,
  );
}

export type ToolPresetImport = { presets: ToolPreset[]; rejected: number };

/**
 * Parse an exported file (or a raw device-library envelope). Throws for an
 * oversized, non-JSON or wrong-format file; individual invalid presets are
 * dropped and counted.
 */
export function parseToolPresetImport(text: unknown): ToolPresetImport {
  if (typeof text !== 'string' || !text.trim()) throw new Error('The tool preset file is empty');
  if (text.length > TOOL_PRESET_IMPORT_MAX_BYTES) throw new Error('The tool preset file is too large (512 KB maximum)');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The tool preset file is not valid JSON');
  }
  if (!plainRecord(parsed) || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.presets))
    throw new Error('The file is not a PixelForge tool preset export');
  if (parsed.format !== undefined && parsed.format !== TOOL_PRESET_EXPORT_FORMAT)
    throw new Error('The file is not a PixelForge tool preset export');
  const valid: ToolPreset[] = [];
  let rejected = 0;
  for (const item of parsed.presets) {
    const preset = parseToolPreset(item);
    if (preset) valid.push(preset);
    else rejected += 1;
  }
  return { presets: valid, rejected };
}

/**
 * Append imported presets. Imports whose id already exists get a fresh id
 * from `makeId` (so nothing on the device is overwritten); presets beyond
 * the limit are skipped.
 */
export function mergeImportedToolPresets(
  existing: readonly ToolPreset[],
  imported: readonly ToolPreset[],
  makeId: () => string,
): { presets: ToolPreset[]; added: number; skipped: number } {
  const presets = [...existing],
    ids = new Set(existing.map((preset) => preset.id));
  let added = 0,
    skipped = 0;
  for (const preset of imported) {
    if (presets.length >= TOOL_PRESET_LIMIT) {
      skipped += 1;
      continue;
    }
    let id = preset.id;
    for (let attempt = 0; ids.has(id) && attempt < 8; attempt += 1) id = makeId();
    if (ids.has(id) || !ID_PATTERN.test(id)) {
      skipped += 1;
      continue;
    }
    ids.add(id);
    presets.push({ ...clone(preset), id });
    added += 1;
  }
  return { presets, added, skipped };
}
