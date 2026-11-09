import {
  MAX_PROJECT_ASSETS,
  PROJECT_ASSET_BYTES_CEILING,
  assetBytes,
  formatMebibytes,
} from './projectLimits.ts';
import { validCornerRadius } from './vectorShapes.ts';
import { validCustomShapeChoice } from './customShapeLibrary.ts';
import type { CloudLink } from './cloud';
import {
  EXPORT_FORMATS,
  validExportQuality,
  validExportTargetBytes,
  type ExportFormat,
} from './export.ts';
import {
  validAsset,
  validateFrame,
  validAdjustments,
  referencedAssets,
  commonLayer,
  effectiveAdjustments,
  effectiveTextLayer,
  neutral,
  validId,
  type Assets,
  type Frame,
  type Adjustments,
} from './document.ts';
import { validPhotoAdjustments } from './photoAdjustments.ts';
import { effectiveImageSize } from './imageSize.ts';
import {
  effectiveBrushPressureSettings,
  validBrushPressureSettings,
  validBrushTipSettings,
  type BrushPressureSettings,
} from './brush.ts';
import { validBrushPresetId, type BrushPresetId } from './brushPresets.ts';
import {
  DEFAULT_HISTORY_BRUSH,
  DEFAULT_ART_HISTORY_BRUSH,
  DEFAULT_MIXER_BRUSH,
  validArtHistoryBrushSettings,
  validHistoryBrushSettings,
  validMixerBrushSettings,
  type HistoryBrushSettings,
  type ArtHistoryBrushSettings,
  type MixerBrushSettings,
} from './mixerHistoryBrush.ts';
import {
  PATTERN_IDS,
  normalizePatternTileSize,
  type PatternId,
} from './patternStamp.ts';
import { isGradientStops, type GradientStop } from './gradientStops.ts';
import { normalizeSecondaryBrushPreset } from './brushSecondary.ts';
import {
  normalizeCustomBrushPresets,
  type CustomBrushPreset,
} from './customBrushPresets.ts';
import {
  normalizeCustomPatternPresets,
  type CustomPatternPreset,
} from './customPatternPresets.ts';
import { normalizeCustomShapePresets, type CustomShapePreset } from './customShapePresets.ts';
import { normalizeCustomPathPresets, type CustomPathPreset } from './customPathPresets.ts';
import { beginPerformanceSpan } from './performanceMarks.ts';
import {
  decodeDraftBundle,
  isDraftBundleManifest,
  type DraftBundleManifest,
} from './draftBundle.ts';
import {
  createDraftManifest,
  decodeDraftManifest,
  draftAssetKey,
  draftAssetKeyBounds,
  hashDraftAsset,
  isDraftManifest,
  manifestAssetHashes,
  planDraftAssetWrites,
  tileSha256,
  type DraftManifest,
} from './draftAssetStore.ts';
import {
  TILE_SIZE,
  hasTiledAssets,
  isPngAsset,
  isTiledAsset,
  knownTile,
  type AssetTile,
  type PngAsset,
} from './tiledAssets.ts';
import { normalizeLayerSelection } from './layerSelection.ts';
import {
  normalizeDocumentMetadata,
  type DocumentMetadata,
} from './metadata.ts';
import { normalizeTypeStyle, type TypeStyle } from './typeStyles.ts';
import { normalizeFontPreviewSize, type FontPreviewSize } from './fontPreview.ts';
import { isSelectableFontFamily } from './fontLibrary.ts';
import { BRUSH_SIZE_MAX, BRUSH_SIZE_MIN } from './brushSize.ts';
import { BRUSH_SPACING_MAX, BRUSH_SPACING_MIN } from './brush.ts';
import { BRUSH_SCATTER_MAX, validBrushDynamics, type BrushDynamics } from './brushDynamics.ts';
import { validPaintSymmetry, type PaintSymmetrySettings } from './paintSymmetry.ts';
import { validSmudgeSettings, type SmudgeSettings } from './smudge.ts';
import { validGradientBlendMode, validGradientOpacity, type GradientBlendMode } from './gradientBlend.ts';
import { validBrushBlendMode, type BrushBlendMode } from './brushBlend.ts';
export type Tool =
  | 'move'
  | 'hand'
  | 'rotate-view'
  | 'zoom'
  | 'eyedropper'
  | 'color-sampler'
  | 'ruler'
  | 'note'
  | 'count'
  | 'fill'
  | 'gradient'
  | 'clone'
  | 'heal'
  | 'spot-heal'
  | 'patch'
  | 'red-eye'
  | 'pattern-stamp'
  | 'crop'
  | 'perspective-crop'
  | 'slice'
  | 'slice-select'
  | 'frame'
  | 'brush'
  | 'mixer-brush'
  | 'history-brush'
  | 'art-history-brush'
  | 'pencil'
  | 'color-replace'
  | 'eraser'
  | 'background-eraser'
  | 'magic-eraser'
  | 'mask-brush'
  | 'mask-eraser'
  | 'adjustment-brush'
  | 'dodge'
  | 'burn'
  | 'sponge'
  | 'smudge'
  | 'blur'
  | 'sharpen'
  | 'text'
  | 'pen'
  | 'freeform-pen'
  | 'curvature-pen'
  | 'direct-select'
  | 'rectangle'
  | 'rounded-rectangle'
  | 'ellipse'
  | 'line'
  | 'polygon'
  | 'custom-shape'
  | 'select'
  | 'ellipse-select'
  | 'row-select'
  | 'column-select'
  | 'lasso'
  | 'polygonal-lasso'
  | 'magnetic-lasso'
  | 'selection-brush'
  | 'quick-selection'
  | 'magic-wand';
export type Shot = { url: string; w: number; h: number };
export type Settings = {
  tool: Tool;
  /** Legacy stage-relative zoom (20–140), still written for older builds. */
  zoom: number;
  /** True pixel zoom percentage (1–3200); preferred when present. */
  viewZoom?: number;
  /** Ephemeral viewport rotation in degrees; it never mutates document pixels. */
  viewRotation?: number;
  color: string;
  /** Photoshop-compatible foreground/background pair. Older drafts omit the background. */
  backgroundColor?: string;
  size: number;
  brushOpacity?: number;
  /** Brush/Pencil blend mode (Canvas-native modes); older drafts omit it and paint Normal. */
  brushBlendMode?: BrushBlendMode;
  hardness?: number;
  /** Opt-in pen/touch pressure mapping for configured brush diameter. */
  pressureSize?: boolean;
  /** Opt-in pen/touch pressure mapping for brush alpha. */
  pressureOpacity?: boolean;
  /** Bounded response curve for enabled pen/touch pressure mappings. */
  pressureCurve?: 'linear' | 'soft' | 'firm';
  /** Optional deterministic local Brush preset selected in the tool panel. */
  brushPreset?: BrushPresetId;
  /** User-authored local brush presets; pixels and remote references are never stored. */
  customBrushPresets?: CustomBrushPreset[];
  /** User-authored local Pattern Stamp presets; source pixels never leave the device. */
  customPatternPresets?: CustomPatternPreset[];
  /** User-authored local vector shape presets; geometry remains editable. */
  customShapePresets?: CustomShapePreset[];
  /** User-authored local editable Pen paths; source pixels never leave the device. */
  customPathPresets?: CustomPathPreset[];
  /** Parametric polygon variant used by the Polygon tool. */
  polygonVariant?: 'polygon' | 'triangle' | 'star';
  /** Parametric polygon/star side count, bounded to the editable shape range. */
  polygonSides?: number;
  /** Parametric star inner radius (0.1–0.9 of the outer radius). */
  polygonInnerRadius?: number;
  /** Rounded Rectangle tool corner radius in px (0–8,000); clamped per drawn box. */
  shapeCornerRadius?: number;
  /** Custom Shape tool choice: a built-in library id or `path-preset:<id>`. */
  customShapeId?: string;
  /** Spacing between brush dabs as a percent of diameter (1–1,000). */
  spacing?: number;
  /** Pointer stabilization amount for brush-family tools, from 0 to 100. */
  brushSmoothing?: number;
  /** Deterministic brush stamp scatter amount, from 0 to 1,000 percent of the diameter. */
  brushScatter?: number;
  /** Scatter axes, Count, Count jitter and size/angle/opacity jitter; absent keys use legacy defaults. */
  brushDynamics?: Partial<BrushDynamics>;
  /** Gradient geometry for the Gradient tool. */
  gradientMode?: 'linear' | 'radial' | 'reflected';
  /** Gradient endpoint behaviour. */
  gradientEnd?: 'transparent' | 'background';
  /** Optional authored colour stop at the midpoint; `none` preserves the legacy two-stop gradient. */
  gradientMidpoint?: string;
  /** Position of the authored midpoint stop, from 1 to 99 percent. */
  gradientMidpointPosition?: number;
  /** Swap gradient start and end colours for Linear and Radial modes. */
  gradientReverse?: boolean;
  /** Deterministic gradient dither amount, from 0 to 100. */
  gradientDither?: number;
  /** Ordered authored interior gradient stops; endpoints remain controlled by the tool colours. */
  gradientStops?: GradientStop[];
  /** Deterministic RGB gradient noise amount, from 0 to 100. */
  gradientNoise?: number;
  /** How a new gradient combines with existing layer pixels; defaults to Normal (paint over). */
  gradientBlend?: GradientBlendMode;
  /** Gradient opacity, from 1 to 100 percent. */
  gradientOpacity?: number;
  /** Deterministic brush texture amount, from 0 to 100. */
  brushTexture?: number;
  /** Deterministic secondary-brush modulation amount, from 0 to 100. */
  brushDual?: number;
  /** Optional second brush tip used with the Dual brush amount. */
  secondaryBrushPreset?: 'none' | BrushPresetId;
  /** Deterministic bristle-like modulation amount, from 0 to 100. */
  brushBristle?: number;
  /** Deterministic wet-edge opacity amount, from 0 to 100. */
  brushWetEdges?: number;
  /** Deterministic centre-weighted build-up amount, from 0 to 100. */
  brushBuildUp?: number;
  /** Brush-family flow amount, from 1 to 100 percent. */
  brushFlow?: number;
  /** Paint Symmetry for Brush, Pencil and Eraser (off when omitted). */
  paintSymmetry?: PaintSymmetrySettings;
  /** Brush tip rotation in degrees. */
  angle?: number;
  /** Brush tip roundness (100 is circular). */
  roundness?: number;
  /** Mirror the brush tip around its local axes. */
  flipX?: boolean;
  flipY?: boolean;
  /** Deterministic local source selected by Pattern Stamp. */
  patternId?: PatternId;
  /** Bounded tile edge in canvas pixels for Pattern Stamp. */
  patternTileSize?: number;
  /** Conservative local Red Eye correction threshold and strength. */
  redEyeThreshold?: number;
  redEyeAmount?: number;
  colorTolerance?: number;
  /** Tonal retouch settings persisted with the active tool. */
  tonalExposure?: number;
  tonalRange?: 'shadows' | 'midtones' | 'highlights';
  spongeMode?: 'saturate' | 'desaturate';
  spongeVibrance?: number;
  /** Bounded wet/load/mix controls persisted for the Mixer Brush. */
  mixerBrush?: MixerBrushSettings;
  /**
   * Smudge Strength, Mode, Finger Painting, Sample All Layers and pressure
   * strength. Older drafts omit it; their Smudge "Flow" was `brushOpacity`.
   */
  smudge?: Partial<SmudgeSettings>;
  /** Bounded restore controls persisted for the History Brush. */
  historyBrush?: HistoryBrushSettings;
  /** Bounded painterly source-safe controls persisted for Art History Brush. */
  artHistoryBrush?: ArtHistoryBrushSettings;
  /** Index into the local undo history used as the History Brush source. */
  historySourceIndex?: number;
  exportFormat?: ExportFormat;
  exportQuality?: number;
  /** Optional lossy-export target in bytes; absent means manual quality mode. */
  exportTargetBytes?: number;
  text: string;
  fontSize: number;
  /** Local/system font used when the Text tool creates a new editable layer. */
  fontFamily?: string;
  /** Preview scale used by the Text tool's bounded local font picker. */
  fontPreviewSize?: FontPreviewSize;
  /** Optional local default for new or existing editable text layers. */
  defaultTypeStyle?: TypeStyle;
  brightness: number;
  contrast: number;
  saturation: number;
  /** Nondestructive hue rotation in degrees (-180..180). */
  hue: number;
  blur: number;
  filter: string;
  colorBalance: Adjustments['colorBalance'];
  sharpenNoise: Adjustments['sharpenNoise'];
  curves: Adjustments['curves'];
};
export type Draft = {
  version: 2;
  localRevision?: number;
  cloud?: CloudLink;
  history: Frame[];
  assets: Assets;
  index: number;
  name: string;
  settings: Settings;
  /** Optional editable metadata retained in local/project JSON only. */
  metadata?: DocumentMetadata;
  migrated?: true;
};
export const CURRENT_DRAFT_VERSION = 2 as const;

/** Remove local-only File Info before a document is sent to a cloud API. */
export function stripPrivateMetadata(value: Draft): Draft {
  const { metadata: _metadata, ...cloudValue } = value;
  return cloudValue;
}

/**
 * Cloud links are persisted in local drafts, but their values come from a
 * network response. Keep them opaque while rejecting control characters and
 * unbounded strings before they reach the IndexedDB record or a request body.
 */
export function validCloudLink(value: unknown): value is CloudLink {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<CloudLink>;
  const safe = (entry: unknown) =>
    typeof entry === 'string' &&
    entry.length >= 1 &&
    entry.length <= 160 &&
    !Array.from(entry).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    });
  return [candidate.id, candidate.generation, candidate.owner].every(safe);
}

const validRevision = (value: unknown): value is number =>
  Number.isInteger(value) &&
  Number(value) >= 0 &&
  Number(value) <= Number.MAX_SAFE_INTEGER;

/**
 * Recovery must never replace in-memory edits with an equal or older record.
 * A strict revision comparison makes a second recovery read safe when tabs
 * race one another or a draft was already replaced.
 */
export function isNewerDraftRevision(
  currentRevision: unknown,
  candidateRevision: unknown,
): candidateRevision is number {
  return (
    validRevision(currentRevision) &&
    validRevision(candidateRevision) &&
    candidateRevision > currentRevision
  );
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
let database: Promise<IDBDatabase> | undefined;
function validSettings(settings: unknown): settings is Settings {
  if (!record(settings)) return false;
  const candidate = settings as Partial<Settings>;
  if (
    ![
      'move',
      'hand',
      'rotate-view',
      'zoom',
      'eyedropper',
      'color-sampler',
      'ruler',
      'note',
      'count',
      'fill',
      'gradient',
      'clone',
      'heal',
      'spot-heal',
      'patch',
      'red-eye',
      'pattern-stamp',
      'crop',
      'perspective-crop',
      'slice',
      'slice-select',
      'frame',
      'brush',
      'mixer-brush',
      'history-brush',
      'art-history-brush',
      'pencil',
      'color-replace',
      'eraser',
      'background-eraser',
      'magic-eraser',
      'mask-brush',
      'mask-eraser',
      'adjustment-brush',
      'dodge',
      'burn',
      'sponge',
      'smudge',
      'blur',
      'sharpen',
      'text',
      'pen',
      'freeform-pen',
      'curvature-pen',
      'direct-select',
      'rectangle',
      'rounded-rectangle',
      'ellipse',
      'line',
      'polygon',
      'custom-shape',
      'select',
      'ellipse-select',
      'row-select',
      'column-select',
      'lasso',
      'polygonal-lasso',
      'magnetic-lasso',
      'selection-brush',
      'quick-selection',
      'magic-wand',
    ].includes(candidate.tool as Tool) ||
    typeof candidate.text !== 'string' ||
    candidate.text.length > 10000 ||
    (candidate.fontFamily !== undefined && !isSelectableFontFamily(candidate.fontFamily)) ||
    (candidate.fontPreviewSize !== undefined && normalizeFontPreviewSize(candidate.fontPreviewSize) !== candidate.fontPreviewSize) ||
    (candidate.exportFormat !== undefined &&
      !EXPORT_FORMATS.includes(candidate.exportFormat)) ||
    (candidate.exportQuality !== undefined &&
      !validExportQuality(candidate.exportQuality)) ||
    (candidate.exportTargetBytes !== undefined &&
      !validExportTargetBytes(candidate.exportTargetBytes)) ||
    typeof candidate.color !== 'string' ||
    !/^#[a-f\d]{6}$/i.test(candidate.color) ||
    (candidate.backgroundColor !== undefined &&
      (typeof candidate.backgroundColor !== 'string' ||
        !/^#[a-f\d]{6}$/i.test(candidate.backgroundColor))) ||
    !validBrushPressureSettings(candidate) ||
    !validBrushTipSettings(candidate) ||
    (candidate.brushPreset !== undefined && !validBrushPresetId(candidate.brushPreset)) ||
    (candidate.customBrushPresets !== undefined &&
      normalizeCustomBrushPresets(candidate.customBrushPresets).length !== candidate.customBrushPresets.length) ||
    (candidate.customPatternPresets !== undefined &&
      normalizeCustomPatternPresets(candidate.customPatternPresets).length !== candidate.customPatternPresets.length) ||
    (candidate.customShapePresets !== undefined &&
      normalizeCustomShapePresets(candidate.customShapePresets).length !== candidate.customShapePresets.length) ||
    (candidate.customPathPresets !== undefined &&
      normalizeCustomPathPresets(candidate.customPathPresets).length !== candidate.customPathPresets.length) ||
    (candidate.patternId !== undefined &&
      !PATTERN_IDS.includes(candidate.patternId as PatternId)) ||
    (candidate.redEyeThreshold !== undefined &&
      (typeof candidate.redEyeThreshold !== 'number' ||
        !Number.isFinite(candidate.redEyeThreshold) ||
        candidate.redEyeThreshold < 0 ||
        candidate.redEyeThreshold > 255)) ||
    (candidate.redEyeAmount !== undefined &&
      (typeof candidate.redEyeAmount !== 'number' ||
        !Number.isFinite(candidate.redEyeAmount) ||
        candidate.redEyeAmount < 0 ||
        candidate.redEyeAmount > 100))
  )
    return false;
  const ranges: [number, number, number][] = [
    [candidate.zoom as number, 20, 140],
    [candidate.viewZoom === undefined ? 100 : (candidate.viewZoom as number), 1, 3200],
    [candidate.viewRotation ?? 0, -180, 180],
    // Painting Size widened from 2–100 to 1–5,000 px; older drafts stay valid.
    [candidate.size as number, BRUSH_SIZE_MIN, BRUSH_SIZE_MAX],
    [candidate.fontSize as number, 16, 160],
  ];
  const brushRanges: [number, number, number][] = [
    [candidate.brushOpacity ?? 100, 1, 100] as [number, number, number],
    [candidate.hardness ?? 100, 0, 100] as [number, number, number],
    [candidate.spacing ?? 25, BRUSH_SPACING_MIN, BRUSH_SPACING_MAX] as [number, number, number],
    [candidate.angle ?? 0, -180, 180] as [number, number, number],
    [candidate.roundness ?? 100, 1, 100] as [number, number, number],
    [candidate.colorTolerance ?? 24, 0, 255] as [number, number, number],
    [candidate.tonalExposure ?? 50, 1, 100] as [number, number, number],
    [candidate.spongeVibrance ?? 50, 1, 100] as [number, number, number],
    [candidate.brushSmoothing ?? 0, 0, 100] as [number, number, number],
    [candidate.brushScatter ?? 0, 0, BRUSH_SCATTER_MAX] as [number, number, number],
    [candidate.brushTexture ?? 0, 0, 100] as [number, number, number],
    [candidate.brushDual ?? 0, 0, 100] as [number, number, number],
    [candidate.brushBristle ?? 0, 0, 100] as [number, number, number],
    [candidate.brushWetEdges ?? 0, 0, 100] as [number, number, number],
    [candidate.brushBuildUp ?? 0, 0, 100] as [number, number, number],
    [candidate.gradientDither ?? 0, 0, 100] as [number, number, number],
    [candidate.gradientNoise ?? 0, 0, 100] as [number, number, number],
    [candidate.gradientMidpointPosition ?? 50, 1, 99] as [number, number, number],
    [candidate.brushFlow ?? 100, 1, 100] as [number, number, number],
  ];
  if (candidate.patternTileSize !== undefined) {
    try {
      normalizePatternTileSize(candidate.patternTileSize);
    } catch {
      return false;
    }
  }
  if (candidate.gradientMode !== undefined && !['linear', 'radial', 'reflected'].includes(candidate.gradientMode)) return false;
  if (candidate.defaultTypeStyle !== undefined) {
    try {
      normalizeTypeStyle(candidate.defaultTypeStyle);
    } catch {
      return false;
    }
  }
  if (!validCornerRadius(candidate.shapeCornerRadius)) return false;
  if (candidate.customShapeId !== undefined && !validCustomShapeChoice(candidate.customShapeId)) return false;
  if (candidate.gradientEnd !== undefined && !['transparent', 'background'].includes(candidate.gradientEnd)) return false;
  if (candidate.gradientMidpoint !== undefined && candidate.gradientMidpoint !== 'none' &&
    (typeof candidate.gradientMidpoint !== 'string' || !/^#[a-f\d]{6}$/i.test(candidate.gradientMidpoint))) return false;
  if (candidate.gradientReverse !== undefined && typeof candidate.gradientReverse !== 'boolean') return false;
  if (candidate.gradientStops !== undefined && !isGradientStops(candidate.gradientStops)) return false;
  if (candidate.gradientBlend !== undefined && !validGradientBlendMode(candidate.gradientBlend)) return false;
  if (candidate.gradientOpacity !== undefined && !validGradientOpacity(candidate.gradientOpacity)) return false;
  if (candidate.brushBlendMode !== undefined && !validBrushBlendMode(candidate.brushBlendMode)) return false;
  if (candidate.brushDynamics !== undefined && !validBrushDynamics(candidate.brushDynamics)) return false;
  if (candidate.paintSymmetry !== undefined && !validPaintSymmetry(candidate.paintSymmetry)) return false;
  if (candidate.secondaryBrushPreset !== undefined && normalizeSecondaryBrushPreset(candidate.secondaryBrushPreset) !== candidate.secondaryBrushPreset) return false;
  if (candidate.mixerBrush !== undefined && !validMixerBrushSettings(candidate.mixerBrush)) return false;
  if (candidate.smudge !== undefined && !validSmudgeSettings(candidate.smudge)) return false;
  if (candidate.historyBrush !== undefined && !validHistoryBrushSettings(candidate.historyBrush)) return false;
  if (candidate.artHistoryBrush !== undefined && !validArtHistoryBrushSettings(candidate.artHistoryBrush)) return false;
  if (candidate.historySourceIndex !== undefined &&
    (!Number.isInteger(candidate.historySourceIndex) || candidate.historySourceIndex < 0 || candidate.historySourceIndex > 23)) return false;
  return (
    ranges.every(
      ([value, min, max]) =>
        Number.isFinite(value) && value >= min && value <= max,
    ) &&
    brushRanges.every(
      ([value, min, max]) =>
        Number.isFinite(value) && value >= min && value <= max,
    ) &&
    (candidate.pressureSize === undefined ||
      typeof candidate.pressureSize === 'boolean') &&
    (candidate.pressureOpacity === undefined ||
      typeof candidate.pressureOpacity === 'boolean') &&
    (candidate.tonalRange === undefined ||
      ['shadows', 'midtones', 'highlights'].includes(candidate.tonalRange)) &&
    (candidate.spongeMode === undefined ||
      ['saturate', 'desaturate'].includes(candidate.spongeMode)) &&
    validAdjustments(candidate as Partial<Adjustments>)
  );
}
type DraftCandidate = Omit<Draft, 'version' | 'settings' | 'history'> & {
  version: number;
  settings: unknown;
  history: unknown;
};
type DraftMigration = (value: DraftCandidate, settings: Settings) => Draft;

function validRawPhotoMetadata(history: unknown): boolean {
  if (!Array.isArray(history)) return true;
  return history.every((frame) => {
    if (!record(frame) || !Array.isArray(frame.layers)) return true;
    return frame.layers.every((layer) => {
      if (!record(layer) || !record(layer.adjustments)) return true;
      const value = layer.adjustments.photoAdjustments;
      return value === undefined || validPhotoAdjustments(value);
    });
  });
}

/** Versioned migration registry; unknown document versions fail closed. */
export const DRAFT_MIGRATIONS: Readonly<Record<number, DraftMigration>> = {
  1: (value, settings) => {
    const assets: Assets = {},
      id = crypto.randomUUID();
    const history = (value.history as unknown as Shot[]).map((shot) => {
      if (!validAsset(shot))
        throw new Error('Saved image is invalid or too large');
      const asset =
        Object.keys(assets).find((key) => (assets[key] as PngAsset).url === shot.url) ||
        crypto.randomUUID();
      assets[asset] = shot;
      return {
        w: shot.w,
        h: shot.h,
        imageSize: { resolution: 72, resolutionUnit: 'ppi' as const },
        active: id,
        selectedLayerIds: [id],
        layers: [
          {
            ...commonLayer('Background'),
            id,
            kind: 'raster' as const,
            asset,
            adjustments: {
              ...neutral,
              brightness: settings.brightness,
              contrast: settings.contrast,
              saturation: settings.saturation,
              blur: settings.blur,
              filter: settings.filter,
            },
          },
        ],
      };
    });
    return {
      ...value,
      version: CURRENT_DRAFT_VERSION,
      assets,
      history,
      settings: {
        ...settings,
        ...neutral,
        ...effectiveBrushPressureSettings(settings as BrushPressureSettings),
      },
      migrated: true,
    } as Draft;
  },
};
export type ValidateDraftOptions = {
  /**
   * Returns true for an asset already verified with `validAsset` in this
   * session (same ID, URL and dimensions). Only the save path supplies it so
   * unchanged multi-megabyte assets are not re-scanned on every autosave;
   * recovery and imports always validate every asset.
   */
  trustedAsset?: (id: string, asset: unknown) => boolean;
};

export function validateDraft(
  input: unknown,
  options: ValidateDraftOptions = {},
): Draft {
  if (!record(input)) throw new Error('Invalid project file');
  const value = input as DraftCandidate;
  if (value.version !== 1 && value.version !== CURRENT_DRAFT_VERSION)
    throw new Error('Unsupported project version');
  if (!validRawPhotoMetadata(value.history))
    throw new Error('Saved document is not supported');
  // v2 drafts created before Levels shipped omit its three fields. Normalize
  // them at the persistence boundary so the UI and renderer always receive a
  // complete adjustment record while keeping old bookmarks importable.
  const settings =
    value.settings && typeof value.settings === 'object'
      ? {
          ...value.settings,
          ...effectiveAdjustments(value.settings),
          ...effectiveBrushPressureSettings(
            value.settings as BrushPressureSettings,
          ),
          mixerBrush: (value.settings as Partial<Settings>).mixerBrush ?? { ...DEFAULT_MIXER_BRUSH },
          historyBrush: (value.settings as Partial<Settings>).historyBrush ?? { ...DEFAULT_HISTORY_BRUSH },
          artHistoryBrush: (value.settings as Partial<Settings>).artHistoryBrush ?? { ...DEFAULT_ART_HISTORY_BRUSH },
        }
      : value.settings;
  if (
    !Array.isArray(value.history) ||
    !value.history.length ||
    value.history.length > 24 ||
    !Number.isInteger(value.index) ||
    value.index < 0 ||
    value.index >= value.history.length ||
    !validSettings(settings) ||
    typeof value.name !== 'string' ||
    value.name.length > 160
  )
    throw new Error('Saved document is not supported');
  if (value.localRevision !== undefined && !validRevision(value.localRevision))
    throw new Error('Invalid project revision');
  if (value.cloud !== undefined && !validCloudLink(value.cloud))
    throw new Error('Invalid cloud project link');
  let metadata: DocumentMetadata | undefined;
  if (value.metadata !== undefined) {
    try {
      metadata = normalizeDocumentMetadata(value.metadata);
    } catch (error) {
      throw new Error(`Invalid document metadata: ${error instanceof Error ? error.message : 'unsupported fields'}`);
    }
  }
  if (value.version !== CURRENT_DRAFT_VERSION)
    return DRAFT_MIGRATIONS[value.version]({ ...value, metadata }, settings as Settings);
  if (
    value.version !== CURRENT_DRAFT_VERSION ||
    !value.assets ||
    typeof value.assets !== 'object' ||
    Array.isArray(value.assets) ||
    Object.keys(value.assets).length > MAX_PROJECT_ASSETS ||
    Object.entries(value.assets).some(
      ([id, asset]) =>
        !validId(id) ||
        !(options.trustedAsset?.(id, asset) || validAsset(asset)),
    )
  )
    throw new Error('Invalid project assets');
  const history = (value.history as Frame[]).map((frame) => ({
    ...normalizeLayerSelection({
      ...frame,
      imageSize: effectiveImageSize(frame.imageSize),
      layers: frame.layers.map((layer) =>
        effectiveTextLayer(
          {
            ...layer,
            adjustments: effectiveAdjustments(layer.adjustments),
          },
          frame.w,
        ),
      ),
    }),
  }));
  history.forEach((frame) => validateFrame(frame, value.assets));
  if (assetBytes(value.assets) > PROJECT_ASSET_BYTES_CEILING)
    throw new Error(
      `Project assets exceed ${formatMebibytes(PROJECT_ASSET_BYTES_CEILING)} MB`,
    );
  return {
    ...value,
    version: CURRENT_DRAFT_VERSION,
    history,
    settings: settings as Settings,
    ...(metadata !== undefined
      ? { metadata }
      : {}),
    assets: referencedAssets(history, value.assets),
  };
}

/**
 * Assets already verified in this tab, keyed by asset ID. An entry is only
 * trusted while the asset's URL and dimensions are identical, so a reused or
 * mutated ID is always validated and hashed again. Two generations bound the
 * retained strings to roughly the last two prepared drafts.
 */
type VerifiedAsset = { url?: string; tiled?: object; w: number; h: number; hash?: string };
let verifiedAssets = new Map<string, VerifiedAsset>();
let previousVerifiedAssets = new Map<string, VerifiedAsset>();

function verifiedAsset(id: string, asset: unknown): VerifiedAsset | undefined {
  if (!record(asset)) return undefined;
  const entry = verifiedAssets.get(id) ?? previousVerifiedAssets.get(id);
  if (!entry || entry.w !== asset.w || entry.h !== asset.h) return undefined;
  // A tiled asset and its tiles are immutable objects: identity is enough.
  if (entry.tiled !== undefined) return entry.tiled === asset ? entry : undefined;
  return entry.url === asset.url ? entry : undefined;
}

function rememberVerifiedAssets(
  assets: Assets,
  hashes?: ReadonlyMap<string, string>,
) {
  const next = new Map<string, VerifiedAsset>();
  for (const [id, asset] of Object.entries(assets)) {
    const known = verifiedAsset(id, asset);
    next.set(id, {
      ...(isTiledAsset(asset) ? { tiled: asset } : { url: asset.url }),
      w: asset.w,
      h: asset.h,
      hash: hashes?.get(id) ?? known?.hash,
    });
  }
  previousVerifiedAssets = verifiedAssets;
  verifiedAssets = next;
}

/** Validate and normalize a value immediately before writing it to storage. */
export function prepareDraftForStorage(value: unknown): Draft {
  const draft = validateDraft(value, {
    trustedAsset: (id, asset) => verifiedAsset(id, asset) !== undefined,
  });
  rememberVerifiedAssets(draft.assets);
  return draft;
}

/**
 * Data-URL asset ID → SHA-256, hashing only content not already hashed in
 * this tab, and tile key → SHA-256 of the tile PNG (memoized per tile).
 */
async function hashDraftAssets(
  assets: Assets,
): Promise<{ hashes: Map<string, string>; tiles: Map<string, { hash: string; blob: Blob }> }> {
  const entries = await Promise.all(
    Object.entries(assets)
      .filter((entry): entry is [string, PngAsset] => isPngAsset(entry[1]))
      .map(async ([id, asset]) => {
        const known = verifiedAsset(id, asset);
        if (known?.hash) return [id, known.hash, false] as const;
        const hash = await hashDraftAsset(asset.url);
        if (known) known.hash = hash;
        return [id, hash, true] as const;
      }),
  );
  const unique = new Map<string, import('./tiledAssets.ts').AssetTile>();
  for (const asset of Object.values(assets))
    if (isTiledAsset(asset)) for (const tile of asset.tiles) if (tile) unique.set(tile.key, tile);
  const tiles = new Map(
    await Promise.all(
      [...unique].map(async ([key, tile]) => [key, { hash: await tileSha256(tile), blob: tile.blob }] as const),
    ),
  );
  lastSaveStats.hashedAssets = entries.filter(([, , hashed]) => hashed).length;
  return { hashes: new Map(entries.map(([id, hash]) => [id, hash])), tiles };
}

/** Diagnostics for the most recent successful local save (tests and profiling). */
export type DraftSaveStats = {
  revision: number;
  assets: number;
  hashedAssets: number;
  assetWrites: number;
  assetDeletes: number;
  bytesWritten: number;
  durationMs: number;
};
let lastSaveStats: DraftSaveStats = {
  revision: 0,
  assets: 0,
  hashedAssets: 0,
  assetWrites: 0,
  assetDeletes: 0,
  bytesWritten: 0,
  durationMs: 0,
};
export function lastDraftSaveStats(): DraftSaveStats {
  return { ...lastSaveStats };
}

export const LOCAL_STORAGE_FULL =
  'Browser storage is full. Your last local save is kept; export a copy or free up space.';

const DATABASE_NAME = 'pixelforge-documents';
// Format 3 reuses the version 2 object stores (asset records live in
// `draftBlobs` under an `asset:` prefix), so no schema upgrade is needed and
// tabs still running an older build are never blocked by a version change.
const DATABASE_VERSION = 2;

function openDatabase(): Promise<IDBDatabase> {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts');
      // v1 kept the complete Draft in `drafts`. v2 adds immutable payload
      // chunks; old records remain readable and are migrated on their next
      // successful save, preserving bookmarks across the schema upgrade.
      if (!db.objectStoreNames.contains('draftBlobs'))
        db.createObjectStore('draftBlobs');
    };
    request.onsuccess = () => {
      const db = request.result;
      // Let a future schema upgrade in another tab proceed; the next save in
      // this tab reopens the database instead of holding the old connection.
      db.onversionchange = () => {
        db.close();
        if (database === opened) database = undefined;
      };
      db.onclose = () => {
        if (database === opened) database = undefined;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Local storage is blocked'));
  }).catch((error: unknown) => {
    // Do not memoize a failed open: a later save may succeed once another
    // tab releases the database or storage becomes available again.
    if (database === opened) database = undefined;
    throw error;
  });
  const opened = database;
  return opened;
}

/** Test seam: run the storage code against an in-memory IndexedDB double. */
export function setDraftDatabaseForTesting(db: IDBDatabase | undefined): void {
  database = db ? Promise.resolve(db) : undefined;
  verifiedAssets = new Map();
  previousVerifiedAssets = new Map();
}

function draftAssetRange(id: string): IDBKeyRange {
  const [lower, upper] = draftAssetKeyBounds(id);
  return IDBKeyRange.bound(lower, upper);
}

export function rememberDraft(id: string) {
  const url = new URL(location.href);
  url.pathname = '/editor';
  url.searchParams.delete('new');
  url.hash = 'draft=' + id;
  window.history.replaceState(null, '', url);
  try {
    localStorage.setItem('pixelforge:last-draft', id);
  } catch {
    /* IndexedDB can still be available. */
  }
  return id;
}

export function createDraftId() {
  return rememberDraft(crypto.randomUUID());
}

/**
 * How the opening draft was chosen: an explicit `#draft=` bookmark, the
 * browser-wide `last-draft` fallback (an `/editor` URL without a hash), or a
 * fresh draft.
 */
export type InitialDraft = { id: string; source: 'bookmark' | 'last-draft' | 'new' };

export function resolveInitialDraft(): InitialDraft {
  if (new URL(location.href).searchParams.get('new') === '1')
    return { id: createDraftId(), source: 'new' };
  const bookmarked = new URLSearchParams(location.hash.slice(1)).get('draft');
  if (bookmarked && /^[a-f0-9-]{36}$/.test(bookmarked))
    return { id: rememberDraft(bookmarked), source: 'bookmark' };
  let id: string | null = null;
  try {
    id = localStorage.getItem('pixelforge:last-draft');
  } catch {
    /* Use a new draft. */
  }
  return id && /^[a-f0-9-]{36}$/.test(id)
    ? { id: rememberDraft(id), source: 'last-draft' }
    : { id: createDraftId(), source: 'new' };
}

export function initialDraftId() {
  return resolveInitialDraft().id;
}

const DRAFT_LOCK_PREFIX = 'pixelforge:draft-open:';

type DraftLockManager = {
  request: (
    name: string,
    options: { mode: 'shared' },
    callback: () => Promise<void>,
  ) => Promise<unknown>;
  query: () => Promise<{ held?: Array<{ name?: string }> }>;
};

function draftLocks(): DraftLockManager | undefined {
  const locks =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { locks?: DraftLockManager }).locks
      : undefined;
  return locks && typeof locks.request === 'function' && typeof locks.query === 'function'
    ? locks
    : undefined;
}

/**
 * Advertise that this tab has a draft open. Shared Web Locks let any number
 * of tabs hold the same draft (explicit bookmarks still work and still use the
 * revision-conflict flow); the lock is released by the returned function or
 * automatically when the tab goes away.
 */
export function holdDraftOpen(id: string): () => void {
  const locks = draftLocks();
  if (!locks || !validId(id)) return () => {};
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks
    .request(DRAFT_LOCK_PREFIX + id, { mode: 'shared' }, () => held)
    .catch(() => {
      /* Locks are advisory; editing never depends on them. */
    });
  return () => release();
}

/** True when another tab of this origin currently has the draft open. */
export async function draftOpenElsewhere(id: string): Promise<boolean> {
  const locks = draftLocks();
  if (!locks || !validId(id)) return false;
  try {
    const state = await locks.query();
    return !!state.held?.some((lock) => lock.name === DRAFT_LOCK_PREFIX + id);
  } catch {
    return false;
  }
}

export const LOCAL_CONFLICT =
  'This draft changed in another tab. Save a local copy to keep your edits.';
const PENDING_DRAFT_PREFIX = 'pixelforge:pending-draft:';
const MAX_PENDING_DRAFT_BYTES = 4 * 1024 * 1024;

type PendingDraftRecord = { token?: string; draft: Draft };

/**
 * Tile key → SHA-256 of the tiles each draft's last committed manifest holds
 * in IndexedDB (this tab only). A write-ahead snapshot of a tiled document is
 * staged only when every tile it references is already stored, so recovery can
 * take the tiles from the stored draft and the snapshot stays small JSON.
 */
const persistedTiles = new Map<string, ReadonlySet<string>>();
const PENDING_TILES_MARK = 'pixelforge-pending-tiles';

/** JSON for a snapshot: tiled assets are written as their tile keys. */
function pendingSnapshotJson(token: string, draft: Draft, tiled: boolean): string {
  return JSON.stringify({ token, ...(tiled ? { tiled: true } : {}), draft }, (_key, value: unknown) =>
    isTiledAsset(value)
      ? {
          [PENDING_TILES_MARK]: true,
          w: value.w,
          h: value.h,
          tileSize: value.tileSize,
          tiles: value.tiles.map((tile) => (tile ? tile.key : null)),
        }
      : value,
  );
}

/** Rebuild snapshot tiled assets from tiles this tab holds (the stored draft's). */
function resolvePendingTiles(draft: unknown): unknown {
  if (!record(draft) || !record(draft.assets)) return draft;
  const assets: Record<string, unknown> = {};
  for (const [id, asset] of Object.entries(draft.assets)) {
    if (!record(asset) || asset[PENDING_TILES_MARK] !== true) {
      assets[id] = asset;
      continue;
    }
    if (!Array.isArray(asset.tiles) || asset.tileSize !== TILE_SIZE) throw new Error('Invalid pending draft');
    const tiles = asset.tiles.map((key: unknown): AssetTile | null => {
      if (key === null) return null;
      const tile = typeof key === 'string' ? knownTile(key) : undefined;
      if (!tile) throw new Error('Pending draft tiles are unavailable');
      return tile;
    });
    assets[id] = { w: asset.w, h: asset.h, tileSize: TILE_SIZE, tiles };
  }
  return { ...draft, assets };
}

let pendingTokenCounter = 0;
function newPendingToken(): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : undefined;
  return (
    uuid || `${Date.now().toString(36)}-${(++pendingTokenCounter).toString(36)}`
  );
}

/**
 * A completed IndexedDB write may only clear the exact write-ahead snapshot
 * that it persisted. Tokens prevent an earlier queued save from deleting a
 * newer snapshot staged by the same tab.
 */
export function pendingDraftCanBeCleared(
  pendingToken: unknown,
  completedToken: unknown,
  pendingRevision: unknown,
  completedRevision: unknown,
): boolean {
  if (typeof completedToken === 'string')
    return typeof pendingToken === 'string' && pendingToken === completedToken;
  // Backward compatibility for snapshots written before token support.
  return (
    pendingToken === undefined &&
    validRevision(pendingRevision) &&
    validRevision(completedRevision) &&
    pendingRevision <= completedRevision
  );
}

/** Keep staged revisions ahead of an IndexedDB write that is still queued. */
export function nextPendingDraftRevision(
  requestedRevision: unknown,
  previousRevision: unknown,
): number | undefined {
  if (!validRevision(requestedRevision) || !validRevision(previousRevision))
    return validRevision(requestedRevision) ? requestedRevision : undefined;
  if (previousRevision >= Number.MAX_SAFE_INTEGER) return undefined;
  const next = Math.max(requestedRevision, previousRevision + 1);
  return validRevision(next) ? next : undefined;
}

/**
 * Lower bound of a draft's JSON size: the lengths of the asset URLs its history
 * references. Cheap (no serialization) and never larger than the real
 * snapshot, so it only skips snapshots that could not have fit anyway.
 */
export function estimatedPendingDraftBytes(value: Draft): number {
  const used = referencedAssets(value.history, value.assets);
  // Tile Blobs cannot be written as JSON; such drafts rely on IndexedDB.
  if (hasTiledAssets(used)) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (const asset of Object.values(used))
    total += isPngAsset(asset) ? asset.url.length : 0;
  return total;
}

/**
 * Write a tab-scoped write-ahead snapshot before IndexedDB completes. This
 * closes the small reload window without sharing an in-flight draft between
 * tabs; oversized projects simply rely on IndexedDB as before.
 */
export function stagePendingDraft(
  id: string,
  value: Draft,
  revision: number,
): string | undefined {
  if (!validId(id) || !validRevision(revision)) return undefined;
  try {
    // Asset data URLs dominate the encoded size. Skip drafts that cannot fit
    // before validating or stringifying anything; IndexedDB stays authoritative.
    // Tiled documents are written as tile keys, and only when every tile is
    // already stored for this draft (a fresh stroke relies on IndexedDB).
    const used = referencedAssets(value.history, value.assets);
    const tiled = hasTiledAssets(used);
    if (tiled) {
      const stored = persistedTiles.get(id);
      let pngBytes = 0;
      for (const asset of Object.values(used)) {
        if (isPngAsset(asset)) pngBytes += asset.url.length;
        else if (!stored || asset.tiles.some((tile) => tile && !stored.has(tile.key))) return undefined;
      }
      if (pngBytes > MAX_PENDING_DRAFT_BYTES) return undefined;
    } else if (estimatedPendingDraftBytes(value) > MAX_PENDING_DRAFT_BYTES)
      return undefined;
    const previous = readPendingDraft(id);
    const stagedRevision = nextPendingDraftRevision(
      revision,
      previous?.draft.localRevision,
    );
    if (stagedRevision === undefined) return undefined;
    const safe = prepareDraftForStorage({
      ...value,
      localRevision: stagedRevision,
    });
    const token = newPendingToken();
    const encoded = pendingSnapshotJson(token, safe, tiled);
    if (encoded.length > MAX_PENDING_DRAFT_BYTES) return undefined;
    sessionStorage.setItem(PENDING_DRAFT_PREFIX + id, encoded);
    return token;
  } catch {
    /* Session storage can be unavailable or too small; IndexedDB remains authoritative. */
    return undefined;
  }
}

/**
 * Read this tab's write-ahead snapshot. A tiled snapshot's revision and token
 * are available without its tiles; `resolveTiles` rebuilds the full draft from
 * the tiles of the stored draft (read first) and fails closed when any is
 * missing.
 */
function readPendingDraft(id: string, resolveTiles = false): PendingDraftRecord | undefined {
  try {
    const encoded = sessionStorage.getItem(PENDING_DRAFT_PREFIX + id);
    if (!encoded) return undefined;
    const parsed: unknown = JSON.parse(encoded);
    if (record(parsed) && 'draft' in parsed) {
      const token = typeof parsed.token === 'string' ? parsed.token : undefined;
      if (parsed.tiled === true && !resolveTiles) {
        const revision = record(parsed.draft) ? parsed.draft.localRevision : undefined;
        if (!validRevision(revision)) throw new Error('Invalid pending draft');
        return { token, draft: { localRevision: revision } as Draft };
      }
      return {
        token,
        draft: validateDraft(parsed.tiled === true ? resolvePendingTiles(parsed.draft) : parsed.draft),
      };
    }
    // Read snapshots written by the pre-token implementation.
    return { draft: validateDraft(parsed) };
  } catch {
    try {
      sessionStorage.removeItem(PENDING_DRAFT_PREFIX + id);
    } catch {
      /* Ignore blocked storage. */
    }
    return undefined;
  }
}

function clearPendingDraft(id: string, revision: number, token?: string): void {
  try {
    const pending = readPendingDraft(id);
    if (
      !pending ||
      pendingDraftCanBeCleared(
        pending.token,
        token,
        pending.draft.localRevision,
        revision,
      )
    )
      sessionStorage.removeItem(PENDING_DRAFT_PREFIX + id);
  } catch {
    /* Ignore blocked storage. */
  }
}

type StoredDraftPointer = Draft | DraftBundleManifest | DraftManifest;

function storedRevision(value: unknown): number {
  if (isDraftBundleManifest(value)) return value.localRevision;
  return record(value) && validRevision(value.localRevision)
    ? value.localRevision
    : 0;
}

/**
 * Read a pointer and everything it references in one readonly transaction.
 * Format 3 manifests reference content-addressed asset records; format 2
 * manifests reference ordered payload chunks; legacy v1 records are complete
 * Draft objects. All three are verified and validated before use, and the next
 * successful save rewrites the draft as a format 3 manifest.
 */
async function readStoredDraft(
  db: IDBDatabase,
  id: string,
): Promise<Draft | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['drafts', 'draftBlobs'], 'readonly');
    const pointers = transaction.objectStore('drafts');
    const blobs = transaction.objectStore('draftBlobs');
    const pointerRequest = pointers.get(id);
    let pointer: StoredDraftPointer | undefined;
    let chunkValues: unknown[] = [];
    const assetRecords = new Map<string, unknown>();
    pointerRequest.onsuccess = () => {
      pointer = pointerRequest.result as StoredDraftPointer | undefined;
      if (pointer === undefined) return;
      if (isDraftManifest(pointer)) {
        for (const hash of manifestAssetHashes(pointer)) {
          const assetRequest = blobs.get(draftAssetKey(id, hash));
          assetRequest.onsuccess = () => {
            if (assetRequest.result !== undefined)
              assetRecords.set(hash, assetRequest.result);
          };
        }
        return;
      }
      if (!isDraftBundleManifest(pointer)) return;
      chunkValues = Array.from({ length: pointer.chunks.length });
      pointer.chunks.forEach((key, index) => {
        const chunkRequest = blobs.get(key);
        chunkRequest.onsuccess = () => {
          chunkValues[index] = chunkRequest.result;
        };
      });
    };
    pointerRequest.onerror = () => reject(pointerRequest.error);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Draft read aborted'));
    transaction.oncomplete = () => {
      void (async () => {
        try {
          if (pointer === undefined) {
            resolve(undefined);
            return;
          }
          if (isDraftManifest(pointer)) {
            const manifest = pointer;
            const draft = validateDraft(
              await decodeDraftManifest(manifest, assetRecords),
            );
            if ((draft.localRevision || 0) !== manifest.localRevision)
              throw new Error('Draft manifest revision mismatch');
            persistedTiles.set(id, new Set(Object.keys(manifest.tileRefs || {})));
            // Every asset was just hash-verified and validated; remember that
            // so the first save after recovery stays incremental.
            rememberVerifiedAssets(
              draft.assets,
              new Map(
                Object.entries(manifest.assetRefs).flatMap(([assetId, ref]) =>
                  'hash' in ref ? [[assetId, ref.hash] as const] : [],
                ),
              ),
            );
            resolve(draft);
            return;
          }
          if (!isDraftBundleManifest(pointer)) {
            resolve(validateDraft(pointer));
            return;
          }
          const decoded = await decodeDraftBundle(pointer, chunkValues);
          const draft = validateDraft(decoded);
          if ((draft.localRevision || 0) !== pointer.localRevision)
            throw new Error('Draft bundle revision mismatch');
          resolve(draft);
        } catch (error) {
          reject(error);
        }
      })();
    };
  });
}

export async function discardDraft(id: string, expectedRevision: number) {
  if (!validId(id)) throw new Error('Invalid draft ID');
  if (!validRevision(expectedRevision))
    throw new Error('Invalid draft revision');
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(['drafts', 'draftBlobs'], 'readwrite');
    const store = transaction.objectStore('drafts');
    const blobs = transaction.objectStore('draftBlobs');
    let conflict = false;
    const read = store.get(id);
    read.onsuccess = () => {
      const pointer = read.result as StoredDraftPointer | undefined;
      if (storedRevision(pointer) !== expectedRevision) {
        conflict = true;
        transaction.abort();
        return;
      }
      if (isDraftBundleManifest(pointer))
        pointer.chunks.forEach((key) => blobs.delete(key));
      blobs.delete(draftAssetRange(id));
      store.delete(id);
    };
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(conflict ? new Error(LOCAL_CONFLICT) : transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
  try {
    if (localStorage.getItem('pixelforge:last-draft') === id)
      localStorage.removeItem('pixelforge:last-draft');
    sessionStorage.removeItem(PENDING_DRAFT_PREFIX + id);
  } catch {
    /* Already unavailable. */
  }
}

export async function readDraft(id: string): Promise<Draft | undefined> {
  if (!validId(id)) throw new Error('Invalid draft ID');
  const db = await openDatabase();
  const saved = await readStoredDraft(db, id);
  // Read after the stored draft: a tiled snapshot takes its tiles from it.
  const pending = readPendingDraft(id, true);
  if (saved === undefined) return pending?.draft;
  if (
    !pending ||
    (pending.draft.localRevision || 0) < (saved.localRevision || 0)
  )
    return saved;
  // The session snapshot may have been staged just before a reload while its
  // IndexedDB transaction was still in flight. Rebase the pending value onto
  // the revision that actually exists so the first save after recovery can
  // commit it instead of reporting a false conflict.
  if ((pending.draft.localRevision || 0) === (saved.localRevision || 0))
    return saved;
  return { ...pending.draft, localRevision: saved.localRevision || 0 };
}

function isQuotaError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as { name?: unknown }).name === 'QuotaExceededError'
  );
}

/**
 * Commit a format 3 manifest. The pointer read, revision check, new asset
 * writes, garbage collection of this draft's unreferenced asset records,
 * removal of a migrated format 2 bundle and the pointer write all happen in
 * one read-write transaction: an interrupted or failed save leaves the
 * previous complete revision readable, and a committed manifest never lacks a
 * record it references.
 */
function commitDraftManifest(
  db: IDBDatabase,
  id: string,
  expectedRevision: number,
  manifest: DraftManifest,
  needed: ReadonlyMap<string, string | Blob>,
): Promise<{ assetWrites: number; assetDeletes: number; bytesWritten: number }> {
  return new Promise((resolve, reject) => {
    const stats = { assetWrites: 0, assetDeletes: 0, bytesWritten: 0 };
    let conflict = false;
    let failure: unknown;
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(['drafts', 'draftBlobs'], 'readwrite');
    } catch (error) {
      reject(error);
      return;
    }
    const store = transaction.objectStore('drafts');
    const blobs = transaction.objectStore('draftBlobs');
    const read = store.get(id);
    read.onsuccess = () => {
      const previous = read.result as StoredDraftPointer | undefined;
      if (storedRevision(previous) !== expectedRevision) {
        conflict = true;
        transaction.abort();
        return;
      }
      const keys = blobs.getAllKeys(draftAssetRange(id));
      keys.onsuccess = () => {
        const plan = planDraftAssetWrites(id, needed, keys.result);
        for (const [key, value] of plan.puts) {
          blobs.put(value, key);
          stats.assetWrites += 1;
          stats.bytesWritten += 'blob' in value ? value.blob.size : value.bytes.byteLength;
        }
        for (const key of plan.deletes) blobs.delete(key);
        stats.assetDeletes = plan.deletes.length;
        if (isDraftBundleManifest(previous))
          previous.chunks.forEach((key) => blobs.delete(key));
        // The manifest is the atomic pointer, written last in the same
        // transaction as every record it references.
        store.put(manifest, id);
      };
    };
    transaction.onerror = (event) => {
      failure ??= (event.target as IDBRequest | null)?.error ?? transaction.error;
    };
    transaction.oncomplete = () => resolve(stats);
    transaction.onabort = () => {
      const error = transaction.error ?? failure;
      if (conflict) reject(new Error(LOCAL_CONFLICT));
      else if (isQuotaError(error) || isQuotaError(failure))
        reject(new Error(LOCAL_STORAGE_FULL));
      else
        reject(
          error instanceof Error
            ? error
            : new Error('Local save was interrupted'),
        );
    };
  });
}

export async function saveDraft(
  id: string,
  value: Draft,
  expectedRevision = 0,
  pendingToken?: string,
): Promise<number> {
  if (!validId(id)) throw new Error('Invalid draft ID');
  if (!validRevision(expectedRevision))
    throw new Error('Invalid draft revision');
  const revision = expectedRevision + 1;
  if (!validRevision(revision)) throw new Error('Invalid draft revision');
  const started =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  const saveSpan = beginPerformanceSpan('save');
  try {
    // Frames and settings are always validated; assets already verified in
    // this tab are matched by identity instead of being re-scanned.
    const safeValue = prepareDraftForStorage(value);
    const db = await openDatabase();
    const { hashes, tiles } = await hashDraftAssets(safeValue.assets);
    const hashedAssets = lastSaveStats.hashedAssets;
    const manifest = createDraftManifest(
      safeValue,
      revision,
      hashes,
      undefined,
      new Map([...tiles].map(([key, tile]) => [key, tile.hash])),
    );
    const needed = new Map<string, string | Blob>();
    for (const [assetId, asset] of Object.entries(safeValue.assets))
      if (isPngAsset(asset)) needed.set(hashes.get(assetId)!, asset.url);
    for (const tile of tiles.values()) needed.set(tile.hash, tile.blob);
    const stats = await commitDraftManifest(
      db,
      id,
      expectedRevision,
      manifest,
      needed,
    );
    persistedTiles.set(id, new Set(Object.keys(manifest.tileRefs || {})));
    clearPendingDraft(id, revision, pendingToken);
    lastSaveStats = {
      revision,
      assets: needed.size,
      hashedAssets,
      ...stats,
      durationMs:
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
        started,
    };
    return revision;
  } finally {
    saveSpan.finish();
  }
}
