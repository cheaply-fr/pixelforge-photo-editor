'use client';

import {
  Brush,
  Bookmark,
  Crop,
  Download,
  Eraser,
  FileImage,
  Copy,
  Columns3,
  Palette,
  FlipHorizontal2,
  FlipVertical2,
  ImagePlus,
  Hand,
  Hash,
  Hexagon,
  Grid3x3,
  Minus,
  Pipette,
  PaintBucket,
  Pencil,
  MousePointer2,
  Redo2,
  Rows3,
  RotateCcw,
  RotateCw,
  Ruler,
  Eye,
  Save,
  Shapes,
  Sparkles,
  StickyNote,
  Sun,
  Moon,
  Type,
  Undo2,
  Upload,
  WandSparkles,
  Wand2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  LOCAL_CONFLICT,
  createDraftId,
  discardDraft,
  initialDraftId,
  isNewerDraftRevision,
  readDraft,
  saveDraft,
  stagePendingDraft,
  validateDraft,
  type Tool,
  type Draft,
  type Settings,
} from '../src/drafts';
import {
  useMember,
  openCloudProject,
  saveCloudProject,
  SIGN_IN,
  CloudConflictError,
  type CloudLink,
} from '../src/cloud';
import {
  addAsset,
  colorSelectMask,
  commonLayer,
  isRasterContentLayer,
  isMaskableLayer,
  decodeAsset,
  effectiveAdjustments,
  inversePoint,
  localSize,
  multiply,
  neutral,
  rasterFrame,
  replaceColorStroke,
  renderFrame,
  groupLayerMembers,
  assignLayerToGroup,
  transformSelection as transformSelectionModel,
  surface,
  transformFrameWithMasks,
  floodFill,
  drawTextLayer,
  effectiveTextLayer,
  type Adjustments,
  type Group,
  type Layer,
  type Frame,
  type Matrix,
  type Selection,
  type SelectionOperation,
  type SelectionPart,
  type TextAlign,
  type Assets,
} from '../src/document';
import {
  alphaFromRgba,
  normalizeTextMaskRequest,
  TEXT_MASK_MAX_PIXELS,
  type TextMaskOrientation,
} from '../src/textMask';
import { useDocument } from '../src/useDocument';
import {
  beginPerformanceSpan,
  type PerformanceSpan,
} from '../src/performanceMarks';
import LayersPanel from '../src/LayersPanel';
import ResizeDialog from '../src/ResizeDialog';
import ExportDialog from '../src/ExportDialog';
import BatchExportDialog from '../src/BatchExportDialog';
import ImageBatchDialog from '../src/ImageBatchDialog';
import type { BatchImageSource } from '../src/imageBatch';
import AccountMenu from '../src/AccountMenu';
import ReleaseStatus from '../src/ReleaseStatusView';
import SelectionTransformDialog from '../src/SelectionTransformDialog';
import LayerTransformDialog, {
  type LayerTransformBounds,
} from '../src/LayerTransformDialog';
import SelectionModifyDialog from '../src/SelectionModifyDialog';
import ColorRangeDialog from '../src/ColorRangeDialog';
import FillLayerDialog from '../src/FillLayerDialog';
import FocusAreaDialog from '../src/FocusAreaDialog';
import CanvasSizeDialog from '../src/CanvasSizeDialog';
import TrimDialog from '../src/TrimDialog';
import {
  measuredTextLayerBounds,
  planCanvasSize,
  layerBounds,
  layerLocalBounds,
  planRevealAll,
  trimBounds,
  type CanvasSizeRequest,
  type TrimMode,
  type TrimSides,
} from '../src/canvasSize';
import {
  alignmentDelta,
  distributionDeltas,
  translateMatrix,
  type AlignmentMode,
  type DistributionAxis,
} from '../src/layerAlignment';
import {
  applySelectedLayerMerge,
  layerMergeReason,
  planLayerMerge,
  planSelectedLayerMerge,
  selectedLayerMergeReason,
} from '../src/layerMerge';
import {
  applyMergeVisible,
  mergeVisibleReason,
  planMergeVisible,
} from '../src/layerMergeVisible';
import {
  applyLayerArrange,
  layerArrangeReason,
  planLayerArrange,
  type LayerArrangeMode,
} from '../src/layerArrange';
import { combineSelectionBounds } from '../src/layerSelection';
import {
  clippingCandidateBase,
  isClippingSourceLayer,
  validClippingRelationship,
} from '../src/layerClipping';
import CurveEditor from '../src/CurveEditor';
import { type CurveChannel, type CurvePoints } from '../src/curves';
import { applyAutoAdjustmentsPixels, type AutoMode } from '../src/auto';
import { createBackgroundMask } from '../src/backgroundRemoval';
import {
  applyMaskRefinementPixels,
  MASK_REFINEMENT_MAX_POINTS,
  type MaskRefinementMode,
  type MaskRefinementStroke,
} from '../src/maskRefinement';
import { type ExportFormat } from '../src/export';
import ActionsPanel from '../src/ActionsPanel';
import {
  MAX_ACTION_SETS,
  appendActionStep,
  createActionSet,
  parseActionSets,
  replayActionSet,
  serializeActionSets,
  type ActionSet,
  type ActionStep,
} from '../src/actions';
import {
  describeImportFormat,
  importFailureMessage,
} from '../src/importFormats';
import { renderSelection } from '../src/selections';
import {
  refineSelectionAlpha,
  type SelectionRefineMode,
} from '../src/selectionRefine';
import {
  combineSelectionBrushMasks,
  paintSelectionBrushSegment,
} from '../src/selectionBrush';
import { snapMagneticPoint } from '../src/magneticLasso';
import { appendFreeformPoint, buildFreeformPath } from '../src/freeformPen';
import { appendCurvaturePoint, buildCurvaturePath } from '../src/curvaturePen';
import { colorRangeMask } from '../src/colorRange';
import { focusAreaMask } from '../src/focusArea';
import { similarColorMask } from '../src/similarSelection';
import {
  canvasPointFromClient,
  normalizeViewRotation,
  rotationDelta,
  screenPanDelta,
} from '../src/viewRotation';
import {
  booleanPathFromPoints,
  booleanPathIsClosed,
  combinePathBooleans,
  type BooleanPoint,
  type PathBooleanOperation,
} from '../src/pathBooleans';
import { pathContours, transformPath } from '../src/paths';
import { shapePoints } from '../src/vectorShapes';
import { quickSelectionMask } from '../src/quickSelection';
import { composeSelectionAlpha } from '../src/selectionComposition';
import {
  createQuickMask,
  loadSelection,
  paintQuickMask,
  parseSavedSelections,
  quickMaskOverlay,
  saveSelection,
  serializeSavedSelections,
  selectionFromQuickMask,
  emptySavedSelectionBook,
  deleteSelection,
  renameSelection,
  type QuickMask,
  type SavedSelectionBook,
} from '../src/savedSelections';
import { BrandLockup } from '../src/Brand';
import {
  effectiveImageSize,
  planImageSize,
  type ImageSizeRequest,
} from '../src/imageSize';
import {
  applyRadialStamp,
  BRUSH_DEFAULT_ANGLE,
  BRUSH_DEFAULT_ROUNDNESS,
  BRUSH_DEFAULT_SPACING,
  resolveBrushStamp,
  type BrushColor,
  type BrushMode,
} from '../src/brush';
import {
  BRUSH_PRESETS,
  brushPresetById,
  type BrushPresetId,
} from '../src/brushPresets';
import {
  PATTERN_IDS,
  applyPatternStamp,
  type PatternId,
} from '../src/patternStamp';
import {
  TOOL_CATEGORIES,
  compactCategoryTools,
  flyoutForTool,
  flyoutTools,
} from '../src/toolPalette';
import { removeRedEye } from '../src/redEye';
import { ToolFlyout } from '../src/ToolFlyout';
import { eraseBackgroundStroke, eraseMagicRegion } from '../src/erasers';
import {
  applyDodgeBurnStroke,
  applySpongeStroke,
  type TonalRange,
  type SpongeMode,
} from '../src/tonal';
import {
  hitTestPathHandle,
  hitTestPathNode,
  movePathHandle,
  movePathNode,
  insertPathNode,
  nearestPathSegment,
  removePathNode,
  setPathNodeSmooth,
  validatePath,
  type PathHandleKind,
  type PathNode,
  type PathModel,
} from '../src/paths';
import { applySmudgeStroke } from '../src/smudge';
import {
  DEFAULT_HISTORY_BRUSH,
  DEFAULT_MIXER_BRUSH,
  applyHistoryBrushPixels,
  applyMixerBrushPixels,
  type HistoryBrushSettings,
  type MixerBrushSettings,
  type BrushStrokePoint,
} from '../src/mixerHistoryBrush';
import {
  SPOT_HEALING_MAX_POINTS,
  SPOT_HEALING_MAX_STROKES,
  type SpotHealingStroke,
} from '../src/spotHealing';
import {
  PATCH_MAX_POINTS,
  PATCH_MAX_STROKES,
  type PatchStroke,
} from '../src/patchTool';
import {
  CONTENT_AWARE_MAX_OPERATIONS,
  type ContentAwareFill,
} from '../src/contentAwareCleanup';
import {
  FILTER_EFFECT_TYPES,
  effectiveFilterEffects,
  neutralFilterEffects,
  type FilterEffectType,
} from '../src/filterEffects';
import BlurGalleryControls, {
  DEFAULT_BLUR_PATH,
  DEFAULT_SPIN_ELLIPSE,
} from '../src/BlurGalleryControls';
import {
  cropMeasurements,
  extractSlices,
  planPerspectiveCrop,
  planRectangularCrop,
  planSlices,
  warpPerspectiveRgba,
  type CropQuad,
  type PerspectiveCropPlan,
  type RectangularCropPlan,
  type SliceRect,
} from '../src/cropTools';
import {
  createArtboard,
  sanitizeArtboardLayerMembership,
} from '../src/artboards';
import { sliceAtPoint } from '../src/slices';
import {
  formatMeasurement,
  measurementAngle,
  measurementDistance,
  newMeasurementId,
  nextCountIndex,
  type MeasurementAnnotation,
  type MeasurementPoint,
} from '../src/measurements';
type MenuName =
  | 'File'
  | 'Edit'
  | 'Image'
  | 'Layer'
  | 'Type'
  | 'Select'
  | 'Filter'
  | 'View'
  | 'Plugins';
type Command =
  | 'noop'
  | 'actions'
  | 'patch-tool'
  | 'mixer-brush-tool'
  | 'history-brush-tool'
  | 'set-history-source'
  | 'content-aware-fill'
  | 'resize'
  | 'canvas-size'
  | 'trim'
  | 'reveal-all'
  | 'project-save'
  | 'batch-export'
  | 'batch-images'
  | 'project-open'
  | 'new-white'
  | 'new-transparent'
  | 'open'
  | 'png'
  | 'jpg'
  | 'webp'
  | 'undo'
  | 'redo'
  | 'copy-layer'
  | 'cut-layer'
  | 'paste-layer'
  | 'clear-layer'
  | 'fill-layer'
  | 'new-layer'
  | 'new-fill-layer'
  | 'new-adjustment-layer'
  | 'new-smart-object'
  | 'replace-smart-object'
  | 'rasterize-layer'
  | 'duplicate-layer'
  | 'delete-layer'
  | 'group-layer'
  | 'ungroup-layer'
  | 'align-left'
  | 'align-center-horizontal'
  | 'align-right'
  | 'align-top'
  | 'align-center-vertical'
  | 'align-bottom'
  | 'distribute-horizontal'
  | 'distribute-vertical'
  | 'hide-layer'
  | 'arrange-front'
  | 'arrange-forward'
  | 'arrange-backward'
  | 'arrange-back'
  | 'merge-layers'
  | 'merge-visible'
  | 'combine-shapes-union'
  | 'combine-shapes-subtract'
  | 'combine-shapes-intersect'
  | 'combine-shapes-exclude'
  | 'flatten'
  | 'text-tool'
  | 'text-align-left'
  | 'text-align-center'
  | 'text-align-right'
  | 'text-orientation-horizontal'
  | 'text-orientation-vertical'
  | 'text-mask-horizontal'
  | 'text-mask-vertical'
  | 'select-all'
  | 'select-all-layers'
  | 'deselect-layers'
  | 'find-layers'
  | 'isolate-layers'
  | 'deselect'
  | 'reselect'
  | 'invert-selection'
  | 'transform-selection'
  | 'grow-selection'
  | 'contract-selection'
  | 'border-selection'
  | 'smooth-selection'
  | 'similar-selection'
  | 'color-range'
  | 'focus-area'
  | 'mask-selection'
  | 'remove-background'
  | 'invert-layer-mask'
  | 'toggle-layer-mask'
  | 'remove-layer-mask'
  | 'create-clipping-mask'
  | 'release-clipping-mask'
  | 'free-transform'
  | 'quick-mask'
  | 'save-selection'
  | 'load-selection'
  | 'reset'
  | 'levels'
  | 'curves'
  | 'hue-saturation'
  | 'color-balance'
  | 'sharpen-noise'
  | 'auto-tone'
  | 'auto-contrast'
  | 'auto-color'
  | 'crop'
  | 'perspective-crop'
  | 'slice'
  | 'slice-select'
  | 'frame'
  | 'rotate-left'
  | 'rotate-right'
  | 'flip-h'
  | 'flip-v'
  | 'filter-original'
  | 'filter-vivid'
  | 'filter-mono'
  | 'filter-warm'
  | 'filter-cool'
  | 'filter-average'
  | 'filter-blur-more'
  | 'filter-box-blur'
  | 'filter-gaussian-blur'
  | 'filter-lens-blur'
  | 'filter-iris-blur'
  | 'filter-smart-blur'
  | 'filter-surface-blur'
  | 'filter-shape-blur'
  | 'filter-motion-blur'
  | 'filter-radial-blur'
  | 'filter-spin-blur'
  | 'filter-path-blur'
  | 'filter-field-blur'
  | 'filter-tilt-shift'
  | 'filter-mosaic'
  | 'filter-crystallize'
  | 'filter-color-halftone'
  | 'filter-pointillize'
  | 'filter-lens-correction'
  | 'filter-displace'
  | 'filter-pinch'
  | 'filter-polar-coordinates'
  | 'filter-ripple'
  | 'filter-spherize'
  | 'filter-twirl'
  | 'filter-wave'
  | 'filter-shear'
  | 'filter-zigzag'
  | 'filter-clear-effect'
  | 'zoom-in'
  | 'zoom-out'
  | 'fit'
  | 'actual'
  | 'rotate-view-left'
  | 'rotate-view-right'
  | 'reset-rotate-view';
type MenuItem = {
  label: string;
  shortcut?: string;
  command: Command;
  disabled?: boolean;
  separator?: boolean;
};

const TOOLS: { id: Tool; label: string; icon: typeof Brush; key: string }[] = [
  { id: 'move', label: 'Move', icon: MousePointer2, key: 'V' },
  { id: 'hand', label: 'Hand', icon: Hand, key: 'H' },
  { id: 'zoom', label: 'Zoom', icon: ZoomIn, key: 'Z' },
  { id: 'rotate-view', label: 'Rotate View', icon: RotateCw, key: 'R' },
  { id: 'eyedropper', label: 'Eyedropper', icon: Pipette, key: 'I' },
  { id: 'color-sampler', label: 'Color Sampler', icon: Pipette, key: 'I' },
  { id: 'ruler', label: 'Ruler', icon: Ruler, key: 'I' },
  { id: 'note', label: 'Note', icon: StickyNote, key: 'I' },
  { id: 'count', label: 'Count', icon: Hash, key: 'I' },
  { id: 'fill', label: 'Fill', icon: PaintBucket, key: 'G' },
  { id: 'gradient', label: 'Gradient', icon: Palette, key: 'G' },
  { id: 'clone', label: 'Clone', icon: Copy, key: 'S' },
  { id: 'heal', label: 'Healing', icon: WandSparkles, key: 'J' },
  { id: 'spot-heal', label: 'Spot Healing', icon: WandSparkles, key: 'J' },
  { id: 'patch', label: 'Patch', icon: WandSparkles, key: 'J' },
  { id: 'red-eye', label: 'Red Eye', icon: Eye, key: 'J' },
  { id: 'pattern-stamp', label: 'Pattern Stamp', icon: Grid3x3, key: 'S' },
  { id: 'crop', label: 'Crop', icon: Crop, key: 'C' },
  { id: 'perspective-crop', label: 'Perspective Crop', icon: Crop, key: 'C' },
  { id: 'slice', label: 'Slice', icon: Crop, key: 'C' },
  { id: 'slice-select', label: 'Slice Select', icon: Crop, key: 'C' },
  { id: 'frame', label: 'Frame', icon: Crop, key: 'K' },
  { id: 'brush', label: 'Brush', icon: Brush, key: 'B' },
  { id: 'mixer-brush', label: 'Mixer Brush', icon: Brush, key: 'B' },
  { id: 'history-brush', label: 'History Brush', icon: Undo2, key: 'Y' },
  { id: 'pencil', label: 'Pencil', icon: Pencil, key: 'B' },
  { id: 'color-replace', label: 'Color Replace', icon: Palette, key: 'B' },
  { id: 'eraser', label: 'Eraser', icon: Eraser, key: 'E' },
  {
    id: 'background-eraser',
    label: 'Background Eraser',
    icon: Eraser,
    key: 'E',
  },
  { id: 'magic-eraser', label: 'Magic Eraser', icon: Wand2, key: 'E' },
  { id: 'mask-brush', label: 'Mask Brush', icon: Brush, key: 'K' },
  { id: 'mask-eraser', label: 'Mask Eraser', icon: Eraser, key: 'K' },
  { id: 'adjustment-brush', label: 'Adjustment Brush', icon: Brush, key: 'K' },
  { id: 'dodge', label: 'Dodge', icon: Sun, key: 'O' },
  { id: 'burn', label: 'Burn', icon: Moon, key: 'O' },
  { id: 'sponge', label: 'Sponge', icon: Sparkles, key: 'O' },
  { id: 'smudge', label: 'Smudge', icon: Brush, key: 'R' },
  { id: 'pen', label: 'Pen', icon: Pencil, key: 'P' },
  { id: 'freeform-pen', label: 'Freeform Pen', icon: Pencil, key: 'P' },
  { id: 'curvature-pen', label: 'Curvature Pen', icon: Pencil, key: 'P' },
  {
    id: 'direct-select',
    label: 'Direct Selection',
    icon: MousePointer2,
    key: 'A',
  },
  { id: 'text', label: 'Text', icon: Type, key: 'T' },
  { id: 'rectangle', label: 'Shape', icon: Shapes, key: 'U' },
  { id: 'ellipse', label: 'Ellipse', icon: Shapes, key: 'U' },
  { id: 'line', label: 'Line', icon: Minus, key: 'U' },
  { id: 'polygon', label: 'Polygon', icon: Hexagon, key: 'U' },
  { id: 'select', label: 'Select', icon: Crop, key: 'M' },
  { id: 'ellipse-select', label: 'Elliptical marquee', icon: Shapes, key: 'M' },
  { id: 'row-select', label: 'Single Row marquee', icon: Rows3, key: 'M' },
  {
    id: 'column-select',
    label: 'Single Column marquee',
    icon: Columns3,
    key: 'M',
  },
  { id: 'lasso', label: 'Lasso', icon: WandSparkles, key: 'L' },
  {
    id: 'polygonal-lasso',
    label: 'Polygonal Lasso',
    icon: WandSparkles,
    key: 'L',
  },
  {
    id: 'magnetic-lasso',
    label: 'Magnetic Lasso',
    icon: WandSparkles,
    key: 'L',
  },
  {
    id: 'selection-brush',
    label: 'Selection Brush',
    icon: WandSparkles,
    key: 'L',
  },
  { id: 'quick-selection', label: 'Quick Selection', icon: Wand2, key: 'W' },
  { id: 'magic-wand', label: 'Magic Wand', icon: Wand2, key: 'W' },
];
const toolSelectionNotice = (tool: Tool, label: string) =>
  tool === 'magnetic-lasso'
    ? 'Magnetic Lasso: drag along an edge, release to close'
    : `${label} tool selected`;
const flyoutToolLabel = (tool: Tool, label: string) =>
  tool === 'select'
    ? 'Rectangular Marquee'
    : tool === 'ellipse-select'
      ? 'Elliptical Marquee'
    : tool === 'lasso'
      ? 'Freeform Lasso'
      : label;
const flyoutToolKey = (tool: Tool, key: string) =>
  tool === 'selection-brush' ? 'W' : key;

/** Keep transient canvas previews out of the render function's mutable path. */
const setPreviewAsset = (
  assets: Assets,
  id: string,
  canvas: HTMLCanvasElement,
) => {
  assets[id] = { url: canvas.toDataURL(), w: canvas.width, h: canvas.height };
};
const discardPreviewAsset = (assets: Assets, id: string | undefined) => {
  if (id) delete assets[id];
};

const MARQUEE_TOOLS: Tool[] = [
  'select',
  'ellipse-select',
  'row-select',
  'column-select',
];
/** Photoshop's repeated-key tool groups, limited to tools PixelForge actually implements. */
const TOOL_GROUPS: Record<string, Tool[]> = {
  c: ['crop', 'perspective-crop', 'slice', 'slice-select'],
  g: ['gradient', 'fill'],
  b: ['brush', 'pencil', 'color-replace', 'mixer-brush'],
  u: ['rectangle', 'ellipse', 'line', 'polygon'],
  m: MARQUEE_TOOLS,
  i: ['eyedropper', 'color-sampler', 'ruler', 'note', 'count'],
  l: ['lasso', 'polygonal-lasso', 'magnetic-lasso', 'selection-brush'],
  w: ['selection-brush', 'quick-selection', 'magic-wand'],
  e: ['eraser', 'background-eraser', 'magic-eraser'],
  k: ['frame', 'mask-brush', 'mask-eraser', 'adjustment-brush'],
  o: ['dodge', 'burn', 'sponge'],
  r: ['rotate-view', 'smudge'],
  s: ['clone', 'pattern-stamp'],
  y: ['history-brush'],
  j: ['heal', 'spot-heal', 'patch', 'red-eye'],
  p: ['pen', 'freeform-pen', 'curvature-pen'],
};
/** Existing PixelForge aliases retained while the primary keys follow Photoshop. */
const TOOL_ALIASES: Record<string, Tool> = {
  a: 'direct-select',
};
const FILTERS = [
  ['Original', 'none', '#315277', '#d59b6c'],
  ['Vivid', 'saturate(1.45) contrast(1.08)', '#244d96', '#ef854a'],
  ['Mono', 'grayscale(1) contrast(1.12)', '#3d4249', '#c6cbd0'],
  ['Warm', 'sepia(.35) saturate(1.2)', '#654737', '#e8a467'],
  ['Cool', 'hue-rotate(18deg) saturate(.9)', '#335d91', '#83bbc4'],
] as const;
const MENU_DEFS: Record<MenuName, MenuItem[]> = {
  File: [
    { label: 'Open project…', command: 'project-open' },
    { label: 'Download project file', command: 'project-save' },
    { label: 'Batch export history…', command: 'batch-export' },
    { label: 'Batch export images…', command: 'batch-images' },
    { label: 'New white document', shortcut: 'Ctrl+N', command: 'new-white' },
    { label: 'New transparent document', command: 'new-transparent' },
    { label: 'Open image…', shortcut: 'Ctrl+O', command: 'open' },
    { label: 'Export as PNG', shortcut: 'Ctrl+S', command: 'png' },
    { label: 'Export as JPEG', command: 'jpg' },
    { label: 'Export as WebP', command: 'webp' },
  ],
  Edit: [
    { label: 'Undo', shortcut: 'Ctrl+Z', command: 'undo' },
    { label: 'Redo', shortcut: 'Ctrl+Y', command: 'redo' },
    {
      label: 'Toggle Last State',
      shortcut: 'Ctrl+Alt+Z',
      command: 'undo',
      disabled: true,
    },
    { label: '', command: 'noop', separator: true },
    {
      label: 'Fade…',
      shortcut: 'Ctrl+Shift+F',
      command: 'noop',
      disabled: true,
    },
    { label: '', command: 'noop', separator: true },
    { label: 'Copy Layer', shortcut: 'Ctrl+C', command: 'copy-layer' },
    { label: 'Cut Layer', shortcut: 'Ctrl+X', command: 'cut-layer' },
    { label: 'Paste Layer', shortcut: 'Ctrl+V', command: 'paste-layer' },
    {
      label: 'Copy Merged',
      shortcut: 'Ctrl+Shift+C',
      command: 'noop',
      disabled: true,
    },
    { label: 'Clear', command: 'clear-layer' },
    { label: '', command: 'noop', separator: true },
    { label: 'Search', shortcut: 'Ctrl+F', command: 'noop', disabled: true },
    { label: 'Check Spelling…', command: 'noop', disabled: true },
    { label: 'Find and Replace Text…', command: 'noop', disabled: true },
    { label: '', command: 'noop', separator: true },
    { label: 'Fill…', shortcut: 'Shift+F5', command: 'fill-layer' },
    { label: 'Action recipes…', command: 'actions' },
    { label: 'Patch Tool', shortcut: 'J', command: 'patch-tool' },
    { label: 'Mixer Brush Tool', shortcut: 'B', command: 'mixer-brush-tool' },
    { label: 'History Brush Tool', shortcut: 'Y', command: 'history-brush-tool' },
    { label: 'Set History Brush Source', command: 'set-history-source' },
    { label: 'Stroke…', command: 'noop', disabled: true },
    { label: 'Content-Aware Fill…', command: 'content-aware-fill' },
    { label: 'Prompt to Edit…', command: 'noop', disabled: true },
    { label: 'Generative Fill…', command: 'noop', disabled: true },
    { label: 'Generate Image…', command: 'noop', disabled: true },
    { label: 'Reflection Removal…', command: 'noop', disabled: true },
    { label: 'Remove Background…', command: 'remove-background' },
    { label: '', command: 'noop', separator: true },
    {
      label: 'Free Transform',
      shortcut: 'Ctrl+T',
      command: 'free-transform',
    },
    { label: 'Transform', command: 'noop', disabled: true },
    { label: 'Perspective Warp', command: 'noop', disabled: true },
    { label: 'Puppet Warp', command: 'noop', disabled: true },
    { label: 'Content-Aware Scale', command: 'noop', disabled: true },
    { label: '', command: 'noop', separator: true },
    { label: 'Define Brush Preset…', command: 'noop', disabled: true },
    { label: 'Define Pattern…', command: 'noop', disabled: true },
    { label: 'Purge', command: 'noop', disabled: true },
    { label: '', command: 'noop', separator: true },
    { label: 'Color Settings…', command: 'noop', disabled: true },
    { label: 'Keyboard Shortcuts…', command: 'noop', disabled: true },
    { label: 'Menus…', command: 'noop', disabled: true },
    { label: 'Toolbar…', command: 'noop', disabled: true },
    { label: 'Reset adjustments', command: 'reset' },
  ],
  Image: [
    { label: 'Mode', command: 'noop', disabled: true },
    { label: 'Adjustments', command: 'reset', disabled: true },
    { label: 'Levels…', command: 'levels' },
    { label: 'Curves…', command: 'curves' },
    { label: 'Hue/Saturation…', command: 'hue-saturation' },
    { label: 'Color Balance…', command: 'color-balance' },
    {
      label: 'Auto Tone',
      shortcut: 'Shift+Ctrl+L',
      command: 'auto-tone',
    },
    { label: 'Auto Contrast', command: 'auto-contrast' },
    { label: 'Auto Color', command: 'auto-color' },
    { label: '', command: 'noop', separator: true },
    { label: 'Image Size…', shortcut: 'Alt+Ctrl+I', command: 'resize' },
    { label: 'Generative Upscale…', command: 'noop', disabled: true },
    { label: 'Canvas Size…', command: 'canvas-size' },
    { label: 'Image Rotation', command: 'noop', disabled: true },
    { label: 'Resize image…', command: 'resize' },
    { label: 'Crop', shortcut: 'C', command: 'crop' },
    { label: 'Perspective Crop…', command: 'perspective-crop' },
    { label: 'Slice tool', shortcut: 'C', command: 'slice' },
    { label: 'Slice Select tool', shortcut: 'C', command: 'slice-select' },
    { label: 'Frame tool', shortcut: 'K', command: 'frame' },
    { label: 'Rotate left', command: 'rotate-left' },
    { label: 'Rotate right', command: 'rotate-right' },
    { label: 'Flip horizontal', command: 'flip-h' },
    { label: 'Flip vertical', command: 'flip-v' },
    { label: 'Trim…', command: 'trim' },
    { label: 'Reveal All', command: 'reveal-all' },
    { label: '', command: 'noop', separator: true },
    { label: 'Duplicate…', command: 'noop', disabled: true },
    { label: 'Apply Image…', command: 'noop', disabled: true },
    { label: 'Calculations…', command: 'noop', disabled: true },
    { label: 'Analysis', command: 'noop', disabled: true },
  ],
  Layer: [
    { label: 'New Paint Layer', command: 'new-layer' },
    {
      label: 'Duplicate Layer…',
      shortcut: 'Ctrl+J',
      command: 'duplicate-layer',
    },
    { label: 'Delete Layer', command: 'delete-layer' },
    { label: '', command: 'noop', separator: true },
    { label: 'Quick Export document as PNG', command: 'png' },
    { label: 'Export As…', command: 'png' },
    { label: 'Rename Layer…', command: 'noop', disabled: true },
    { label: 'Layer Style', command: 'noop', disabled: true },
    { label: 'Smart Filter', command: 'noop', disabled: true },
    { label: 'New Fill Layer…', command: 'new-fill-layer' },
    { label: 'New Adjustment Layer', command: 'new-adjustment-layer' },
    { label: 'Layer Mask', command: 'mask-selection' },
    { label: 'Invert Layer Mask', command: 'invert-layer-mask' },
    { label: 'Disable Layer Mask', command: 'toggle-layer-mask' },
    { label: 'Remove Layer Mask', command: 'remove-layer-mask' },
    { label: 'Vector Mask', command: 'noop', disabled: true },
    { label: 'Create Clipping Mask', command: 'create-clipping-mask' },
    { label: 'Release Clipping Mask', command: 'release-clipping-mask' },
    { label: 'New Smart Object…', command: 'new-smart-object' },
    { label: 'Replace Contents…', command: 'replace-smart-object' },
    { label: 'Rasterize', command: 'rasterize-layer' },
    { label: '', command: 'noop', separator: true },
    { label: 'Group Layers', shortcut: 'Ctrl+G', command: 'group-layer' },
    {
      label: 'Ungroup Layers',
      shortcut: 'Ctrl+Shift+G',
      command: 'ungroup-layer',
    },
    { label: 'Hide Layers', shortcut: 'Ctrl+,', command: 'hide-layer' },
    { label: 'Merge Layers', command: 'merge-layers' },
    { label: 'Merge Visible', command: 'merge-visible' },
    { label: 'Flatten Image', command: 'flatten' },
    { label: 'Bring to Front', command: 'arrange-front' },
    { label: 'Bring Forward', command: 'arrange-forward' },
    { label: 'Send Backward', command: 'arrange-backward' },
    { label: 'Send to Back', command: 'arrange-back' },
    { label: 'Combine Shapes → Union', command: 'combine-shapes-union' },
    { label: 'Combine Shapes → Subtract Front Shape', command: 'combine-shapes-subtract' },
    { label: 'Combine Shapes → Intersect', command: 'combine-shapes-intersect' },
    { label: 'Combine Shapes → Exclude Overlapping Shapes', command: 'combine-shapes-exclude' },
    { label: 'Align Left', command: 'align-left' },
    { label: 'Align Horizontal Centers', command: 'align-center-horizontal' },
    { label: 'Align Right', command: 'align-right' },
    { label: 'Align Top', command: 'align-top' },
    { label: 'Align Vertical Centers', command: 'align-center-vertical' },
    { label: 'Align Bottom', command: 'align-bottom' },
    {
      label: 'Distribute Horizontal Centers',
      command: 'distribute-horizontal',
    },
    { label: 'Distribute Vertical Centers', command: 'distribute-vertical' },
    { label: 'Lock Layers…', command: 'noop', disabled: true },
  ],
  Type: [
    { label: 'Text Tool', shortcut: 'T', command: 'text-tool' },
    { label: 'Align Left', command: 'text-align-left' },
    { label: 'Align Center', command: 'text-align-center' },
    { label: 'Align Right', command: 'text-align-right' },
    { label: 'Panels', command: 'noop', disabled: true },
    { label: 'Anti-Alias', command: 'noop', disabled: true },
    { label: 'Horizontal Type', command: 'text-orientation-horizontal' },
    { label: 'Vertical Type', command: 'text-orientation-vertical' },
    { label: 'Horizontal Type Mask', command: 'text-mask-horizontal' },
    { label: 'Vertical Type Mask', command: 'text-mask-vertical' },
    { label: 'OpenType', command: 'noop', disabled: true },
    { label: 'Create Work Path', command: 'noop', disabled: true },
    { label: 'Convert to Shape', command: 'noop', disabled: true },
    { label: 'Rasterize Type Layer', command: 'noop', disabled: true },
    { label: 'Warp Text…', command: 'noop', disabled: true },
    { label: 'Font Preview Size', command: 'noop', disabled: true },
    { label: 'Language Options', command: 'noop', disabled: true },
    { label: 'Update All Text Layers', command: 'noop', disabled: true },
    { label: 'Manage Missing Fonts', command: 'noop', disabled: true },
    { label: 'Paste Lorem Ipsum', command: 'noop', disabled: true },
    { label: 'Load Default Type Styles', command: 'noop', disabled: true },
    { label: 'Save Default Type Styles', command: 'noop', disabled: true },
  ],
  Select: [
    { label: 'All', shortcut: 'Ctrl+A', command: 'select-all' },
    { label: 'Deselect', shortcut: 'Ctrl+D', command: 'deselect' },
    { label: 'Reselect', command: 'reselect' },
    { label: 'Inverse', shortcut: 'Ctrl+Shift+I', command: 'invert-selection' },
    { label: '', command: 'noop', separator: true },
    { label: 'All Layers', command: 'select-all-layers' },
    { label: 'Deselect Layers', command: 'deselect-layers' },
    { label: 'Find Layers', command: 'find-layers', shortcut: 'Alt+Shift+Ctrl+F' },
    { label: 'Isolate Layers', command: 'isolate-layers' },
    { label: 'Color Range…', command: 'color-range' },
    { label: 'Focus Area…', command: 'focus-area' },
    { label: 'Subject', command: 'noop', disabled: true },
    { label: 'Sky', command: 'noop', disabled: true },
    { label: 'Select and Mask…', command: 'noop', disabled: true },
    { label: 'Modify', command: 'noop', disabled: true },
    { label: 'Grow…', command: 'grow-selection' },
    { label: 'Contract…', command: 'contract-selection' },
    { label: 'Border…', command: 'border-selection' },
    { label: 'Smooth…', command: 'smooth-selection' },
    { label: 'Similar', command: 'similar-selection' },
    { label: 'Transform Selection', command: 'transform-selection' },
    { label: 'Edit in Quick Mask Mode', command: 'quick-mask' },
    { label: 'Load Selection…', command: 'load-selection' },
    { label: 'Save Selection…', command: 'save-selection' },
    { label: 'Mask from Selection', command: 'mask-selection' },
  ],
  Filter: [
    { label: 'Original', command: 'filter-original' },
    { label: 'Vivid', command: 'filter-vivid' },
    { label: 'Mono', command: 'filter-mono' },
    { label: 'Warm', command: 'filter-warm' },
    { label: 'Cool', command: 'filter-cool' },
    { label: '', command: 'noop', separator: true },
    { label: 'Convert for Smart Filters', command: 'noop', disabled: true },
    { label: 'Neural Filters…', command: 'noop', disabled: true },
    { label: 'Filter Gallery…', command: 'noop', disabled: true },
    { label: 'Camera Raw Filter…', command: 'noop', disabled: true },
    { label: 'AI Denoise…', command: 'noop', disabled: true },
    { label: 'AI Sharpen…', command: 'noop', disabled: true },
    { label: 'Lens Correction…', command: 'filter-lens-correction' },
    { label: 'Liquify…', command: 'noop', disabled: true },
    { label: 'Vanishing Point…', command: 'noop', disabled: true },
    { label: '', command: 'noop', separator: true },
    { label: 'Blur', command: 'noop', disabled: true },
    { label: 'Field Blur…', command: 'filter-field-blur' },
    { label: 'Tilt-Shift…', command: 'filter-tilt-shift' },
    { label: 'Average', command: 'filter-average' },
    { label: 'Blur More', command: 'filter-blur-more' },
    { label: 'Box Blur…', command: 'filter-box-blur' },
    { label: 'Gaussian Blur…', command: 'filter-gaussian-blur' },
    { label: 'Lens Blur…', command: 'filter-lens-blur' },
    { label: 'Motion Blur…', command: 'filter-motion-blur' },
    { label: 'Radial Blur…', command: 'filter-radial-blur' },
    { label: 'Smart Blur…', command: 'filter-smart-blur' },
    { label: 'Surface Blur…', command: 'filter-surface-blur' },
    { label: 'Shape Blur…', command: 'filter-shape-blur' },
    { label: 'Blur Gallery', command: 'noop', disabled: true },
    { label: 'Iris Blur…', command: 'filter-iris-blur' },
    { label: 'Path Blur…', command: 'filter-path-blur' },
    { label: 'Spin Blur…', command: 'filter-spin-blur' },
    { label: 'Distort', command: 'noop', disabled: true },
    { label: 'Displace…', command: 'filter-displace' },
    { label: 'Pinch…', command: 'filter-pinch' },
    { label: 'Polar Coordinates…', command: 'filter-polar-coordinates' },
    { label: 'Ripple…', command: 'filter-ripple' },
    { label: 'Shear…', command: 'filter-shear' },
    { label: 'Spherize…', command: 'filter-spherize' },
    { label: 'Twirl…', command: 'filter-twirl' },
    { label: 'Wave…', command: 'filter-wave' },
    { label: 'ZigZag…', command: 'filter-zigzag' },
    { label: 'Noise', command: 'noop', disabled: true },
    { label: 'Add Noise…', command: 'sharpen-noise' },
    { label: 'Pixelate', command: 'noop', disabled: true },
    { label: 'Color Halftone…', command: 'filter-color-halftone' },
    { label: 'Crystallize…', command: 'filter-crystallize' },
    { label: 'Mosaic…', command: 'filter-mosaic' },
    { label: 'Pointillize…', command: 'filter-pointillize' },
    { label: 'Render', command: 'noop', disabled: true },
    { label: 'Clouds', command: 'noop', disabled: true },
    { label: 'Difference Clouds', command: 'noop', disabled: true },
    { label: 'Fibers…', command: 'noop', disabled: true },
    { label: 'Lens Flare…', command: 'noop', disabled: true },
    { label: 'Sharpen', command: 'sharpen-noise' },
    { label: 'Sharpen Edges', command: 'sharpen-noise' },
    { label: 'Sharpen More', command: 'sharpen-noise' },
    { label: 'Smart Sharpen…', command: 'sharpen-noise' },
    { label: 'Unsharp Mask…', command: 'sharpen-noise' },
    { label: 'Stylize', command: 'noop', disabled: true },
    { label: 'Video', command: 'noop', disabled: true },
    { label: 'De-Interlace…', command: 'noop', disabled: true },
    { label: 'NTSC Colors', command: 'noop', disabled: true },
    { label: '', command: 'noop', separator: true },
    { label: 'Clear local filter effect', command: 'filter-clear-effect' },
  ],
  View: [
    { label: 'Zoom in', shortcut: '+', command: 'zoom-in' },
    { label: 'Zoom out', shortcut: '−', command: 'zoom-out' },
    { label: 'Fit to screen', shortcut: '0', command: 'fit' },
    { label: 'Actual size', shortcut: '1', command: 'actual' },
    { label: 'Rotate View left 15°', command: 'rotate-view-left' },
    { label: 'Rotate View right 15°', command: 'rotate-view-right' },
    { label: 'Reset Rotate View', command: 'reset-rotate-view' },
    { label: 'Full Screen Mode', command: 'noop', disabled: true },
  ],
  Plugins: [
    { label: 'No plugins installed', command: 'noop', disabled: true },
    { label: 'Plugin Manager…', command: 'noop', disabled: true },
  ],
};

type Gesture = {
  tool: Tool;
  start: { x: number; y: number };
  last: { x: number; y: number };
  frame: Frame;
  layer?: Layer;
  buffer?: HTMLCanvasElement;
  source?: HTMLCanvasElement;
  /** Immutable source captured at pointer-down for Mixer/History Brush. */
  sourcePixels?: Uint8ClampedArray;
  historySourceIndex?: number;
  viewRotationStart?: number;
  viewRotationCenter?: { x: number; y: number };
  viewRotationPointerAngle?: number;
  lastClientX?: number;
  lastClientY?: number;
  brushPoints?: BrushStrokePoint[];
  /** Canvas-sized mask buffer used while a refinement stroke is in flight. */
  maskBuffer?: HTMLCanvasElement;
  maskPreviewAsset?: string;
  patternId?: PatternId;
  patternTileSize?: number;
  redEyeThreshold?: number;
  redEyeAmount?: number;
  /** Local-space nondestructive context-aware cleanup metadata. */
  spotHealingStroke?: SpotHealingStroke;
  /** Local-space nondestructive source-offset patch metadata. */
  patchStroke?: PatchStroke;
  /** Canvas-space nondestructive mask repair metadata for one gesture. */
  maskRefinementStroke?: MaskRefinementStroke;
  /** Selection alpha sampled once in the edited layer's local pixel space. */
  selectionMask?: Uint8ClampedArray;
  /** Existing selection alpha retained while a Selection Brush stroke is built. */
  selectionBase?: Uint8ClampedArray;
  /** Existing resolved alpha is retained for replace no-op detection. */
  selectionExisting?: Uint8ClampedArray;
  /** Detached alpha painted by the in-progress Selection Brush gesture. */
  selectionBrushMask?: Uint8ClampedArray;
  selectionBrushOperation?: SelectionOperation;
  selectionBrushSize?: number;
  selectionBrushHardness?: number;
  selectionBrushOpacity?: number;
  selectionBrushPressureSize?: boolean;
  selectionBrushPressureOpacity?: boolean;
  /** Detached alpha grown by an in-progress Quick Selection gesture. */
  quickSelectionMask?: Uint8ClampedArray;
  quickSelectionSource?: Uint8ClampedArray;
  quickSelectionBase?: Uint8ClampedArray;
  quickSelectionExisting?: Uint8ClampedArray;
  quickSelectionOperation?: SelectionOperation;
  quickSelectionSize?: number;
  quickSelectionTolerance?: number;
  quickSelectionOpacity?: number;
  changed?: boolean;
  replaceTarget?: [number, number, number, number];
  /** Local node index for an in-progress Direct Selection drag. */
  pathIndex?: number;
  /** Handle kind for an in-progress Direct Selection handle drag. */
  pathHandle?: PathHandleKind;
  /** Local path model at pointer-down, used to keep a drag deterministic. */
  pathOrigin?: PathModel;
  /** Composite RGBA sample used by the bounded Magnetic Lasso snapper. */
  magneticData?: Uint8ClampedArray;
  magneticRadius?: number;
  /** Pointer movement received while the async edge sample is prepared. */
  magneticPendingPoints?: { x: number; y: number }[];
  pending?: Promise<void>;
  queued?: Array<{
    x: number;
    y: number;
    pressure?: number;
    pointerType?: string;
  }>;
  points?: PathNode[];
  lastPressure?: number;
  pointerType?: string;
  moved: boolean;
};

type SlicePreview = SliceRect & { frame: Frame };
type FramePreview = {
  frame: Frame;
  x: number;
  y: number;
  width: number;
  height: number;
};

const brushColor = (value: string): BrushColor => {
  const match = value.match(/^#([a-f\d]{6})$/i);
  if (!match) return [0, 0, 0, 255];
  return [
    parseInt(match[1].slice(0, 2), 16),
    parseInt(match[1].slice(2, 4), 16),
    parseInt(match[1].slice(4, 6), 16),
    255,
  ];
};

type StampCanvasOptions = {
  x: number;
  y: number;
  size: number;
  hardness: number;
  opacity: number;
  pointerType?: string;
  pressure?: number;
  pressureSize?: boolean;
  pressureOpacity?: boolean;
  spacing?: number;
  angle?: number;
  roundness?: number;
  flipX?: boolean;
  flipY?: boolean;
  mode: BrushMode;
  color?: BrushColor;
  source?: HTMLCanvasElement;
  sourceX?: number;
  sourceY?: number;
};

/** Apply one bounded local radial stamp without allocating a full-canvas mask. */
const stampCanvas = (
  target: HTMLCanvasElement,
  options: StampCanvasOptions,
) => {
  const resolved = resolveBrushStamp(options),
    radius = resolved.radius,
    left = Math.max(0, Math.floor(options.x - radius)),
    top = Math.max(0, Math.floor(options.y - radius)),
    right = Math.min(target.width, Math.floor(options.x + radius) + 1),
    bottom = Math.min(target.height, Math.floor(options.y + radius) + 1),
    width = Math.max(0, right - left),
    height = Math.max(0, bottom - top);
  if (!width || !height) return false;
  const context = target.getContext('2d')!,
    image = context.getImageData(left, top, width, height);
  let source: Uint8ClampedArray | undefined,
    sourceX = options.sourceX,
    sourceY = options.sourceY;
  if (options.source) {
    const sourceLeft = Math.max(
        0,
        Math.min(
          options.source.width - width,
          Math.floor((options.sourceX ?? options.x) + left - options.x),
        ),
      ),
      sourceTop = Math.max(
        0,
        Math.min(
          options.source.height - height,
          Math.floor((options.sourceY ?? options.y) + top - options.y),
        ),
      );
    source = options.source
      .getContext('2d')!
      .getImageData(sourceLeft, sourceTop, width, height).data;
    sourceX = (options.sourceX ?? options.x) - sourceLeft;
    sourceY = (options.sourceY ?? options.y) - sourceTop;
  }
  const result = applyRadialStamp(image.data, {
    width,
    height,
    x: options.x - left,
    y: options.y - top,
    size: options.size,
    hardness: options.hardness,
    opacity: options.opacity,
    pointerType: options.pointerType,
    pressure: options.pressure,
    pressureSize: options.pressureSize,
    pressureOpacity: options.pressureOpacity,
    spacing: options.spacing,
    angle: options.angle,
    roundness: options.roundness,
    flipX: options.flipX,
    flipY: options.flipY,
    mode: options.mode,
    color: options.color,
    source,
    sourceX,
    sourceY,
  });
  if (result.changed) context.putImageData(image, left, top);
  return result.changed;
};

/** Stamp a line at bounded intervals so fast pointer moves remain continuous. */
const stampCanvasSegment = (
  target: HTMLCanvasElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: Omit<StampCanvasOptions, 'x' | 'y' | 'sourceX' | 'sourceY'> & {
    sourceAnchor?: { x: number; y: number };
    destinationAnchor?: { x: number; y: number };
  },
) => {
  const resolved = resolveBrushStamp({
      size: options.size,
      hardness: options.hardness,
      opacity: options.opacity,
      pointerType: options.pointerType,
      pressure: options.pressure,
      pressureSize: options.pressureSize,
      pressureOpacity: options.pressureOpacity,
      spacing: options.spacing,
      angle: options.angle,
      roundness: options.roundness,
      flipX: options.flipX,
      flipY: options.flipY,
    }),
    distance = Math.hypot(to.x - from.x, to.y - from.y),
    steps = Math.max(
      1,
      Math.ceil(distance / Math.max(1, resolved.size * resolved.spacing / 100)),
    );
  let changed = false;
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps,
      x = from.x + (to.x - from.x) * t,
      y = from.y + (to.y - from.y) * t,
      sourceX = options.sourceAnchor
        ? options.sourceAnchor.x +
          (x - (options.destinationAnchor?.x ?? from.x))
        : undefined,
      sourceY = options.sourceAnchor
        ? options.sourceAnchor.y +
          (y - (options.destinationAnchor?.y ?? from.y))
        : undefined;
    changed =
      stampCanvas(target, {
        ...options,
        x,
        y,
        sourceX,
        sourceY,
      }) || changed;
  }
  return changed;
};

/** Apply a deterministic locally-generated tile through radial coverage. */
const patternCanvas = (
  target: HTMLCanvasElement,
  options: {
    x: number;
    y: number;
    size: number;
    hardness: number;
    opacity: number;
    pointerType?: string;
    pressure?: number;
    pressureSize?: boolean;
    pressureOpacity?: boolean;
    spacing?: number;
    angle?: number;
    roundness?: number;
    flipX?: boolean;
    flipY?: boolean;
    pattern: PatternId;
    tileSize: number;
    foreground: BrushColor;
    background: BrushColor;
  },
) => {
  const radius = resolveBrushStamp(options).radius,
    left = Math.max(0, Math.floor(options.x - radius)),
    top = Math.max(0, Math.floor(options.y - radius)),
    right = Math.min(target.width, Math.floor(options.x + radius) + 1),
    bottom = Math.min(target.height, Math.floor(options.y + radius) + 1),
    width = Math.max(0, right - left),
    height = Math.max(0, bottom - top);
  if (!width || !height) return false;
  const context = target.getContext('2d')!,
    image = context.getImageData(left, top, width, height),
    result = applyPatternStamp(image.data, {
      width,
      height,
      x: options.x - left,
      y: options.y - top,
      size: options.size,
      hardness: options.hardness,
      opacity: options.opacity,
      pointerType: options.pointerType,
      pressure: options.pressure,
      pressureSize: options.pressureSize,
      pressureOpacity: options.pressureOpacity,
      spacing: options.spacing,
      angle: options.angle,
      roundness: options.roundness,
      flipX: options.flipX,
      flipY: options.flipY,
      pattern: options.pattern,
      tileSize: options.tileSize,
      foreground: options.foreground,
      background: options.background,
      originX: left,
      originY: top,
    });
  if (result.changed) context.putImageData(image, left, top);
  return result.changed;
};

const patternCanvasSegment = (
  target: HTMLCanvasElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: Omit<Parameters<typeof patternCanvas>[1], 'x' | 'y'>,
) => {
  const resolved = resolveBrushStamp(options),
    distance = Math.hypot(to.x - from.x, to.y - from.y),
    steps = Math.max(
      1,
      Math.ceil(distance / Math.max(1, resolved.size * resolved.spacing / 100)),
    );
  let changed = false;
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    changed =
      patternCanvas(target, {
        ...options,
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      }) || changed;
  }
  return changed;
};

/** Apply one bounded, local Red Eye correction without uploading pixels. */
const redEyeCanvasSegment = (
  target: HTMLCanvasElement,
  point: { x: number; y: number },
  options: { radius: number; threshold: number; amount: number },
) => {
  const radius = Math.max(1, options.radius),
    left = Math.max(0, Math.floor(point.x - radius)),
    top = Math.max(0, Math.floor(point.y - radius)),
    right = Math.min(target.width, Math.floor(point.x + radius) + 1),
    bottom = Math.min(target.height, Math.floor(point.y + radius) + 1),
    width = Math.max(0, right - left),
    height = Math.max(0, bottom - top);
  if (!width || !height) return false;
  const context = target.getContext('2d')!,
    image = context.getImageData(left, top, width, height),
    result = removeRedEye(image.data, {
      width,
      height,
      x: point.x - left,
      y: point.y - top,
      radius,
      threshold: options.threshold,
      amount: options.amount,
    });
  if (result.changed) context.putImageData(image, left, top);
  return result.changed;
};

const redEyeCanvasStroke = (
  target: HTMLCanvasElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: { radius: number; threshold: number; amount: number },
) => {
  const distance = Math.hypot(to.x - from.x, to.y - from.y),
    steps = Math.max(
      1,
      Math.ceil(distance / Math.max(1, options.radius * 0.5)),
    );
  let changed = false;
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    changed =
      redEyeCanvasSegment(
        target,
        { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t },
        options,
      ) || changed;
  }
  return changed;
};

/** Apply one immutable tonal stroke to a canvas pair and publish the new pixels. */
const tonalCanvasSegment = (
  source: HTMLCanvasElement,
  destination: HTMLCanvasElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: {
    size: number;
    hardness: number;
    exposure: number;
    flow: number;
    range: TonalRange;
    mode: 'dodge' | 'burn' | 'sponge';
    spongeMode: SpongeMode;
    spongeVibrance: number;
    selectionMask?: Uint8ClampedArray;
  },
) => {
  const sourceContext = source.getContext('2d')!,
    destinationContext = destination.getContext('2d')!,
    sourcePixels = sourceContext.getImageData(
      0,
      0,
      source.width,
      source.height,
    ),
    destinationPixels = destinationContext.getImageData(
      0,
      0,
      destination.width,
      destination.height,
    );
  const result =
    options.mode === 'sponge'
      ? applySpongeStroke(sourcePixels.data, destinationPixels.data, {
          width: destination.width,
          height: destination.height,
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
          size: options.size,
          hardness: options.hardness,
          amount: options.spongeVibrance / 100,
          flow: options.flow,
          mode: options.spongeMode,
          selectionMask: options.selectionMask,
        })
      : applyDodgeBurnStroke(sourcePixels.data, destinationPixels.data, {
          width: destination.width,
          height: destination.height,
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
          size: options.size,
          hardness: options.hardness,
          exposure: options.exposure / 100,
          flow: options.flow,
          range: options.range,
          mode: options.mode,
          selectionMask: options.selectionMask,
        });
  destinationPixels.data.set(result.pixels);
  if (result.changed) destinationContext.putImageData(destinationPixels, 0, 0);
  return result.changed;
};

/** Apply one immutable Smudge segment and publish the preview pixels. */
const smudgeCanvasSegment = (
  source: HTMLCanvasElement,
  destination: HTMLCanvasElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: {
    size: number;
    hardness: number;
    flow: number;
    selectionMask?: Uint8ClampedArray;
  },
) => {
  const sourceContext = source.getContext('2d')!,
    destinationContext = destination.getContext('2d')!,
    sourcePixels = sourceContext.getImageData(
      0,
      0,
      source.width,
      source.height,
    ),
    destinationPixels = destinationContext.getImageData(
      0,
      0,
      destination.width,
      destination.height,
    ),
    result = applySmudgeStroke(sourcePixels.data, destinationPixels.data, {
      width: destination.width,
      height: destination.height,
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      size: options.size,
      hardness: options.hardness,
      flow: options.flow,
      selectionMask: options.selectionMask,
    });
  destinationPixels.data.set(result.pixels);
  if (result.changed) destinationContext.putImageData(destinationPixels, 0, 0);
  return result.changed;
};

/**
 * Convert the frame-space selection alpha into the selected raster asset's
 * local pixel space. Tonal tools edit layer assets directly, so sampling the
 * selection once at pointer-down keeps every subsequent segment clipped to
 * the same feathered/inverted selection even when the layer is transformed.
 */
const selectionMaskForLayer = async (
  selection: Frame['selection'],
  frame: Frame,
  layer: Extract<Layer, { kind: 'raster' }>,
  assets: Assets,
  assetWidth?: number,
  assetHeight?: number,
): Promise<Uint8ClampedArray | undefined> => {
  if (!selection) return undefined;
  const rendered = await renderSelection(selection, frame.w, frame.h, assets),
    frameData = rendered
      .getContext('2d')!
      .getImageData(0, 0, frame.w, frame.h).data,
    asset =
      assetWidth && assetHeight
        ? undefined
        : await decodeAsset(assets[layer.asset]),
    width = assetWidth ?? asset!.naturalWidth,
    height = assetHeight ?? asset!.naturalHeight,
    mask = new Uint8ClampedArray(width * height),
    [a, b, c, d, e, f] = layer.matrix;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const frameX = Math.floor(a * (x + 0.5) + c * (y + 0.5) + e),
        frameY = Math.floor(b * (x + 0.5) + d * (y + 0.5) + f);
      if (frameX >= 0 && frameX < frame.w && frameY >= 0 && frameY < frame.h)
        mask[y * width + x] = frameData[(frameY * frame.w + frameX) * 4 + 3];
    }
  return mask;
};

export default function Home() {
  const file = useRef<HTMLInputElement>(null),
    layerFile = useRef<HTMLInputElement>(null),
    smartObjectFile = useRef<HTMLInputElement>(null),
    projectFile = useRef<HTMLInputElement>(null),
    selectionFile = useRef<HTMLInputElement>(null),
    batchImageFile = useRef<HTMLInputElement>(null),
    quickMaskOverlayCanvas = useRef<HTMLCanvasElement>(null),
    stage = useRef<HTMLElement>(null),
    menuArea = useRef<HTMLElement>(null),
    menuButtonRefs = useRef<Record<MenuName, HTMLButtonElement | null>>(
      {} as Record<MenuName, HTMLButtonElement | null>,
    ),
    menuItemRefs = useRef<Record<MenuName, Array<HTMLButtonElement | null>>>(
      {} as Record<MenuName, Array<HTMLButtonElement | null>>,
    ),
    pendingMenuFocus = useRef<Record<MenuName, 'first' | 'last' | undefined>>(
      {} as Record<MenuName, 'first' | 'last' | undefined>,
    ),
    smartObjectAction = useRef<'new' | 'replace'>('new');
  const [notice, setNotice] = useState('Ready'),
    [ready, setReady] = useState(false),
    [name, setName] = useState('coastline-edit');
  const doc = useDocument(setNotice),
    {
      canvas,
      assets,
      history,
      index,
      frame,
      revision,
      renderProgress,
      tiledTelemetry,
      tiledProgress,
      commit,
      install,
      select,
      setLayerSelection,
      travel,
      paint,
    } = doc;
  // A render can outlive the React event that started it. Keep a mutable
  // revision mirror so async layer commands can reject stale ownership even
  // before a new render paints its replacement frame.
  const revisionRef = useRef(revision);
  useEffect(() => {
    revisionRef.current = revision;
  }, [revision]);
  const [tool, setActiveTool] = useState<Tool>('move'),
    [toolFamilyChoices, setToolFamilyChoices] = useState<Record<string, Tool>>({}),
    [toolFlyout, setToolFlyout] = useState<string | null>(null),
    [toolFlyoutAnchor, setToolFlyoutAnchor] =
      useState<HTMLButtonElement | null>(null),
    [selectionOperation, setSelectionOperation] =
      useState<SelectionOperation>('replace'),
    [zoom, setZoom] = useState(72),
    [viewRotation, setViewRotation] = useState(0),
    [color, setColor] = useState('#ff5c35'),
    [backgroundColor, setBackgroundColor] = useState('#ffffff'),
    [size, setSize] = useState(18),
    [brushOpacity, setBrushOpacity] = useState(100),
    [hardness, setHardness] = useState(100),
    [pressureSize, setPressureSize] = useState(false),
    [pressureOpacity, setPressureOpacity] = useState(false),
    [brushPreset, setBrushPreset] = useState<BrushPresetId>('round-hard'),
    [brushSpacing, setBrushSpacing] = useState(BRUSH_DEFAULT_SPACING),
    [brushAngle, setBrushAngle] = useState(BRUSH_DEFAULT_ANGLE),
    [brushRoundness, setBrushRoundness] = useState(BRUSH_DEFAULT_ROUNDNESS),
    [brushFlipX, setBrushFlipX] = useState(false),
    [brushFlipY, setBrushFlipY] = useState(false),
    [patternId, setPatternId] = useState<PatternId>('checker'),
    [patternTileSize, setPatternTileSize] = useState(32),
    [redEyeThreshold, setRedEyeThreshold] = useState(36),
    [redEyeAmount, setRedEyeAmount] = useState(100),
    [colorTolerance, setColorTolerance] = useState(24),
    [tonalExposure, setTonalExposure] = useState(50),
    [tonalRange, setTonalRange] = useState<TonalRange>('midtones'),
    [spongeMode, setSpongeMode] = useState<SpongeMode>('saturate'),
    [spongeVibrance, setSpongeVibrance] = useState(50),
    [mixerBrush, setMixerBrush] = useState<MixerBrushSettings>({ ...DEFAULT_MIXER_BRUSH }),
    [historyBrush, setHistoryBrush] = useState<HistoryBrushSettings>({ ...DEFAULT_HISTORY_BRUSH }),
    [historySourceIndex, setHistorySourceIndex] = useState<number | undefined>(undefined),
    [exportFormat, setExportFormat] = useState<ExportFormat>('png'),
    [exportQuality, setExportQuality] = useState(92),
    [exportTargetBytes, setExportTargetBytes] = useState<number | undefined>(
      undefined,
    ),
    [text, setText] = useState('Your text'),
    [fontSize, setFontSize] = useState(56);
  const setTool = useCallback((next: Tool) => {
    setActiveTool(next);
    const family = flyoutForTool(next);
    if (family)
      setToolFamilyChoices((current) =>
        current[family] === next ? current : { ...current, [family]: next },
      );
  }, []);
  const toolHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolHoldOpened = useRef(false);
  const [cloneSource, setCloneSource] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const clipboardLayer = useRef<Layer | null>(null);
  const [hasClipboard, setHasClipboard] = useState(false);
  const [activeMenu, setActiveMenu] = useState<MenuName | null>(null),
    [actionsOpen, setActionsOpen] = useState(false),
    [actions, setActions] = useState<ActionSet[]>(() => {
      if (typeof window === 'undefined') return [];
      try {
        const raw = window.localStorage.getItem('pixelforge.actions.v1');
        return raw ? parseActionSets(raw) : [];
      } catch {
        window.localStorage.removeItem('pixelforge.actions.v1');
        return [];
      }
    }),
    [recordingActionId, setRecordingActionId] = useState<string>(),
    [runningActionId, setRunningActionId] = useState<string>(),
    [exporting, setExporting] = useState<{
      frame: Frame;
      assets: typeof assets.current;
      name: string;
    } | null>(null),
    [batchExporting, setBatchExporting] = useState<{
      history: Frame[];
      assets: typeof assets.current;
      name: string;
    } | null>(null),
    [batchImages, setBatchImages] = useState<BatchImageSource[] | null>(null),
    [batchActionId, setBatchActionId] = useState<string>(),
    [drag, setDrag] = useState(false),
    [resizing, setResizing] = useState<{
      width: number;
      height: number;
      imageSize?: Frame['imageSize'];
    } | null>(null);
  const [canvasSizing, setCanvasSizing] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const recordingActionRef = useRef<string | undefined>(undefined),
    replayingActionRef = useRef(false),
    batchActionRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        'pixelforge.actions.v1',
        serializeActionSets(actions),
      );
    } catch {
      // Private browsing and storage quotas can reject localStorage writes;
      // recipe execution remains in-memory and editing must continue.
    }
  }, [actions]);
  const beginActionRecording = (actionName: string) => {
    const action = createActionSet(actionName);
    setActions((currentActions) => {
      const next = [...currentActions, action];
      return next.length > MAX_ACTION_SETS
        ? next.slice(next.length - MAX_ACTION_SETS)
        : next;
    });
    recordingActionRef.current = action.id;
    setRecordingActionId(action.id);
    setNotice(`Recording action “${action.name}”`);
  };
  const stopActionRecording = () => {
    const action = actions.find(
      (candidate) => candidate.id === recordingActionRef.current,
    );
    recordingActionRef.current = undefined;
    setRecordingActionId(undefined);
    setNotice(
      action
        ? `Action “${action.name}” saved with ${action.steps.length} step${action.steps.length === 1 ? '' : 's'}`
        : 'Action recording stopped',
    );
  };
  const removeActionRecipe = (id: string) => {
    setActions((currentActions) => currentActions.filter((action) => action.id !== id));
    if (recordingActionRef.current === id) stopActionRecording();
    setNotice('Action recipe deleted from this device');
  };
  const beginBatchAction = (id: string) => {
    const action = actions.find((candidate) => candidate.id === id);
    if (!action || !action.steps.length) {
      setNotice('Record at least one command before running a batch Action');
      return;
    }
    batchActionRef.current = id;
    setNotice(`Choose images for Action “${action.name}”`);
    batchImageFile.current?.click();
  };
  const recordActionCommand = (command: Command) => {
    const id = recordingActionRef.current;
    if (!id || replayingActionRef.current) return;
    const menuItem = Object.values(MENU_DEFS)
      .flat()
      .find((item) => item.command === command && item.label);
    setActions((currentActions) =>
      currentActions.map((action) => {
        if (action.id !== id) return action;
        try {
          return appendActionStep(
            action,
            command,
            menuItem?.label || command,
          );
        } catch {
          return action;
        }
      }),
    );
  };
  const [trimming, setTrimming] = useState(false);
  /**
   * A crop drag is deliberately staged before it changes the document.  The
   * preview keeps the current history frame immutable while the user checks
   * the bounds, and gives keyboard/touch users an explicit Apply/Cancel
   * affordance.
   */
  const [cropPreview, setCropPreview] = useState<
    (RectangularCropPlan & { frame: Frame }) | null
  >(null);
  const cropPreviewId = useRef(0);
  // Invalidates overlapping asynchronous selection renders even when the
  // document frame itself has not changed yet.
  const selectionWorkToken = useRef(0);
  const [cropApplying, setCropApplying] = useState(false);
  /** Perspective crop is staged and applied as a reversible composite raster. */
  const [perspectiveCropPreview, setPerspectiveCropPreview] = useState<
    (PerspectiveCropPlan & { frame: Frame }) | null
  >(null);
  const perspectiveCropPreviewId = useRef(0);
  const [perspectiveCropApplying, setPerspectiveCropApplying] = useState(false);
  const [slicePreview, setSlicePreview] = useState<SlicePreview | null>(null);
  const [slicePreviewMode, setSlicePreviewMode] = useState<'draft' | 'selected'>('draft');
  const slicePreviewId = useRef(0);
  const [sliceName, setSliceName] = useState('slice-1');
  const [sliceExporting, setSliceExporting] = useState(false);
  const [framePreview, setFramePreview] = useState<FramePreview | null>(null);
  const [frameName, setFrameName] = useState('Artboard 1');
  const [frameBackground, setFrameBackground] = useState('#ffffff');
  const [selectionTransforming, setSelectionTransforming] = useState(false);
  const [layerTransforming, setLayerTransforming] = useState(false);
  const [selectionRefining, setSelectionRefining] =
    useState<SelectionRefineMode | null>(null);
  const [colorRanging, setColorRanging] = useState(false);
  const [fillLayerDialog, setFillLayerDialog] = useState(false);
  const [focusAreaValue, setFocusAreaValue] = useState(false);
  const [focusAreaThreshold, setFocusAreaThreshold] = useState(32);
  const [focusAreaSoftness, setFocusAreaSoftness] = useState(24);
  const [quickMasking, setQuickMasking] = useState(false),
    [quickMask, setQuickMask] = useState<QuickMask | null>(null),
    [quickMaskReveal, setQuickMaskReveal] = useState(false),
    [savedSelectionName, setSavedSelectionName] = useState('Selection 1');
  const quickMaskRef = useRef<QuickMask | null>(null),
    quickMaskGesture = useRef<{
      frame: Frame;
      last: { x: number; y: number };
      selected: boolean;
      before: Uint8ClampedArray;
    } | null>(null);
  const [measurementPreview, setMeasurementPreview] = useState<{
    start: MeasurementPoint;
    end: MeasurementPoint;
  } | null>(null);

  /**
   * Menus use a small roving-focus model rather than relying on browser tab
   * order. This keeps long Photoshop-style menus usable on keyboard and touch
   * devices while ensuring Escape returns focus to the menu trigger.
   */
  const openMenu = (menu: MenuName, focus: 'first' | 'last' = 'first') => {
    pendingMenuFocus.current[menu] = focus;
    setActiveMenu(menu);
  };
  const closeMenu = (restoreFocus = false) => {
    const menu = activeMenu;
    setActiveMenu(null);
    if (restoreFocus && menu)
      requestAnimationFrame(() => menuButtonRefs.current[menu]?.focus());
  };
  const handleMenuKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    menu: MenuName,
  ) => {
    const buttons = (menuItemRefs.current[menu] || []).filter(
      (button): button is HTMLButtonElement =>
        button !== null && !button.disabled,
    );
    if (!buttons.length) return;
    const currentIndex = buttons.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const next = (currentIndex + direction + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      buttons[event.key === 'Home' ? 0 : buttons.length - 1]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
    } else if (event.key === 'Tab') {
      // Let the browser move focus out of the menu, but close the popup so a
      // subsequent Tab never lands in an invisible menu.
      setActiveMenu(null);
    }
  };
  const [draftId, setDraftId] = useState(initialDraftId),
    openingDraftId = useRef(draftId),
    [saveStatus, setSaveStatus] = useState('Opening saved document…');
  const localVersions = useRef(new Map<string, number>());
  const saveQueue = useRef(Promise.resolve());
  const saveSequence = useRef(0),
    saving = useRef(false),
    discarding = useRef(false);
  const { member, checking } = useMember();
  const [cloud, setCloud] = useState<CloudLink | undefined>(),
    [cloudBusy, setCloudBusy] = useState(false),
    [recovering, setRecovering] = useState(false),
    [cloudMessage, setCloudMessage] = useState(''),
    [cloudConflict, setCloudConflict] = useState<CloudConflictError | null>(null);
  const active = frame?.layers.find((l) => l.id === frame.active),
    adjustments = active ? effectiveAdjustments(active.adjustments) : neutral;
  const {
    brightness,
    contrast,
    saturation,
    hue,
    blur,
    filter,
    levelsBlack,
    levelsWhite,
    levelsGamma,
    levelsOutputBlack,
    levelsOutputWhite,
    curves,
    colorBalance,
    sharpenNoise,
    filterEffects,
    photoAdjustments,
  } = adjustments;
  const dimensions = frame ? `${frame.w} × ${frame.h} px` : 'Opening…',
    canUndo = Boolean(slicePreview && slicePreviewMode === 'draft') || index.current > 0,
    canRedo = index.current < history.current.length - 1;
  const gesture = useRef<Gesture | null>(null);
  const paintSpan = useRef<PerformanceSpan | null>(null);
  const settings = (): Settings => ({
    tool,
    zoom,
    viewRotation,
    color,
    backgroundColor,
    size,
    brushOpacity,
    hardness,
    pressureSize,
    pressureOpacity,
    brushPreset,
    spacing: brushSpacing,
    angle: brushAngle,
    roundness: brushRoundness,
    flipX: brushFlipX,
    flipY: brushFlipY,
    patternId,
    patternTileSize,
    redEyeThreshold,
    redEyeAmount,
    colorTolerance,
    tonalExposure,
    tonalRange,
    spongeMode,
    spongeVibrance,
    mixerBrush,
    historyBrush,
    historySourceIndex,
    exportFormat,
    exportQuality,
    exportTargetBytes,
    text,
    fontSize,
    ...neutral,
  });
  const documentValue = (): Draft => ({
    version: 2,
    history: history.current,
    assets: assets.current,
    index: index.current,
    name,
    settings: settings(),
  });
  const restoreSettings = useCallback((s: Settings) => {
    setTool(s.tool);
    setZoom(s.zoom);
    setViewRotation(normalizeViewRotation(s.viewRotation ?? 0));
    setColor(s.color);
    setBackgroundColor(s.backgroundColor || '#ffffff');
    setSize(s.size);
    setBrushOpacity(s.brushOpacity ?? 100);
    setHardness(s.hardness ?? 100);
    setPressureSize(s.pressureSize ?? false);
    setPressureOpacity(s.pressureOpacity ?? false);
    setBrushPreset(s.brushPreset ?? 'round-hard');
    setBrushSpacing(s.spacing ?? BRUSH_DEFAULT_SPACING);
    setBrushAngle(s.angle ?? BRUSH_DEFAULT_ANGLE);
    setBrushRoundness(s.roundness ?? BRUSH_DEFAULT_ROUNDNESS);
    setBrushFlipX(s.flipX ?? false);
    setBrushFlipY(s.flipY ?? false);
    setPatternId(s.patternId ?? 'checker');
    setPatternTileSize(s.patternTileSize ?? 32);
    setRedEyeThreshold(s.redEyeThreshold ?? 36);
    setRedEyeAmount(s.redEyeAmount ?? 100);
    setColorTolerance(s.colorTolerance ?? 24);
    setTonalExposure(s.tonalExposure ?? 50);
    setTonalRange(s.tonalRange ?? 'midtones');
    setSpongeMode(s.spongeMode ?? 'saturate');
    setSpongeVibrance(s.spongeVibrance ?? 50);
    setMixerBrush({ ...DEFAULT_MIXER_BRUSH, ...s.mixerBrush });
    setHistoryBrush({ ...DEFAULT_HISTORY_BRUSH, ...s.historyBrush });
    setHistorySourceIndex(s.historySourceIndex);
    setExportFormat(s.exportFormat ?? 'png');
    setExportQuality(s.exportQuality ?? 92);
    setExportTargetBytes(s.exportTargetBytes);
    setText(s.text);
    setFontSize(s.fontSize);
  }, [
    setTool,
    setZoom,
    setViewRotation,
    setColor,
    setBackgroundColor,
    setSize,
    setBrushOpacity,
    setHardness,
    setPressureSize,
    setPressureOpacity,
    setBrushPreset,
    setBrushSpacing,
    setBrushAngle,
    setBrushRoundness,
    setBrushFlipX,
    setBrushFlipY,
    setPatternId,
    setPatternTileSize,
    setRedEyeThreshold,
    setRedEyeAmount,
    setColorTolerance,
    setTonalExposure,
    setTonalRange,
    setSpongeMode,
    setSpongeVibrance,
    setMixerBrush,
    setHistoryBrush,
    setHistorySourceIndex,
    setExportFormat,
    setExportQuality,
    setExportTargetBytes,
    setText,
    setFontSize,
  ]);
  const applyBrushPreset = (id: BrushPresetId) => {
    const preset = brushPresetById(id);
    if (!preset) return;
    setBrushPreset(id);
    setSize(preset.size);
    setHardness(preset.hardness);
    setBrushSpacing(preset.spacing ?? BRUSH_DEFAULT_SPACING);
    setBrushAngle(preset.angle ?? BRUSH_DEFAULT_ANGLE);
    setBrushRoundness(preset.roundness ?? BRUSH_DEFAULT_ROUNDNESS);
    setBrushFlipX(preset.flipX ?? false);
    setBrushFlipY(preset.flipY ?? false);
    setPressureSize(preset.pressureSize);
    setPressureOpacity(preset.pressureOpacity);
    setNotice(`Brush preset “${preset.label}” applied`);
  };
  const resetColors = () => {
    setColor('#000000');
    setBackgroundColor('#ffffff');
    setNotice('Foreground and background colors reset');
  };
  const swapColors = () => {
    setColor(backgroundColor);
    setBackgroundColor(color);
    setNotice('Foreground and background colors swapped');
  };
  const current = () => history.current[index.current];
  const selectedIdsForFrame = (f: Frame): string[] =>
    f.selectedLayerIds === undefined
      ? [f.active]
      : f.selectedLayerIds.filter((id) => f.layers.some((layer) => layer.id === id));
  const selectedLayersForFrame = (f: Frame): Layer[] => {
    const ids = new Set(selectedIdsForFrame(f));
    return f.layers.filter((layer) => ids.has(layer.id));
  };

  /** Convert editable paths and parametric shapes into one common world-space model. */
  const booleanOperand = (layer: Layer): ReturnType<typeof booleanPathFromPoints> => {
    if (layer.kind === 'path') return transformPath(layer.path, layer.matrix);
    if (layer.kind === 'line' || layer.kind === 'text' || layer.kind === 'raster' ||
        layer.kind === 'smart-object' || layer.kind === 'adjustment')
      throw new Error('Only closed vector shape layers can be combined');
    const map = (point: BooleanPoint): BooleanPoint => ({
      x: layer.matrix[0] * point.x + layer.matrix[2] * point.y + layer.matrix[4],
      y: layer.matrix[1] * point.x + layer.matrix[3] * point.y + layer.matrix[5],
    });
    let points: BooleanPoint[];
    if (layer.kind === 'rectangle') {
      points = [
        { x: 0, y: 0 },
        { x: layer.width, y: 0 },
        { x: layer.width, y: layer.height },
        { x: 0, y: layer.height },
      ];
    } else if (layer.kind === 'ellipse') {
      points = Array.from({ length: 64 }, (_, index) => {
        const angle = (index * Math.PI * 2) / 64;
        return { x: layer.width / 2 + Math.cos(angle) * layer.width / 2, y: layer.height / 2 + Math.sin(angle) * layer.height / 2 };
      });
    } else {
      // Match the renderer's stroke-centered polygon geometry so a boolean
      // result follows the pixels users see on the canvas.
      points = shapePoints(
        Math.max(1, layer.width - layer.stroke),
        Math.max(1, layer.height - layer.stroke),
        layer.variant,
        layer.sides,
      ).map((point) => ({
        x: point.x + layer.stroke / 2,
        y: point.y + layer.stroke / 2,
      }));
    }
    return booleanPathFromPoints(points.map(map), {
      fill: layer.fill,
      stroke: true,
      strokeWidth: layer.stroke,
      fillColor: layer.color,
      strokeColor: layer.color,
    });
  };
  const combineSelectedShapes = (operation: PathBooleanOperation) => {
    const f = current(), selected = selectedLayersForFrame(f);
    if (selected.length < 2) {
      setNotice('Select at least two closed vector layers before combining shapes');
      return;
    }
    if (selected.some((layer) =>
      layerIsLocked(f, layer) || !layer.visible || groupForLayer(f, layer)?.visible === false,
    )) {
      setNotice('Unlock and show all selected vector layers before combining shapes');
      return;
    }
    const groups = new Set(selected.map((layer) => layer.groupId || ''));
    if (groups.size > 1) {
      setNotice('Combine Shapes requires layers in one group or at the document root');
      return;
    }
    try {
      const operands = selected.map(booleanOperand);
      if (operands.some((operand) => !booleanPathIsClosed(operand)))
        throw new Error('Only closed vector shape layers can be combined');
      const path = combinePathBooleans(operands, operation);
      const ids = new Set(selected.map((layer) => layer.id));
      const firstIndex = f.layers.findIndex((layer) => ids.has(layer.id));
      const remainingBefore = f.layers.slice(0, firstIndex).filter((layer) => !ids.has(layer.id)).length;
      const groupId = selected[0].groupId;
      const result: Layer = {
        ...commonLayer(`Combined ${operation}`),
        kind: 'path',
        path,
        ...(groupId ? { groupId } : {}),
      };
      const layers = f.layers.filter((layer) => !ids.has(layer.id));
      layers.splice(remainingBefore, 0, result);
      if (commit({ ...f, layers, active: result.id, selectedLayerIds: [result.id] }))
        setNotice(`Shapes combined (${operation})`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not combine shapes');
    }
  };
  const selectAllLayers = () => {
    const f = current();
    setLayerSelection(f.layers.map((layer) => layer.id), f.active);
    setNotice('All layers selected');
  };
  const deselectLayers = () => {
    const f = current();
    setLayerSelection([], f.active);
    setNotice('Layers deselected; the active layer remains the edit anchor');
  };
  const isolateLayers = () => {
    const f = current(),
      ids = new Set(selectedIdsForFrame(f));
    if (!ids.size) {
      setNotice('Select at least one layer to isolate');
      return;
    }
    const changed = f.layers.some((layer) => layer.visible !== ids.has(layer.id));
    if (!changed) {
      setNotice('Selected layers are already isolated');
      return;
    }
    if (
      commit({
        ...f,
        layers: f.layers.map((layer) => ({ ...layer, visible: ids.has(layer.id) })),
      })
    )
      setNotice('Selected layers isolated; undo restores visibility');
  };
  const cancelCropPreview = () => {
    if (!cropPreview) return;
    cropPreviewId.current += 1;
    setCropPreview(null);
    void paint(current());
    setNotice('Crop preview cancelled; document unchanged');
  };
  const applyCropPreview = async () => {
    const preview = cropPreview;
    if (!preview || cropApplying) return;
    const f = current();
    if (f !== preview.frame) {
      setCropPreview(null);
      void paint(f);
      setNotice('Crop preview expired because the document changed');
      return;
    }
    if (!preview.changed) {
      setCropPreview(null);
      setNotice('Crop already matches the canvas; document unchanged');
      return;
    }
    const expectedPreviewId = cropPreviewId.current;
    setCropApplying(true);
    try {
      const next = await transformFrameWithMasks(
        f,
        [1, 0, 0, 1, -preview.left, -preview.top],
        assets.current,
        preview.width,
        preview.height,
      );
      if (current() !== f || cropPreviewId.current !== expectedPreviewId) {
        void paint(current());
        setNotice('Crop cancelled because the preview or document changed');
        return;
      }
      const changed = commit({
        ...next,
        measurements: cropMeasurements(f.measurements, preview),
      });
      if (changed) {
        setCropPreview(null);
        setNotice(`Crop applied: ${preview.width} × ${preview.height} px`);
      }
    } catch {
      setNotice('Could not apply crop preview');
    } finally {
      setCropApplying(false);
    }
  };
  const cancelPerspectiveCropPreview = () => {
    if (!perspectiveCropPreview) return;
    perspectiveCropPreviewId.current += 1;
    setPerspectiveCropPreview(null);
    void paint(current());
    setNotice('Perspective crop preview cancelled; document unchanged');
  };
  const applyPerspectiveCropPreview = async () => {
    const preview = perspectiveCropPreview;
    if (!preview || perspectiveCropApplying) return;
    const source = current();
    if (source !== preview.frame) {
      setPerspectiveCropPreview(null);
      void paint(source);
      setNotice(
        'Perspective crop preview expired because the document changed',
      );
      return;
    }
    if (!preview.changed) {
      setPerspectiveCropPreview(null);
      setNotice('Perspective crop matches the canvas; document unchanged');
      return;
    }
    const expectedPreviewId = perspectiveCropPreviewId.current;
    setPerspectiveCropApplying(true);
    try {
      const composite = await renderFrame(source, assets.current),
        pixels = composite
          .getContext('2d')!
          .getImageData(0, 0, source.w, source.h).data,
        warped = warpPerspectiveRgba(pixels, source.w, source.h, preview),
        output = surface(preview.width, preview.height),
        outputImage = output
          .getContext('2d')!
          .createImageData(preview.width, preview.height);
      outputImage.data.set(warped);
      output.getContext('2d')!.putImageData(outputImage, 0, 0);
      if (
        current() !== source ||
        perspectiveCropPreviewId.current !== expectedPreviewId
      ) {
        void paint(current());
        setNotice(
          'Perspective crop cancelled because the preview or document changed',
        );
        return;
      }
      const next = rasterFrame(output, assets.current, 'Perspective Crop');
      if (commit(next)) {
        setPerspectiveCropPreview(null);
        setNotice(
          `Perspective crop applied: ${preview.width} × ${preview.height} px · source layers are restorable with Undo`,
        );
      }
    } catch {
      setNotice('Could not apply perspective crop preview');
    } finally {
      setPerspectiveCropApplying(false);
    }
  };
  const updatePerspectiveCropPreview = (
    patch: Partial<{ quad: CropQuad; width: number; height: number }>,
  ) => {
    const preview = perspectiveCropPreview;
    if (!preview) return;
    try {
      const next = planPerspectiveCrop(preview.frame.w, preview.frame.h, {
        quad: patch.quad || preview.quad,
        width: patch.width ?? preview.width,
        height: patch.height ?? preview.height,
      });
      perspectiveCropPreviewId.current += 1;
      setPerspectiveCropPreview({ frame: preview.frame, ...next });
      void paint(preview.frame);
    } catch {
      setNotice('Perspective crop needs four convex points inside the image');
    }
  };
  const cancelSlicePreview = () => {
    if (!slicePreview) return;
    slicePreviewId.current += 1;
    setSlicePreview(null);
    setSlicePreviewMode('draft');
    void paint(current());
    setNotice('Slice preview cancelled; document unchanged');
  };
  const cancelFramePreview = () => {
    if (!framePreview) return;
    setFramePreview(null);
    void paint(current());
    setNotice('Frame preview cancelled; document unchanged');
  };
  const downloadSlice = async () => {
    const preview = slicePreview;
    if (!preview || sliceExporting) return;
    const rawName = sliceName.trim();
    if (!rawName) {
      setNotice('Enter a name for the slice before downloading');
      return;
    }
    const f = current();
    if (f !== preview.frame) {
      cancelSlicePreview();
      setNotice('Slice preview expired because the document changed');
      return;
    }
    const expectedPreviewId = slicePreviewId.current;
    setSliceExporting(true);
    try {
      const plan = planSlices(f.w, f.h, [
        {
        id: preview.id,
        name: rawName,
        x: preview.x,
        y: preview.y,
        width: preview.width,
        height: preview.height,
        },
      ]);
      const rendered = await renderFrame(f, assets.current);
      if (current() !== f || slicePreviewId.current !== expectedPreviewId) {
        void paint(current());
        setNotice('Slice cancelled because the preview or document changed');
        return;
      }
      const source = rendered
        .getContext('2d')!
        .getImageData(0, 0, f.w, f.h).data;
      const [slice] = extractSlices(source, f.w, f.h, plan);
      const output = surface(slice.width, slice.height),
        image = output
          .getContext('2d')!
          .createImageData(slice.width, slice.height);
      image.data.set(slice.pixels);
      output.getContext('2d')!.putImageData(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) =>
        output.toBlob(resolve, 'image/png'),
      );
      if (!blob) throw new Error('Could not encode the slice');
      const url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = `${plan.slices[0].name}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSliceName(plan.slices[0].name);
      setNotice(
        `Slice downloaded: ${plan.slices[0].name}.png · ${slice.width} × ${slice.height} px`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Could not download the slice',
      );
    } finally {
      setSliceExporting(false);
    }
  };
  const saveSliceMetadata = () => {
    const preview = slicePreview;
    if (!preview) return;
    const f = current();
    if (f !== preview.frame) {
      cancelSlicePreview();
      setNotice('Slice preview expired because the document changed');
      return;
    }
    try {
      const [normalized] = planSlices(f.w, f.h, [{
        id: preview.id,
        name: sliceName,
        x: preview.x,
        y: preview.y,
        width: preview.width,
        height: preview.height,
      }]).slices;
      const slices = [...(f.slices || []).filter((item) => item.id !== normalized.id), normalized];
      if (slices.length > 256) throw new Error('The document already has 256 slices');
      if (commit({ ...f, slices, activeSliceId: normalized.id })) {
        setSlicePreview({ frame: current(), ...normalized });
        setSlicePreviewMode('selected');
        setSliceName(normalized.name);
        setNotice(`Slice saved: ${normalized.name}`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save the slice');
    }
  };
  const updateSelectedSlice = () => {
    const preview = slicePreview;
    if (!preview || slicePreviewMode !== 'selected') return;
    const f = current();
    if (f !== preview.frame) {
      cancelSlicePreview();
      setNotice('Slice selection expired because the document changed');
      return;
    }
    try {
      const [normalized] = planSlices(f.w, f.h, [{ ...preview, name: sliceName }]).slices;
      const slices = (f.slices || []).map((item) => item.id === normalized.id ? normalized : item);
      if (commit({ ...f, slices, activeSliceId: normalized.id })) {
        setSlicePreview({ frame: current(), ...normalized });
        setSliceName(normalized.name);
        setNotice(`Slice updated: ${normalized.name}`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update the slice');
    }
  };
  const deleteSelectedSlice = () => {
    const preview = slicePreview;
    if (!preview || slicePreviewMode !== 'selected') return;
    const f = current();
    const slices = (f.slices || []).filter((item) => item.id !== preview.id);
    if (commit({
      ...f,
      ...(slices.length ? { slices, activeSliceId: slices[0].id } : { slices: undefined, activeSliceId: undefined }),
    })) {
      setSlicePreview(null);
      setSlicePreviewMode('draft');
      void paint(current());
      setNotice('Slice deleted');
    }
  };
  const addFrameArtboard = () => {
    const preview = framePreview;
    if (!preview) return;
    const f = current();
    if (f !== preview.frame) {
      cancelFramePreview();
      setNotice('Frame preview expired because the document changed');
      return;
    }
    try {
      const selected = selectedIdsForFrame(f);
      const artboard = createArtboard({
        // UUID-backed IDs remain unique even if an artboard is later removed
        // or a draft is merged across browser sessions.
        id: `artboard-${crypto.randomUUID()}`,
        name: frameName,
        x: preview.x,
        y: preview.y,
        w: preview.width,
        h: preview.height,
        visible: true,
        locked: false,
        background: frameBackground,
        ...(selected.length ? { layerIds: selected } : {}),
      }, f.w, f.h);
      if (commit({
        ...f,
        artboards: [...(f.artboards || []), artboard],
        activeArtboardId: artboard.id,
      })) {
        setFramePreview(null);
        void paint(current());
        setNotice(`Artboard added: ${artboard.name}`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not add the artboard');
    }
  };
  const selectArtboard = (id: string) => {
    const f = current();
    if (!f.artboards?.some((item) => item.id === id)) return;
    if (f.activeArtboardId !== id) {
      commit({ ...f, activeArtboardId: id });
      setNotice(`Active artboard: ${f.artboards.find((item) => item.id === id)?.name || id}`);
    }
  };
  const appendMeasurement = (annotation: MeasurementAnnotation) => {
    const f = current();
    if (commit({ ...f, measurements: [...(f.measurements || []), annotation] }))
      return true;
    return false;
  };
  const transformSelectionValue = selectionTransforming
    ? current().selection
    : undefined;
  const layerTransformValue = (() => {
    if (!layerTransforming || !active) return undefined;
    try {
      return {
        layer: active,
        bounds: layerLocalBounds(
          active,
          assets.current,
        ) as LayerTransformBounds,
      };
    } catch {
      return undefined;
    }
  })();
  const selectionRefineValue =
    selectionRefining && current().selection ? selectionRefining : null;
  const currentSavedSelections = (): SavedSelectionBook =>
    current().savedSelections || emptySavedSelectionBook();
  const imageToQuickMask = (image: CanvasImageSource): QuickMask => {
    const width =
        image instanceof HTMLImageElement
          ? image.naturalWidth
          : (image as HTMLCanvasElement).width,
      height =
        image instanceof HTMLImageElement
          ? image.naturalHeight
          : (image as HTMLCanvasElement).height,
      sample = surface(width, height),
      context = sample.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, width, height).data,
      selected = new Uint8ClampedArray(width * height);
    for (let i = 0; i < selected.length; i += 1) selected[i] = data[i * 4 + 3];
    return createQuickMask(width, height, selected);
  };
  const quickMaskAsset = (mask: QuickMask) => {
    const image = surface(mask.width, mask.height),
      context = image.getContext('2d')!,
      data = context.createImageData(mask.width, mask.height);
    for (let i = 0; i < mask.selected.length; i += 1) {
      const offset = i * 4;
      data.data[offset] = 255;
      data.data[offset + 1] = 255;
      data.data[offset + 2] = 255;
      data.data[offset + 3] = mask.selected[i];
    }
    context.putImageData(data, 0, 0);
    return addAsset(assets.current, image);
  };
  const selectionBrushPreview = (g: Gesture) => {
    const points = g.points || [];
    if (!points.length) return;
    void paint(g.frame).then(() => {
      if (gesture.current !== g) return;
      const context = canvas.current?.getContext('2d');
      if (!context) return;
      context.save();
      context.strokeStyle = '#7dd3fc';
      context.lineWidth = Math.max(1, Math.min(8, size / 6));
      context.setLineDash([7, 4]);
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) context.lineTo(point.x, point.y);
      context.stroke();
      context.restore();
    });
  };
  const drawQuickMaskOverlay = (mask: QuickMask) => {
    const target = quickMaskOverlayCanvas.current;
    if (!target) return;
    target.width = mask.width;
    target.height = mask.height;
    const context = target.getContext('2d')!;
    const imageData = context.createImageData(mask.width, mask.height);
    imageData.data.set(quickMaskOverlay(mask));
    context.putImageData(imageData, 0, 0);
  };
  const repaintQuickMask = (mask: QuickMask) => {
    quickMaskRef.current = mask;
    setQuickMask(mask);
    void paint(current()).then(() => {
      if (quickMaskRef.current === mask) drawQuickMaskOverlay(mask);
    });
  };
  const persistQuickMask = (mask: QuickMask, active = true) => {
    const f = current(),
      asset = quickMaskAsset(mask);
    if (commit({ ...f, quickMask: { asset, active } })) {
      if (active) setNotice('Quick Mask stroke applied');
      return asset;
    }
    return undefined;
  };
  const enterQuickMask = async () => {
    const f = current();
    if (quickMasking) {
      setNotice('Quick Mask mode is already active');
      return;
    }
    try {
      let mask: QuickMask;
      if (f.selection) {
        const rendered = await renderSelection(
            f.selection,
            f.w,
            f.h,
            assets.current,
          ),
          alpha = rendered.getContext('2d')!.getImageData(0, 0, f.w, f.h).data,
          selected = new Uint8ClampedArray(f.w * f.h);
        for (let i = 0; i < selected.length; i += 1)
          selected[i] = alpha[i * 4 + 3];
        mask = createQuickMask(f.w, f.h, selected);
      } else mask = createQuickMask(f.w, f.h);
      const asset = quickMaskAsset(mask);
      if (!commit({ ...f, quickMask: { asset, active: true } })) return;
      quickMaskRef.current = mask;
      setQuickMask(mask);
      setQuickMasking(true);
      setTool('brush');
      setNotice(
        'Quick Mask mode active; paint to hide or reveal the selection',
      );
      void paint({ ...f, quickMask: { asset, active: true } }).then(() =>
        drawQuickMaskOverlay(mask),
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not enter Quick Mask mode',
      );
    }
  };
  const exitQuickMask = () => {
    const mask = quickMaskRef.current;
    if (!mask) {
      setQuickMasking(false);
      return;
    }
    const f = current(),
      asset = quickMaskAsset(mask),
      selection = selectionFromQuickMask(mask, asset);
    if (commit({ ...f, selection, quickMask: undefined })) {
      quickMaskRef.current = null;
      setQuickMask(null);
      setQuickMasking(false);
      setNotice('Quick Mask converted to selection');
    }
  };
  const toggleQuickMask = () => {
    if (quickMasking) exitQuickMask();
    else void enterQuickMask();
  };
  const updateQuickMaskAt = (
    mask: QuickMask,
    x: number,
    y: number,
    selected: boolean,
  ) => {
    const next = createQuickMask(mask.width, mask.height, mask.selected);
    if (
      !paintQuickMask(
        next,
        x,
        y,
        size,
        brushOpacity / 100,
        selected,
        hardness / 100,
      )
    )
      return;
    repaintQuickMask(next);
  };
  const saveCurrentSelection = (name = savedSelectionName) => {
    const f = current();
    if (!f.selection) {
      setNotice('Create a selection before saving it');
      return;
    }
    try {
      const book = saveSelection(currentSavedSelections(), f.selection, name, {
        bounds: { w: f.w, h: f.h },
      });
      if (commit({ ...f, savedSelections: book })) {
        setSavedSelectionName(`Selection ${book.selections.length + 1}`);
        setNotice(`Selection “${book.selections.at(-1)?.name}” saved`);
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Selection could not be saved',
      );
    }
  };
  const loadSavedSelection = (id: string) => {
    const f = current();
    try {
      const selection = loadSelection(currentSavedSelections(), id, {
        w: f.w,
        h: f.h,
      });
      if (commit({ ...f, selection })) setNotice('Saved selection loaded');
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Saved selection could not be loaded',
      );
    }
  };
  const renameSavedSelection = (id: string) => {
    const entry = currentSavedSelections().selections.find(
      (item) => item.id === id,
    );
    const nextName = window.prompt(
      'Rename saved selection',
      entry?.name || 'Selection',
    );
    if (nextName === null) return;
    try {
      const book = renameSelection(currentSavedSelections(), id, nextName);
      if (commit({ ...current(), savedSelections: book }))
        setNotice('Saved selection renamed');
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Saved selection could not be renamed',
      );
    }
  };
  const deleteSavedSelection = (id: string) => {
    const entry = currentSavedSelections().selections.find(
      (item) => item.id === id,
    );
    if (!entry || !window.confirm(`Delete saved selection “${entry.name}”?`))
      return;
    try {
      const book = deleteSelection(currentSavedSelections(), id);
      if (commit({ ...current(), savedSelections: book }))
        setNotice('Saved selection deleted');
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Saved selection could not be deleted',
      );
    }
  };
  const exportSelection = () => {
    const f = current();
    if (!f.selection) {
      setNotice('Create a selection before saving it');
      return;
    }
    if (f.selection.mask) {
      setNotice('Color-based selections must be saved in the project file');
      return;
    }
    try {
      const book = saveSelection(
        emptySavedSelectionBook(),
        f.selection,
        savedSelectionName,
        {
          id: 'selection-1',
          bounds: { w: f.w, h: f.h },
        },
      );
      const url = URL.createObjectURL(
          new Blob([serializeSavedSelections(book, { w: f.w, h: f.h })], {
            type: 'application/json',
          }),
        ),
        link = document.createElement('a');
      link.href = url;
      link.download = `${savedSelectionName || 'selection'}.pixelselection`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Selection file downloaded');
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Selection file could not be saved',
      );
    }
  };
  const importSelection = async (selected?: File) => {
    if (!selected) return;
    try {
      const f = current(),
        book = parseSavedSelections(await selected.text(), { w: f.w, h: f.h });
      const entry = book.selections[0];
      if (!entry) throw new Error('Selection file is empty.');
      if (
        entry.selection.mask &&
        !Object.hasOwn(assets.current, entry.selection.mask)
      )
        throw new Error(
          'Selection file references pixels that are not included.',
        );
      let merged = currentSavedSelections();
      for (const imported of book.selections) {
        merged = saveSelection(merged, imported.selection, imported.name, {
          id: imported.id,
          bounds: { w: f.w, h: f.h },
        });
      }
      if (commit({ ...f, selection: entry.selection, savedSelections: merged }))
        setNotice(`Selection “${entry.name}” loaded`);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Selection file could not be opened',
      );
    } finally {
      if (selectionFile.current) selectionFile.current.value = '';
    }
  };
  const localSelectionMask = async (
    selection: Selection,
    frameWidth: number,
    frameHeight: number,
    layer: Layer,
    width: number,
    height: number,
  ) => {
    const frameMask = await renderSelection(
      selection,
      frameWidth,
      frameHeight,
      assets.current,
    );
    const [a, b, c, d, e, f] = layer.matrix;
    if (
      a === 1 &&
      b === 0 &&
      c === 0 &&
      d === 1 &&
      e === 0 &&
      f === 0 &&
      width === frameWidth &&
      height === frameHeight
    )
      return frameMask;
    const determinant = a * d - b * c;
    if (Math.abs(determinant) < 0.000000000001) return frameMask;
    const localMask = surface(width, height),
      context = localMask.getContext('2d')!;
    context.setTransform(
      d / determinant,
      -b / determinant,
      -c / determinant,
      a / determinant,
      (c * f - d * e) / determinant,
      (b * e - a * f) / determinant,
    );
    context.drawImage(frameMask, 0, 0);
    context.setTransform(1, 0, 0, 1, 0, 0);
    return localMask;
  };
  const groupForLayer = (f: Frame, layer: Layer) =>
    layer.groupId
      ? f.groups?.find((group) => group.id === layer.groupId)
      : undefined;
  const layerIsLocked = (f: Frame, layer: Layer) =>
    layer.locked || Boolean(groupForLayer(f, layer)?.locked);
  const editLayer = (patch: Partial<Layer>) => {
    if (quickMasking) {
      setNotice('Exit Quick Mask mode before editing layers');
      return false;
    }
    const f = current(),
      layer = f.layers.find((l) => l.id === f.active)!;
    const group = groupForLayer(f, layer);
    if (
      group?.locked ||
      (patch.groupId !== undefined &&
        f.groups?.some((item) => item.id === patch.groupId && item.locked)) ||
      (layer.locked && !('locked' in patch) && !('visible' in patch))
    ) {
      setNotice('Unlock this layer before editing');
      return false;
    }
    if ('groupId' in patch) {
      let grouped: Frame;
      try {
        grouped = assignLayerToGroup(f, layer.id, patch.groupId);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Layer folder could not be updated');
        return false;
      }
      if (JSON.stringify(grouped) === JSON.stringify(f)) return true;
      if (commit(grouped)) {
        setNotice(patch.groupId ? 'Layer added to folder' : 'Layer removed from folder');
        return true;
      }
      return false;
    }
    const next =
      patch.kind && patch.kind !== layer.kind
        ? (patch as Layer)
        : ({ ...layer, ...patch } as Layer);
    if (JSON.stringify(next) === JSON.stringify(layer)) return true;
    if (
      commit({
        ...f,
        layers: f.layers.map((l) => (l.id === layer.id ? next : l)),
      })
    ) {
      setNotice('Layer updated');
      return true;
    }
    return false;
  };
  const alignText = (textAlign: TextAlign) => {
    const f = current(),
      layer = f.layers.find((item) => item.id === f.active);
    if (!layer || layer.kind !== 'text') {
      setNotice('Select a text layer before changing alignment');
      return;
    }
    editLayer({ textAlign });
  };
  const setTextOrientation = (orientation: 'horizontal' | 'vertical') => {
    const f = current();
    const layer = f.layers.find((item) => item.id === f.active);
    if (!layer || layer.kind !== 'text') {
      setNotice('Select a text layer before changing orientation');
      return;
    }
    editLayer({ orientation });
  };
  const editGroup = (id: string, patch: Partial<Group>) => {
    if (quickMasking) {
      setNotice('Exit Quick Mask mode before editing layers');
      return false;
    }
    const f = current(),
      group = f.groups?.find((item) => item.id === id);
    if (!group) return false;
    if (
      group.locked &&
      !('locked' in patch) &&
      !('visible' in patch) &&
      !('collapsed' in patch)
    ) {
      setNotice('Unlock this group before editing it');
      return false;
    }
    const next = { ...group, ...patch };
    if (JSON.stringify(next) === JSON.stringify(group)) return true;
    if (
      commit({
        ...f,
        groups: (f.groups || []).map((item) => (item.id === id ? next : item)),
      })
    ) {
      setNotice('Group updated');
      return true;
    }
    return false;
  };
  type SelectionCandidate = {
    selection: Selection;
    /** A detached canvas to persist only after the starting frame is current. */
    mask?: HTMLCanvasElement;
  };
  /** Resolve a raster selection candidate without mutating assets or history. */
  const composeSelectionCandidate = async (
    frame: Frame,
    next: Selection,
    incoming: HTMLCanvasElement,
    operation: SelectionOperation,
    sourceAssets: Assets,
  ): Promise<SelectionCandidate> => {
    if (!frame.selection || operation === 'replace')
      return { selection: next, mask: incoming };
    const existing = await renderSelection(
        frame.selection,
        frame.w,
        frame.h,
        sourceAssets,
      ),
      existingPixels = existing.getContext('2d')!.getImageData(0, 0, frame.w, frame.h).data,
      incomingPixels = incoming.getContext('2d')!.getImageData(0, 0, frame.w, frame.h).data,
      existingAlpha = new Uint8ClampedArray(frame.w * frame.h),
      incomingAlpha = new Uint8ClampedArray(frame.w * frame.h);
    for (let index = 0; index < existingAlpha.length; index += 1) {
      existingAlpha[index] = existingPixels[index * 4 + 3];
      incomingAlpha[index] = incomingPixels[index * 4 + 3];
    }
    const composed = composeSelectionAlpha(existingAlpha, incomingAlpha, operation),
      merged = surface(frame.w, frame.h),
      image = merged.getContext('2d')!.createImageData(frame.w, frame.h);
    for (let index = 0; index < composed.mask.length; index += 1) {
      const offset = index * 4;
      image.data[offset] = 255;
      image.data[offset + 1] = 255;
      image.data[offset + 2] = 255;
      image.data[offset + 3] = composed.mask[index];
    }
    merged.getContext('2d')!.putImageData(image, 0, 0);
    return { selection: { ...next, mask: undefined }, mask: merged };
  };
  const isCurrentSelectionOperation = (
    frame: Frame,
    frameIndex: number,
    workToken: number,
  ) =>
    selectionWorkToken.current === workToken &&
    index.current === frameIndex &&
    current() === frame;
  /** Publish a raster selection only after all asynchronous work is current. */
  const publishSelectionCandidate = (
    frame: Frame,
    frameIndex: number,
    workToken: number,
    candidate: SelectionCandidate,
    notice: string,
  ) => {
    if (!isCurrentSelectionOperation(frame, frameIndex, workToken)) return false;
    if (!candidate.mask) throw new Error('Selection mask is unavailable');
    const maskId = addAsset(assets.current, candidate.mask),
      selection = { ...candidate.selection, mask: maskId };
    if (!isCurrentSelectionOperation(frame, frameIndex, workToken)) return false;
    if (!commit({ ...frame, selection })) return false;
    setNotice(notice);
    return true;
  };
  /**
   * Render editable text into the existing full-canvas selection-mask asset.
   * The source layer is cloned with a temporary flow orientation, so the
   * command never converts or mutates the user's text metadata.
   */
  const applyTextMask = async (orientation: TextMaskOrientation) => {
    const f = current();
    const layer = f.layers.find((item) => item.id === f.active);
    if (!layer || layer.kind !== 'text' || layerIsLocked(f, layer) || !layer.visible || groupForLayer(f, layer)?.visible === false) {
      setNotice('Select a visible, unlocked text layer before creating a type mask');
      return;
    }
    const [a, b, c, d, e, g] = layer.matrix;
    if (
      ![a, b, c, d, e, g].every((value) => Number.isFinite(value) && Math.abs(value) <= 1000000) ||
      Math.abs(a * d - b * c) < 1e-12
    ) {
      setNotice('Text layer transform is invalid for a type mask');
      return;
    }
    let request: ReturnType<typeof normalizeTextMaskRequest>;
    try {
      request = normalizeTextMaskRequest({
        width: f.w,
        height: f.h,
        text: layer.text,
        orientation,
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Text mask request is invalid');
      return;
    }
    const frameIndex = index.current,
      workToken = ++selectionWorkToken.current,
      operation = selectionOperation,
      sourceAssets = assets.current;
    try {
      const mask = surface(request.width, request.height),
        context = mask.getContext('2d');
      if (!context) throw new Error('Text mask canvas is unavailable');
      const textLayer = effectiveTextLayer({ ...layer, orientation }, f.w);
      context.save();
      context.setTransform(...textLayer.matrix);
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';
      context.fillStyle = '#fff';
      context.font = `${textLayer.bold ? '700' : '400'} ${textLayer.fontSize}px "${textLayer.fontFamily}"`;
      context.textBaseline = 'top';
      drawTextLayer(context, textLayer);
      context.restore();
      const rendered = context.getImageData(0, 0, request.width, request.height),
        alpha = alphaFromRgba(rendered.data, request.width, request.height);
      if (!alpha.some((value) => value > 0)) {
        setNotice('Text mask has no rendered glyph pixels');
        return;
      }
      // Normalize RGB in the rendered buffer so mask assets remain portable
      // across browser encoders; selection composition consumes only alpha.
      for (let pixel = 0; pixel < alpha.length; pixel += 1) {
        const offset = pixel * 4;
        rendered.data[offset] = 255;
        rendered.data[offset + 1] = 255;
        rendered.data[offset + 2] = 255;
      }
      context.putImageData(rendered, 0, 0);
      const next: Selection = {
        shape: 'rectangle',
        x: 0,
        y: 0,
        w: f.w,
        h: f.h,
        feather: 0,
        inverted: false,
      };
      const candidate = await composeSelectionCandidate(
        f,
        next,
        mask,
        operation,
        sourceAssets,
      );
      publishSelectionCandidate(
        f,
        frameIndex,
        workToken,
        candidate,
        `${orientation === 'horizontal' ? 'Horizontal' : 'Vertical'} Type Mask selection created`,
      );
    } catch (error) {
      if (isCurrentSelectionOperation(f, frameIndex, workToken))
        setNotice(error instanceof Error ? error.message : 'Could not create a Type Mask selection');
    }
  };
  const setSelection = (selection: Selection | undefined) => {
    const f = current();
    if (JSON.stringify(f.selection) === JSON.stringify(selection)) return;
    // A deselect keeps the exact editable snapshot needed by Select > Reselect.
    // New selections intentionally retain that snapshot until a later deselect
    // replaces it; it remains local document metadata and never leaves exports.
    const next = selection
      ? { ...f, selection }
      : {
          ...f,
          selection: undefined,
          previousSelection: f.selection || f.previousSelection,
        };
    if (commit(next)) {
      const label =
        selection?.shape === 'ellipse'
          ? 'Elliptical'
          : selection?.shape === 'polygon'
            ? 'Polygonal'
            : 'Rectangular';
      setNotice(selection ? `${label} selection created` : 'Selection cleared');
    }
  };
  const applyColorRange = async (sample: string, fuzziness: number) => {
    const f = current(),
      frameIndex = index.current,
      workToken = ++selectionWorkToken.current,
      operation = selectionOperation,
      sourceAssets = assets.current;
    setColorRanging(false);
    const match = /^#([a-f\d]{6})$/i.exec(sample);
    if (!match) {
      setNotice('Color Range sample color is invalid');
      return;
    }
    try {
      const rendered = await renderFrame(f, sourceAssets),
        pixels = rendered.getContext('2d')!.getImageData(0, 0, f.w, f.h).data,
        rgb: [number, number, number] = [
          Number.parseInt(match[1].slice(0, 2), 16),
          Number.parseInt(match[1].slice(2, 4), 16),
          Number.parseInt(match[1].slice(4, 6), 16),
        ],
        alpha = colorRangeMask(pixels, {
          width: f.w,
          height: f.h,
          target: rgb,
          fuzziness,
        }),
        mask = surface(f.w, f.h),
        image = mask.getContext('2d')!.createImageData(f.w, f.h);
      for (let index = 0; index < alpha.length; index += 1) {
        const offset = index * 4;
        image.data[offset] = 255;
        image.data[offset + 1] = 255;
        image.data[offset + 2] = 255;
        image.data[offset + 3] = alpha[index];
      }
      mask.getContext('2d')!.putImageData(image, 0, 0);
      const next: Selection = {
        shape: 'rectangle',
        x: 0,
        y: 0,
        w: f.w,
        h: f.h,
        feather: 0,
        inverted: false,
      };
      const candidate = await composeSelectionCandidate(
        f,
        next,
        mask,
        operation,
        sourceAssets,
      );
      publishSelectionCandidate(
        f,
        frameIndex,
        workToken,
        candidate,
        `Color Range selection created (fuzziness ${fuzziness})`,
      );
    } catch {
      if (isCurrentSelectionOperation(f, frameIndex, workToken))
        setNotice('Could not create a Color Range selection');
    }
  };
  const applyFocusArea = async (threshold: number, softness: number) => {
    const f = current(), frameIndex = index.current,
      workToken = ++selectionWorkToken.current,
      operation = selectionOperation, sourceAssets = assets.current;
    setFocusAreaThreshold(threshold);
    setFocusAreaSoftness(softness);
    setFocusAreaValue(false);
    try {
      const rendered = await renderFrame(f, sourceAssets),
        pixels = rendered.getContext('2d')!.getImageData(0, 0, f.w, f.h).data,
        alpha = focusAreaMask(pixels, { width: f.w, height: f.h, threshold, softness }),
        mask = surface(f.w, f.h), image = mask.getContext('2d')!.createImageData(f.w, f.h);
      for (let pixel = 0; pixel < alpha.length; pixel += 1) {
        const offset = pixel * 4;
        image.data[offset] = 255; image.data[offset + 1] = 255; image.data[offset + 2] = 255; image.data[offset + 3] = alpha[pixel];
      }
      mask.getContext('2d')!.putImageData(image, 0, 0);
      const selection: Selection = { shape: 'rectangle', x: 0, y: 0, w: f.w, h: f.h, feather: 0, inverted: false };
      const candidate = await composeSelectionCandidate(f, selection, mask, operation, sourceAssets);
      publishSelectionCandidate(f, frameIndex, workToken, candidate, `Focus Area selection created (threshold ${threshold}, softness ${softness})`);
    } catch {
      if (isCurrentSelectionOperation(f, frameIndex, workToken)) setNotice('Could not create a Focus Area selection');
    }
  };
  const applySimilarSelection = async () => {
    const f = current();
    if (!f.selection) {
      setNotice('Create a selection before selecting similar colours');
      return;
    }
    const frameIndex = index.current,
      workToken = ++selectionWorkToken.current,
      operation = selectionOperation,
      sourceAssets = assets.current;
    try {
      const rendered = await renderFrame(f, sourceAssets);
      const source = rendered
        .getContext('2d')!
        .getImageData(0, 0, f.w, f.h).data;
      const seedCanvas = await renderSelection(
        f.selection,
        f.w,
        f.h,
        sourceAssets,
      );
      const seedAlpha = seedCanvas
        .getContext('2d')!
        .getImageData(0, 0, f.w, f.h).data;
      const seed = new Uint8ClampedArray(f.w * f.h);
      for (let pixel = 0; pixel < seed.length; pixel += 1)
        seed[pixel] = seedAlpha[pixel * 4 + 3];
      const result = similarColorMask(source, seed, {
        width: f.w,
        height: f.h,
        fuzziness: colorTolerance,
      });
      const mask = surface(f.w, f.h),
        image = mask.getContext('2d')!.createImageData(f.w, f.h);
      for (let pixel = 0; pixel < result.mask.length; pixel += 1) {
        const offset = pixel * 4;
        image.data[offset] = 255;
        image.data[offset + 1] = 255;
        image.data[offset + 2] = 255;
        image.data[offset + 3] = result.mask[pixel];
      }
      mask.getContext('2d')!.putImageData(image, 0, 0);
      const next: Selection = {
        shape: 'rectangle',
        x: 0,
        y: 0,
        w: f.w,
        h: f.h,
        feather: 0,
        inverted: false,
      };
      const candidate = await composeSelectionCandidate(
        f,
        next,
        mask,
        operation,
        sourceAssets,
      );
      if (!isCurrentSelectionOperation(f, frameIndex, workToken)) return;
      publishSelectionCandidate(
        f,
        frameIndex,
        workToken,
        candidate,
        `Similar selection created (fuzziness ${colorTolerance})`,
      );
    } catch (error) {
      if (isCurrentSelectionOperation(f, frameIndex, workToken))
        setNotice(
          error instanceof Error
            ? error.message
            : 'Could not create a Similar selection',
        );
    }
  };
  const reselect = () => {
    const f = current();
    if (f.selection) {
      setNotice('A selection is already active');
      return;
    }
    if (!f.previousSelection) {
      setNotice('No previous selection to restore');
      return;
    }
    if (commit({ ...f, selection: f.previousSelection }))
      setNotice('Previous selection restored');
  };
  const applySelectionTransform = (matrix: Matrix) => {
    const f = current();
    if (!f.selection) {
      setNotice('Create a selection before transforming it');
      setSelectionTransforming(false);
      return;
    }
    try {
      const selection = transformSelectionModel(f.selection, matrix);
      if (commit({ ...f, selection })) setNotice('Selection transform applied');
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Selection transform failed',
      );
    } finally {
      setSelectionTransforming(false);
    }
  };
  const beginLayerTransform = () => {
    if (quickMasking) {
      setNotice('Exit Quick Mask mode before transforming a layer');
      return;
    }
    const f = current();
    const layer = f.layers.find((item) => item.id === f.active);
    if (!layer) {
      setNotice('Select a layer before transforming it');
      return;
    }
    if (layerIsLocked(f, layer)) {
      setNotice('Unlock this layer before transforming it');
      return;
    }
    try {
      layerLocalBounds(layer, assets.current);
      setLayerTransforming(true);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Layer bounds could not be measured',
      );
    }
  };
  const applyLayerTransform = (matrix: Matrix) => {
    const f = current();
    const layer = f.layers.find((item) => item.id === f.active);
    if (!layer) {
      setLayerTransforming(false);
      setNotice('Select a layer before transforming it');
      return;
    }
    if (layerIsLocked(f, layer)) {
      setLayerTransforming(false);
      setNotice('Unlock this layer before transforming it');
      return;
    }
    try {
      const nextMatrix = multiply(matrix, layer.matrix);
      if (
        commit({
          ...f,
          layers: f.layers.map((item) =>
            item.id === layer.id ? { ...item, matrix: nextMatrix } : item,
          ),
        })
      )
        setNotice('Free transform applied');
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Free transform failed',
      );
    } finally {
      setLayerTransforming(false);
    }
  };
  const applySelectionRefinement = async (radius: number) => {
    const mode = selectionRefining;
    const f = current();
    const beforeIndex = index.current;
    const beforeFrame = f;
    if (!mode || !f.selection) {
      setNotice('Create a selection before refining it');
      setSelectionRefining(null);
      return;
    }
    try {
      const rendered = await renderSelection(
        f.selection,
        f.w,
        f.h,
        assets.current,
      );
      const context = rendered.getContext('2d');
      if (!context) throw new Error('Selection mask renderer is unavailable');
      const pixels = context.getImageData(0, 0, f.w, f.h).data;
      const alpha = new Uint8ClampedArray(f.w * f.h);
      for (let target = 0; target < alpha.length; target += 1) {
        alpha[target] = pixels[target * 4 + 3];
      }
      const refined = refineSelectionAlpha(alpha, f.w, f.h, mode, radius);
      // A refined selection is a canvas-sized alpha mask. RGB is white so the
      // asset remains inspectable without changing alpha compositing semantics.
      const mask = surface(f.w, f.h);
      const maskContext = mask.getContext('2d');
      if (!maskContext)
        throw new Error('Selection mask surface is unavailable');
      const output = maskContext.createImageData(f.w, f.h);
      for (let source = 0; source < refined.length; source += 1) {
        const target = source * 4;
        output.data[target] = 255;
        output.data[target + 1] = 255;
        output.data[target + 2] = 255;
        output.data[target + 3] = refined[source];
      }
      maskContext.putImageData(output, 0, 0);
      if (index.current !== beforeIndex || current() !== beforeFrame) return;
      const maskId = addAsset(assets.current, mask);
      const selection: Selection = {
        shape: 'rectangle',
        x: 0,
        y: 0,
        w: f.w,
        h: f.h,
        feather: 0,
        inverted: false,
        mask: maskId,
      };
      if (commit({ ...f, selection })) {
        const label =
          mode === 'grow'
            ? 'grown'
            : mode === 'contract'
              ? 'contracted'
              : mode === 'border'
                ? 'bordered'
                : 'smoothed';
        setNotice(`Selection ${label} by ${radius} px`);
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Selection refinement failed',
      );
    } finally {
      setSelectionRefining(null);
    }
  };
  const selectAll = () => {
    const f = current();
    setSelection({
      shape: 'rectangle',
      x: 0,
      y: 0,
      w: f.w,
      h: f.h,
      feather: 0,
      inverted: false,
      parts: [
        {
          shape: 'rectangle',
          x: 0,
          y: 0,
          w: f.w,
          h: f.h,
          operation: 'replace',
        },
      ],
    });
    setNotice('Entire canvas selected');
  };
  const selectionPart = (selection: Selection): SelectionPart => ({
    shape: selection.shape,
    x: selection.x,
    y: selection.y,
    w: selection.w,
    h: selection.h,
    points: selection.points,
    operation: 'replace',
  });
  const mergeSelection = (next: Selection) => {
    const frame = current(),
      frameIndex = index.current,
      workToken = ++selectionWorkToken.current,
      operation = selectionOperation,
      sourceAssets = assets.current,
      currentSelection = frame.selection;
    if (!currentSelection || operation === 'replace') {
      setSelection({ ...next, parts: [selectionPart(next)] });
      return;
    }
    // Keep simple geometry editable. Once either side is an alpha mask or has
    // feather/inversion/transform metadata, resolve both sides to pixels so
    // composition cannot silently discard selected coverage.
    const simpleGeometry =
      !currentSelection.mask &&
      !next.mask &&
      !currentSelection.feather &&
      !next.feather &&
      !currentSelection.inverted &&
      !next.inverted &&
      !currentSelection.matrix &&
      !next.matrix;
    if (simpleGeometry) {
      const parts = currentSelection.parts?.slice() || [
        selectionPart(currentSelection),
      ];
      parts.push({ ...selectionPart(next), operation });
      if (isCurrentSelectionOperation(frame, frameIndex, workToken))
        setSelection({ ...next, parts });
      return;
    }
    void (async () => {
      try {
        const incoming = await renderSelection(
          next,
          frame.w,
          frame.h,
          sourceAssets,
        );
        if (!isCurrentSelectionOperation(frame, frameIndex, workToken)) return;
        const candidate = await composeSelectionCandidate(
          frame,
          next,
          incoming,
          operation,
          sourceAssets,
        );
        if (!isCurrentSelectionOperation(frame, frameIndex, workToken)) return;
        publishSelectionCandidate(
          frame,
          frameIndex,
          workToken,
          candidate,
          `${next.shape === 'ellipse' ? 'Elliptical' : next.shape === 'polygon' ? 'Polygonal' : 'Rectangular'} selection created`,
        );
      } catch {
        if (isCurrentSelectionOperation(frame, frameIndex, workToken))
          setNotice('Could not compose the selection');
      }
    })();
  };
  const finishPolygonalLasso = (g: Gesture) => {
    const points = g.points || [];
    if (points.length < 3) {
      void paint(g.frame);
      setNotice('Polygonal lasso needs at least three points');
      return;
    }
    const bounded = points.map((point) => ({
      x: Math.max(0, Math.min(g.frame.w, point.x)),
      y: Math.max(0, Math.min(g.frame.h, point.y)),
    }));
    const x = Math.min(...bounded.map((point) => point.x)),
      y = Math.min(...bounded.map((point) => point.y)),
      right = Math.max(...bounded.map((point) => point.x)),
      bottom = Math.max(...bounded.map((point) => point.y));
    if (right - x <= 0 || bottom - y <= 0) {
      void paint(g.frame);
      setNotice('Polygonal lasso needs a non-zero area');
      return;
    }
    mergeSelection({
      shape: 'polygon',
      x,
      y,
      w: right - x,
      h: bottom - y,
      points: bounded,
      feather: 0,
      inverted: false,
    });
    setNotice('Polygonal selection created');
  };
  const invertSelection = () => {
    const f = current();
    if (!f.selection) {
      setNotice('Select an area before inverting it');
      return;
    }
    setSelection({ ...f.selection, inverted: !f.selection.inverted });
  };
  const setSelectionFeather = (feather: number) => {
    const f = current();
    if (f.selection && commit({ ...f, selection: { ...f.selection, feather } }))
      setNotice(`Selection feather set to ${Math.round(feather)} px`);
  };
  const createMaskFromSelection = async () => {
    const f = current(),
      layer = f.layers.find((l) => l.id === f.active);
    if (!f.selection || !layer || !isMaskableLayer(layer)) {
      setNotice('Select an image, smart object or adjustment layer and create a selection first');
      return;
    }
    if (layerIsLocked(f, layer)) {
      setNotice('Unlock this layer before editing its mask');
      return;
    }
    const mask = await renderSelection(f.selection, f.w, f.h, assets.current);
    const maskId = addAsset(assets.current, mask);
    if (
      editLayer({
        mask: maskId,
        maskEnabled: true,
        maskInverted: false,
      })
    )
      setNotice('Nondestructive layer mask created');
  };
  const invertLayerMask = () => {
    const f = current(),
      layer = f.layers.find((item) => item.id === f.active);
    if (!layer || !isMaskableLayer(layer) || !layer.mask || !layer.visible) {
      setNotice('Create a layer mask before inverting it');
      return;
    }
    if (layerIsLocked(f, layer)) {
      setNotice('Unlock this layer before editing its mask');
      return;
    }
    if (
      editLayer({
        maskInverted: !(layer.maskInverted === true),
      })
    )
      setNotice(
        layer.maskInverted
          ? 'Layer mask inverted back to normal'
          : 'Layer mask inverted',
      );
  };
  const toggleLayerMask = () => {
    const f = current(),
      layer = f.layers.find((item) => item.id === f.active);
    if (!layer || !isMaskableLayer(layer) || !layer.mask || !layer.visible) {
      setNotice('Create a layer mask before disabling it');
      return;
    }
    if (layerIsLocked(f, layer)) {
      setNotice('Unlock this layer before editing its mask');
      return;
    }
    const enabled = layer.maskEnabled !== false;
    if (editLayer({ maskEnabled: !enabled }))
      setNotice(enabled ? 'Layer mask disabled' : 'Layer mask enabled');
  };
  const clearMask = () => {
    const f = current(),
      layer = f.layers.find((item) => item.id === f.active);
    if (!layer || !isMaskableLayer(layer) || !layer.mask || !layer.visible)
      return;
    if (layerIsLocked(f, layer)) {
      setNotice('Unlock this layer before editing its mask');
      return;
    }
    if (
      editLayer({
        mask: undefined,
        maskEnabled: undefined,
        maskInverted: undefined,
      })
    )
      setNotice('Layer mask removed; source pixels kept');
  };
  const removeBackground = async () => {
    const f = current();
    const layer = f.layers.find((item) => item.id === f.active);
    if (!layer || layer.kind !== 'raster' || !layer.visible) {
      setNotice('Select a visible raster layer before removing its background');
      return;
    }
    if (layerIsLocked(f, layer)) {
      setNotice('Unlock this layer before removing its background');
      return;
    }
    try {
      const image = await decodeAsset(assets.current[layer.asset]);
      // Segment in native raster coordinates so a small/translated layer is
      // not mistaken for an interior island merely because its backdrop does
      // not touch the document canvas edge.
      const source = surface(image.naturalWidth, image.naturalHeight);
      const context = source.getContext('2d');
      if (!context) throw new Error('Background removal canvas is unavailable');
      context.drawImage(image, 0, 0);
      const result = createBackgroundMask(source, colorTolerance);
      // Decode/mask generation is asynchronous. Do not attach a result to a
      // different active layer or a newer history frame chosen meanwhile.
      if (current() !== f || current().active !== layer.id) {
        setNotice('The document changed while the background was calculated');
        return;
      }
      const maskCanvas = surface(f.w, f.h);
      const maskContext = maskCanvas.getContext('2d');
      if (!maskContext)
        throw new Error('Background removal mask is unavailable');
      maskContext.imageSmoothingEnabled = false;
      maskContext.save();
      maskContext.setTransform(...layer.matrix);
      maskContext.drawImage(result.canvas, 0, 0);
      maskContext.restore();
      const mask = addAsset(assets.current, maskCanvas);
      if (editLayer({ mask, maskEnabled: true, maskInverted: false })) {
        const removed = Math.round(
          (result.removedPixels / Math.max(1, result.eligiblePixels)) * 100,
        );
        setNotice(
          `Background removed nondestructively (${removed}% edge pixels)`,
        );
      }
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Background removal could not be applied',
      );
    }
  };
  const applyContentAwareFill = async () => {
    const f = current(),
      layer = f.layers.find((item) => item.id === f.active);
    if (!f.selection) {
      setNotice('Create a selection before using Content-Aware Fill');
      return;
    }
    if (!layer || layer.kind !== 'raster' || !layer.visible) {
      setNotice('Select a visible raster layer before using Content-Aware Fill');
      return;
    }
    if (layerIsLocked(f, layer)) {
      setNotice('Unlock this layer before using Content-Aware Fill');
      return;
    }
    if ((layer.contentAwareFills?.length ?? 0) >= CONTENT_AWARE_MAX_OPERATIONS) {
      setNotice(
        `This layer has ${CONTENT_AWARE_MAX_OPERATIONS} Content-Aware Fill operations; export a copy before adding more`,
      );
      return;
    }
    try {
      const image = await decodeAsset(assets.current[layer.asset]),
        width = image.naturalWidth,
        height = image.naturalHeight,
        mask = await selectionMaskForLayer(
          f.selection,
          f,
          layer,
          assets.current,
          width,
          height,
        );
      if (!mask || !mask.some((alpha) => alpha > 0)) {
        setNotice('The selection does not intersect the active raster layer');
        return;
      }
      if (current() !== f || current().active !== layer.id) {
        setNotice('The document changed while Content-Aware Fill was prepared');
        return;
      }
      const maskCanvas = surface(width, height),
        context = maskCanvas.getContext('2d');
      if (!context) throw new Error('Content-Aware Fill mask is unavailable');
      const imageData = context.createImageData(width, height);
      for (let index = 0; index < mask.length; index += 1) {
        const offset = index * 4;
        imageData.data[offset] = 255;
        imageData.data[offset + 1] = 255;
        imageData.data[offset + 2] = 255;
        imageData.data[offset + 3] = mask[index];
      }
      context.putImageData(imageData, 0, 0);
      const maskId = addAsset(assets.current, maskCanvas),
        fill: ContentAwareFill = {
          version: 1,
          mask: maskId,
          radius: Math.max(1, Math.min(128, Math.round(Math.max(4, size / 2)))),
          opacity: brushOpacity / 100,
        };
      if (
        editLayer({
          contentAwareFills: [...(layer.contentAwareFills ?? []), fill],
        })
      )
        setNotice(
          'Content-Aware Fill applied locally; source and alpha remain unchanged',
        );
    } catch {
      setNotice('Content-Aware Fill could not be applied');
    }
  };
  const adjust = (patch: Partial<Adjustments>) => {
    const layer = current().layers.find((l) => l.id === current().active)!;
    return editLayer({
      adjustments: { ...effectiveAdjustments(layer.adjustments), ...patch },
    });
  };
  const autoCorrect = async (mode: AutoMode) => {
    const f = current(),
      layer = f.layers.find((item) => item.id === f.active);
    if (!layer || layer.kind !== 'raster') {
      setNotice(
        'Select a raster layer before applying an automatic correction',
      );
      return;
    }
    if (layerIsLocked(f, layer) || !layer.visible) {
      setNotice(
        'Unlock and show this layer before applying an automatic correction',
      );
      return;
    }
    const currentAuto = effectiveAdjustments(layer.adjustments).auto;
    if (currentAuto[mode]) {
      setNotice(`Auto ${mode} is already enabled on this layer`);
      return;
    }
    try {
      const image = await decodeAsset(assets.current[layer.asset]);
      const source = surface(image.naturalWidth, image.naturalHeight),
        sourceContext = source.getContext('2d')!;
      sourceContext.drawImage(image, 0, 0);
      const pixels = sourceContext.getImageData(
        0,
        0,
        source.width,
        source.height,
      ).data;
      const result = applyAutoAdjustmentsPixels(pixels, {
        tone: mode === 'tone',
        contrast: mode === 'contrast',
        color: mode === 'color',
      });
      if (current() !== f) {
        setNotice('The document changed while the correction was calculated');
        return;
      }
      if (!result.changed) {
        setNotice(`Auto ${mode} found no usable tonal range`);
        return;
      }
      const label = mode[0].toUpperCase() + mode.slice(1);
      if (
        adjust({
          auto: { ...currentAuto, [mode]: true },
        })
      )
        setNotice(`Auto ${label} applied; the correction remains editable`);
    } catch {
      setNotice(`Auto ${mode} could not be applied to this layer`);
    }
  };
  const resetAdjustments = () => adjust({ ...neutral });
  const setBrightness = (brightness: number) => adjust({ brightness }),
    setContrast = (contrast: number) => adjust({ contrast }),
    setSaturation = (saturation: number) => adjust({ saturation }),
    setHue = (hue: number) => adjust({ hue }),
    setBlur = (blur: number) => adjust({ blur }),
    setLevelsBlack = (levelsBlack: number) => adjust({ levelsBlack }),
    setLevelsWhite = (levelsWhite: number) => adjust({ levelsWhite }),
    setLevelsGamma = (levelsGamma: number) => adjust({ levelsGamma }),
    setLevelsOutputBlack = (levelsOutputBlack: number) =>
      adjust({ levelsOutputBlack }),
    setLevelsOutputWhite = (levelsOutputWhite: number) =>
      adjust({ levelsOutputWhite });
  const setColorBalance = (patch: Partial<Adjustments['colorBalance']>) =>
    adjust({ colorBalance: { ...colorBalance, ...patch } });
  const setCurve = (channel: CurveChannel, points: CurvePoints) =>
    adjust({ curves: { ...curves, [channel]: points } });
  const setSharpenNoise = (patch: Partial<Adjustments['sharpenNoise']>) =>
    adjust({ sharpenNoise: { ...sharpenNoise, ...patch } });
  const setFilterEffects = (patch: Partial<Adjustments['filterEffects']>) =>
    adjust({ filterEffects: { ...filterEffects, ...patch } });
  const setPhotoAdjustments = (
    patch: Partial<Adjustments['photoAdjustments']>,
  ) => adjust({ photoAdjustments: { ...photoAdjustments, ...patch } });
  const chooseFilterEffect = (type: FilterEffectType, label: string) => {
    if (
      adjust({
        filterEffects:
          type === 'none'
            ? { ...neutralFilterEffects }
            : {
                ...effectiveFilterEffects(filterEffects),
                type,
                ...(type === 'path-blur' ? { path: DEFAULT_BLUR_PATH.map((point) => ({ ...point })) } : {}),
                ...(type === 'spin-blur' ? { spinEllipse: { ...DEFAULT_SPIN_ELLIPSE } } : {}),
                amount:
                  type === 'average-blur' ||
                  type === 'blur-more' ||
                  type === 'mosaic' || type === 'crystallize' || type === 'color-halftone'
                  || type === 'pointillize'
                    ? 85
                  : type === 'lens-correction'
                    ? 75
                    : type === 'box-blur' || type === 'gaussian-blur' || type === 'lens-blur' || type === 'iris-blur' || type === 'smart-blur' || type === 'surface-blur' || type === 'shape-blur'
                      ? 85
                      : 70,
                radius:
                  type === 'mosaic' || type === 'crystallize' || type === 'color-halftone' || type === 'pointillize'
                    ? 10
                    : type === 'lens-correction'
                      ? 64
                    : type === 'pinch'
                      ? 40
                    : type === 'spherize'
                        ? 40
                      : type === 'polar-coordinates'
                        ? 64
                      : type === 'radial-blur' || type === 'spin-blur'
                        ? 18
                        : type === 'wave'
                          ? 12
                        : 6,
                angle:
                  type === 'twirl'
                    ? 75
                    : type === 'shear'
                      ? 90
                      : 0,
              },
      })
    )
      setNotice(
        type === 'none'
          ? 'Local filter effect cleared'
          : `${label} applied; remains editable in Filter effects`,
      );
  };
  const chooseFilter = (filter: string, label: string) => {
    if (adjust({ filter }))
      setNotice(`${label} applied to selected layer; remains editable`);
  };
  const clearCloud = () => {
    setCloud(undefined);
    setCloudMessage('');
  };
  const startRaster = (image: HTMLCanvasElement, title: string) => {
    const f = rasterFrame(image, assets.current);
    if (commit(f, true)) {
      clearClipboard();
      setDraftId(createDraftId());
      clearCloud();
      setName(title.slice(0, 160));
      setZoom(72);
      return true;
    }
    return false;
  };
  const newDocument = (transparent = false) => {
    const image = surface(1200, 800);
    if (!transparent) {
      image.getContext('2d')!.fillStyle = '#fff';
      image.getContext('2d')!.fillRect(0, 0, 1200, 800);
    }
    startRaster(image, transparent ? 'untitled-transparent' : 'untitled');
    setNotice(transparent ? 'New transparent document' : 'New document');
  };
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const saved = await readDraft(openingDraftId.current);
        if (cancelled) return;
        if (saved) {
          await install(saved);
          if (cancelled) return;
          setName(saved.name);
          setCloud(saved.cloud);
          localVersions.current.set(
            openingDraftId.current,
            saved.localRevision || 0,
          );
          restoreSettings(saved.settings);
          const restoredMask = saved.history[saved.index].quickMask;
          if (restoredMask?.active) {
            try {
              const image = await decodeAsset(saved.assets[restoredMask.asset]),
                data = imageToQuickMask(image);
              quickMaskRef.current = data;
              setQuickMask(data);
              setQuickMasking(true);
              void paint(saved.history[saved.index]).then(() =>
                drawQuickMaskOverlay(data),
              );
            } catch {
              setQuickMasking(false);
              setQuickMask(null);
              quickMaskRef.current = null;
            }
          }
          if (saved.migrated) {
            setDraftId(createDraftId());
            setNotice(
              'Upgraded to layers. Your original draft bookmark is kept.',
            );
          } else setNotice('Saved document restored');
          setReady(true);
          return;
        }
      } catch {
        if (cancelled) return;
        setDraftId(createDraftId());
        setNotice(
          'Recovery unavailable. Original draft kept; export backups of your work.',
        );
      }
      if (cancelled) return;
      const c = surface(1440, 960),
        x = c.getContext('2d')!,
        g = x.createLinearGradient(0, 0, 0, 960);
      g.addColorStop(0, '#163154');
      g.addColorStop(0.48, '#719ab4');
      g.addColorStop(0.49, '#dec6a4');
      g.addColorStop(1, '#986b49');
      x.fillStyle = g;
      x.fillRect(0, 0, 1440, 960);
      x.fillStyle = '#c9814f';
      x.beginPath();
      x.arc(1120, 260, 110, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#223b42';
      x.beginPath();
      x.moveTo(0, 580);
      x.lineTo(300, 370);
      x.lineTo(515, 575);
      x.lineTo(730, 430);
      x.lineTo(970, 610);
      x.lineTo(1440, 390);
      x.lineTo(1440, 720);
      x.lineTo(0, 720);
      x.fill();
      x.fillStyle = '#244e62';
      x.fillRect(0, 650, 1440, 310);
      x.strokeStyle = '#ffffff60';
      x.lineWidth = 8;
      for (let y = 690; y < 920; y += 55) {
        x.beginPath();
        x.moveTo(40, y);
        x.bezierCurveTo(350, y - 38, 610, y + 34, 980, y - 6);
        x.stroke();
      }
      commit(rasterFrame(c, assets.current), true);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // Settings are loaded once from the opening bookmark.
  }, [assets, commit, install, paint, restoreSettings]);
  useLayoutEffect(() => {
    if (!ready || index.current < 0 || discarding.current) return;
    const sequence = ++saveSequence.current;
    saving.current = true;
    setSaveStatus('Saving on this device…');
    const value: Draft = {
      version: 2,
      cloud,
      history: history.current.slice(),
      assets: { ...assets.current },
      index: index.current,
      name,
      settings: {
        tool,
        zoom,
        color,
        backgroundColor,
        size,
        brushOpacity,
        hardness,
        pressureSize,
        pressureOpacity,
        brushPreset,
        spacing: brushSpacing,
        angle: brushAngle,
        roundness: brushRoundness,
        flipX: brushFlipX,
        flipY: brushFlipY,
        patternId,
        patternTileSize,
        redEyeThreshold,
        redEyeAmount,
        colorTolerance,
        tonalExposure,
        tonalRange,
        spongeMode,
        spongeVibrance,
        mixerBrush,
        historyBrush,
        historySourceIndex,
        viewRotation,
        exportFormat,
        exportQuality,
        exportTargetBytes,
        text,
        fontSize,
        ...neutral,
      },
    };
    const pendingToken = stagePendingDraft(
      draftId,
      value,
      (localVersions.current.get(draftId) || 0) + 1,
    );
    saveQueue.current = saveQueue.current
      .then(async () => {
        if (discarding.current) return;
        const version = await saveDraft(
          draftId,
          value,
          localVersions.current.get(draftId) || 0,
          pendingToken,
        );
        localVersions.current.set(draftId, version);
      })
      .then(() => {
        if (sequence === saveSequence.current) {
          saving.current = false;
          setSaveStatus('Saved on this device');
        }
      })
      .catch((error: unknown) => {
        if (sequence === saveSequence.current) {
          saving.current = true;
          setSaveStatus(
            error instanceof Error && error.message === LOCAL_CONFLICT
              ? LOCAL_CONFLICT
              : 'Local save failed — export a copy',
          );
        }
      });
  }, [
    ready,
    revision,
    draftId,
    cloud,
    name,
    tool,
    zoom,
    color,
    backgroundColor,
    size,
    brushOpacity,
    hardness,
    pressureSize,
    pressureOpacity,
    brushPreset,
    brushSpacing,
    brushAngle,
    brushRoundness,
    brushFlipX,
    brushFlipY,
    patternId,
    patternTileSize,
    redEyeThreshold,
    redEyeAmount,
    colorTolerance,
    tonalExposure,
    tonalRange,
    spongeMode,
    spongeVibrance,
    mixerBrush,
    historyBrush,
    historySourceIndex,
    viewRotation,
    exportFormat,
    exportQuality,
    exportTargetBytes,
    text,
    fontSize,
    history,
    index,
    assets,
  ]);
  useEffect(() => {
    if (quickMasking && quickMask) drawQuickMaskOverlay(quickMask);
  }, [quickMasking, quickMask]);
  useEffect(() => {
    if (!ready) return;
    if (!frame?.quickMask?.active) {
      if (quickMasking && !quickMaskGesture.current) {
        quickMaskRef.current = null;
        setQuickMask(null);
        setQuickMasking(false);
      }
      return;
    }
    let cancelled = false;
    void decodeAsset(assets.current[frame.quickMask.asset])
      .then((image) => {
        if (cancelled) return;
        const restored = imageToQuickMask(image);
        quickMaskRef.current = restored;
        setQuickMask(restored);
        setQuickMasking(true);
        void paint(frame).then(() => drawQuickMaskOverlay(restored));
      })
      .catch(() => {
        if (!cancelled) setNotice('Quick Mask data could not be restored');
      });
    return () => {
      cancelled = true;
    };
  }, [ready, frame, quickMasking, paint, assets]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (saving.current || cloudBusy || recovering || gesture.current)
        event.preventDefault();
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [cloudBusy, recovering]);
  useEffect(() => {
    const open = () => {
      if (new URLSearchParams(location.hash.slice(1)).get('draft') !== draftId)
        location.reload();
    };
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, [draftId]);
  const saveToCloud = async (asCopy = false) => {
    if (!member || cloudBusy) return;
    setCloudBusy(true);
    setCloudMessage('Saving private cloud project…');
    setCloudConflict(null);
    const link = !asCopy && cloud?.owner === member.id ? cloud : undefined;
    try {
      const result = await saveCloudProject(
        link?.id || crypto.randomUUID(),
        link?.generation || '0',
        documentValue(),
      );
      setCloud({ ...result, owner: member.id });
      setCloudMessage(
        'Cloud copy saved. Choose Update cloud project after further edits.',
      );
    } catch (error) {
      if (error instanceof CloudConflictError) setCloudConflict(error);
      setCloudMessage(
        error instanceof Error
          ? error.message
          : 'Cloud save failed. Your local draft is safe.',
      );
    } finally {
      setCloudBusy(false);
    }
  };
  const reloadCloudCopy = async () => {
    if (!member || cloudBusy || !cloudConflict) return;
    const projectId = cloudConflict.projectId || cloud?.id;
    if (!projectId) {
      setCloudMessage('The remote project identity is unavailable. Save a new cloud copy.');
      return;
    }
    if (
      !confirm(
        'Replace the current local edits with the latest cloud project? Save as a new cloud project first if you want to keep these edits.',
      )
    )
      return;
    const expected = current();
    setCloudBusy(true);
    setCloudMessage('Loading the latest cloud project…');
    try {
      const result = await openCloudProject(projectId);
      if (current() !== expected)
        throw new Error('Document changed while the cloud project was loading.');
      await install(result.document);
      clearClipboard();
      setName(result.document.name);
      setCloud({
        id: result.id,
        generation: result.generation,
        owner: member.id,
      });
      restoreSettings(result.document.settings);
      quickMaskRef.current = null;
      setQuickMask(null);
      setQuickMasking(false);
      setCloudConflict(null);
      setCloudMessage('Latest cloud project restored. Local edits were replaced.');
      setNotice('Latest cloud project restored');
    } catch (error) {
      setCloudMessage(
        error instanceof Error
          ? error.message
          : 'Could not reload the cloud project. Your local edits are still available.',
      );
    } finally {
      setCloudBusy(false);
    }
  };
  const exportProject = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(documentValue())], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = (name || 'untitled') + '.pixelforge';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Editable project file downloaded');
  };
  const importProject = async (selected?: File) => {
    if (!selected) return;
    const expected = current();
    try {
      if (selected.size > 64 * 1024 * 1024)
        throw new Error('Project file exceeds 64 MB');
      const saved = validateDraft(JSON.parse(await selected.text()));
      if (current() !== expected)
        throw new Error('Document changed during import. Please try again.');
      await install(saved);
      clearClipboard();
      setDraftId(createDraftId());
      clearCloud();
      setName(saved.name);
      restoreSettings(saved.settings);
      setNotice('Project opened with editable layers and history');
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Project could not be opened',
      );
    } finally {
      if (projectFile.current) projectFile.current.value = '';
    }
  };
  const resizeImage = async (request: ImageSizeRequest) => {
    if (quickMasking) {
      setNotice('Exit Quick Mask mode before resizing the document');
      return;
    }
    const f = current();
    let plan;
    try {
      plan = planImageSize(f.w, f.h, f.imageSize, request);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Image Size values are invalid',
      );
      return;
    }
    if (!plan.resample) {
      if (!commit({ ...f, imageSize: plan.imageSize })) return;
      setResizing(null);
      setNotice('Print dimensions updated; pixel dimensions remain unchanged');
      return;
    }
    const next = await transformFrameWithMasks(
      f,
      [plan.width / f.w, 0, 0, plan.height / f.h, 0, 0],
      assets.current,
      plan.width,
      plan.height,
      plan.method,
    );
    next.imageSize = plan.imageSize;
    if (!commit(next)) return;
    setResizing(null);
    setNotice(
      `Image resized to ${plan.width} × ${plan.height}; layers remain editable`,
    );
  };
  const resizeCanvas = async (request: CanvasSizeRequest) => {
    if (quickMasking) {
      setNotice('Exit Quick Mask mode before changing the canvas');
      return;
    }
    const f = current();
    try {
      const plan = planCanvasSize(f.w, f.h, request);
      if (!plan.changed) {
        setCanvasSizing(null);
        setNotice('Canvas already has those dimensions');
        return;
      }
      const next = await transformFrameWithMasks(
        f,
        [1, 0, 0, 1, plan.offsetX, plan.offsetY],
        assets.current,
        plan.width,
        plan.height,
      );
      if (current() !== f) {
        setCanvasSizing(null);
        setNotice(
          'Canvas changed while the operation was running; nothing was overwritten',
        );
        return;
      }
      if (!commit(next)) return;
      setCanvasSizing(null);
      setNotice(
        `Canvas changed to ${plan.width} × ${plan.height}; layer pixels remain unchanged`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Canvas Size values are invalid',
      );
    }
  };
  const trimDocument = async (mode: TrimMode, sides: TrimSides) => {
    if (quickMasking) {
      setNotice('Exit Quick Mask mode before trimming the canvas');
      return;
    }
    const f = current();
    try {
      const rendered = await renderFrame(f, assets.current);
      if (current() !== f)
        throw new Error('Canvas changed while Trim was rendering');
      const bounds = trimBounds(
        rendered
          .getContext('2d')!
          .getImageData(0, 0, rendered.width, rendered.height).data,
        rendered.width,
        rendered.height,
        mode,
        sides,
      );
      if (!bounds) throw new Error('Trim would remove the entire image');
      setTrimming(false);
      if (
        bounds.left === 0 &&
        bounds.top === 0 &&
        bounds.right === f.w &&
        bounds.bottom === f.h
      ) {
        setNotice('Canvas already fits the visible artwork');
        return;
      }
      const next = await transformFrameWithMasks(
        f,
        [1, 0, 0, 1, -bounds.left, -bounds.top],
        assets.current,
        bounds.right - bounds.left,
        bounds.bottom - bounds.top,
      );
      if (current() !== f) {
        setNotice(
          'Canvas changed while Trim was running; nothing was overwritten',
        );
        return;
      }
      if (commit(next))
        setNotice(
          `Canvas trimmed to ${next.w} × ${next.h}; layer pixels retained`,
        );
    } catch (error) {
      setTrimming(false);
      setNotice(
        error instanceof Error ? error.message : 'Trim could not be applied',
      );
    }
  };
  const revealAll = async () => {
    if (quickMasking) {
      setNotice('Exit Quick Mask mode before revealing all artwork');
      return;
    }
    const f = current();
    try {
      const measureSurface = surface(1, 1);
      const measureContext = measureSurface.getContext('2d')!;
      const textBounds = Object.fromEntries(
        f.layers
          .filter(
            (layer): layer is Extract<Layer, { kind: 'text' }> =>
              layer.kind === 'text',
          )
          .map((layer) => [
            layer.id,
            measuredTextLayerBounds(measureContext, layer),
          ]),
      );
      const plan = planRevealAll(f, assets.current, { textBounds });
      if (!plan.changed) {
        setNotice('Canvas already reveals all artwork');
        return;
      }
      const next = await transformFrameWithMasks(
        f,
        plan.matrix,
        assets.current,
        plan.width,
        plan.height,
      );
      if (current() !== f) {
        setNotice(
          'Canvas changed while Reveal All was running; nothing was overwritten',
        );
        return;
      }
      if (commit(next))
        setNotice(`All artwork revealed in a ${next.w} × ${next.h} canvas`);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Reveal All could not be applied',
      );
    }
  };
  const discard = async () => {
    if (
      !confirm(
        'Discard this saved draft? This cannot be undone. Download a project file first if you want to keep a copy.',
      )
    )
      return;
    discarding.current = true;
    saving.current = false;
    ++saveSequence.current;
    try {
      await saveQueue.current;
      await discardDraft(draftId, localVersions.current.get(draftId) || 0);
      location.assign('/');
    } catch {
      discarding.current = false;
      saving.current = true;
      setSaveStatus('Could not discard the draft. Please try again.');
    }
  };
  const reloadNewerDraft = async () => {
    if (saveStatus !== LOCAL_CONFLICT || recovering) return;
    const expectedRevision = localVersions.current.get(draftId) || 0;
    setRecovering(true);
    setSaveStatus('Recovering newer draft…');
    saving.current = true;
    try {
      await saveQueue.current;
      const latest = await readDraft(draftId);
      if (
        !latest ||
        !isNewerDraftRevision(expectedRevision, latest.localRevision)
      )
        throw new Error(
          'No newer draft is available. Keep an export copy of these edits.',
        );
      await install(latest);
      clearClipboard();
      setName(latest.name);
      setCloud(latest.cloud);
      restoreSettings(latest.settings);
      localVersions.current.set(draftId, latest.localRevision);
      quickMaskRef.current = null;
      setQuickMask(null);
      setQuickMasking(false);
      setSaveStatus('Saved on this device');
      setNotice('Newer draft restored from this browser');
    } catch (error) {
      setSaveStatus(
        error instanceof Error
          ? error.message
          : 'Could not recover the newer draft. Export a copy first.',
      );
      saving.current = true;
    } finally {
      setRecovering(false);
    }
  };
  const addLayer = (layer: Layer) => {
    const f = current();
    if (f.layers.length >= 32) {
      setNotice('32-layer limit reached');
      void paint(f);
      return false;
    }
    let next: Frame = {
      ...f,
      layers: [...f.layers, layer],
      active: layer.id,
      selectedLayerIds: [layer.id],
    };
    if (layer.groupId) {
      try {
        next = assignLayerToGroup(next, layer.id, layer.groupId);
      } catch {
        setNotice('Layer folder could not be restored');
        return false;
      }
    }
    if (commit(next)) {
      setNotice('Layer added');
      return true;
    }
    return false;
  };
  const groupActiveLayer = () => {
    const f = current(),
      layers = selectedLayersForFrame(f);
    if (!layers.length) {
      setNotice('Select at least one layer before grouping');
      return;
    }
    if (layers.some((layer) => layer.groupId)) {
      setNotice('Ungroup selected layers before grouping them together');
      return;
    }
    if (layers.some((layer) => layerIsLocked(f, layer))) {
      setNotice('Unlock all selected layers before grouping');
      return;
    }
    if ((f.groups || []).length >= 32) {
      setNotice('32-group limit reached');
      return;
    }
    const group: Group = {
      id: crypto.randomUUID(),
      name: `Group ${(f.groups || []).length + 1}`,
      visible: true,
      locked: false,
      opacity: 1,
      blend: 'source-over',
      collapsed: false,
    };
    let grouped: Frame;
    try {
      grouped = groupLayerMembers(
        { ...f, groups: [...(f.groups || []), group] },
        layers.map((layer) => layer.id),
        group.id,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Layers could not be grouped');
      return;
    }
    if (commit(grouped))
      setNotice(
        layers.length === 1
          ? 'Layer added to a new group'
          : `${layers.length} layers added to a new group`,
      );
  };
  const createClippingMask = () => {
    const f = current(),
      source = f.layers.find((item) => item.id === f.active),
      base = source ? clippingCandidateBase(f, source) : undefined;
    if (!source || !isClippingSourceLayer(source) || !base) {
      setNotice('Select a raster or smart-object layer directly above its clipping base');
      return false;
    }
    if (layerIsLocked(f, source) || layerIsLocked(f, base) || !source.visible || !base.visible) {
      setNotice('Show and unlock the source and clipping base first');
      return false;
    }
    if (
      commit({
        ...f,
        layers: f.layers.map((layer) =>
          layer.id === source.id ? { ...layer, clippingTo: base.id } : layer,
        ),
      })
    ) {
      setNotice(`Clipping mask created from ${base.name || 'base layer'}`);
      return true;
    }
    return false;
  };
  const releaseClippingMask = () => {
    const f = current(),
      source = f.layers.find((item) => item.id === f.active);
    if (!source?.clippingTo) {
      setNotice('The active layer has no clipping mask');
      return false;
    }
    if (layerIsLocked(f, source)) {
      setNotice('Unlock the clipped layer before releasing its mask');
      return false;
    }
    const { clippingTo: _clippingTo, ...withoutClipping } = source;
    if (
      commit({
        ...f,
        layers: f.layers.map((layer) =>
          layer.id === source.id ? (withoutClipping as Layer) : layer,
        ),
      })
    ) {
      setNotice('Clipping mask released');
      return true;
    }
    return false;
  };
  const ungroupActiveLayer = () => {
    const f = current(),
      layer = f.layers.find((item) => item.id === f.active),
      groupId = layer?.groupId;
    if (!layer || !groupId) {
      setNotice('Select a grouped layer first');
      return;
    }
    const group = f.groups?.find((item) => item.id === groupId);
    if (group?.locked) {
      setNotice('Unlock this group before ungrouping');
      return;
    }
    const layers = f.layers.map((item) => {
      if (item.id !== layer.id) return item;
      const { groupId: _groupId, ...withoutGroup } = item;
      return withoutGroup as Layer;
    });
    const stillUsed = layers.some((item) => item.groupId === groupId);
    if (
      commit({
        ...f,
        groups: stillUsed
          ? f.groups
          : (f.groups || []).filter((item) => item.id !== groupId),
        layers,
      })
    )
      setNotice(stillUsed ? 'Layer removed from group' : 'Empty group removed');
  };
  const alignActiveLayer = (mode: AlignmentMode) => {
    const f = current(),
      activeLayer = f.layers.find((item) => item.id === f.active),
      selected = selectedLayersForFrame(f),
      targets = selected.length ? selected : activeLayer ? [activeLayer] : [];
    if (!targets.length) return;
    if (targets.some((layer) => layerIsLocked(f, layer))) {
      setNotice('Unlock all selected layers before aligning them');
      return;
    }
    try {
      const bounds = combineSelectionBounds(
          targets.map((layer) => layerBounds(layer, assets.current)),
        ),
        layer = targets[0];
      if (!bounds || !layer) throw new Error('No selected layer bounds');
      const delta = alignmentDelta(bounds, f.w, f.h, mode);
      if (Math.abs(delta.x) < 0.000001 && Math.abs(delta.y) < 0.000001) {
        setNotice('Selected layers are already aligned');
        return;
      }
      if (
        commit({
          ...f,
          layers: f.layers.map((item) =>
            targets.some((target) => target.id === item.id)
              ? { ...item, matrix: translateMatrix(item.matrix, delta) }
              : item,
          ),
        })
      )
        setNotice(
          targets.length === 1
            ? 'Layer aligned to canvas'
            : `${targets.length} layers aligned to canvas`,
        );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Could not align layer',
      );
    }
  };
  const distributeGroupLayers = (axis: DistributionAxis) => {
    const f = current(),
      activeLayer = f.layers.find((item) => item.id === f.active),
      groupId = activeLayer?.groupId,
      group = groupId
        ? f.groups?.find((item) => item.id === groupId)
        : undefined;
    if (!activeLayer || !group) {
      setNotice('Select a grouped layer before distributing');
      return;
    }
    if (group.locked) {
      setNotice('Unlock this group before distributing');
      return;
    }
    if (!group.visible) {
      setNotice('Show this group before distributing');
      return;
    }
    const eligible = f.layers.filter(
      (item) => item.groupId === group.id && item.visible && !item.locked,
    );
    if (eligible.length < 3) {
      setNotice('A group needs three visible unlocked layers to distribute');
      return;
    }
    try {
      const bounds = eligible.map((item) => ({
          id: item.id,
          ...layerBounds(item, assets.current),
        })),
        deltas = distributionDeltas(bounds, axis),
        changed = eligible.some((item) => {
          const delta = deltas[item.id];
          return Math.abs(delta.x) > 0.000001 || Math.abs(delta.y) > 0.000001;
        });
      if (!changed) {
        setNotice('Group layers are already evenly distributed');
        return;
      }
      const layers = f.layers.map((item) => {
        const delta = deltas[item.id];
        if (!delta) return item;
        return { ...item, matrix: translateMatrix(item.matrix, delta) };
      });
      if (commit({ ...f, layers }))
        setNotice(
          axis === 'horizontal'
            ? 'Group layers distributed horizontally'
            : 'Group layers distributed vertically',
        );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not distribute group layers',
      );
    }
  };
  const addSolidFillLayer = (fillColor: string) => {
    const f = current();
    setFillLayerDialog(false);
    if (addLayer({
      ...commonLayer(`Fill ${fillColor}`),
      kind: 'raster',
      asset: addAsset(assets.current, surface(f.w, f.h)),
      fillColor,
    })) setNotice(`Solid fill layer added (${fillColor})`);
  };
  const addAdjustmentLayer = () => {
    const f = current();
    if (
      addLayer({
        ...commonLayer(`Adjustment ${f.layers.length}`),
        kind: 'adjustment',
      })
    )
      setNotice('Adjustment layer added; edit its nondestructive controls below');
  };
  const addPaint = () => {
    const f = current();
    addLayer({
      ...commonLayer('Paint ' + f.layers.length),
      kind: 'raster',
      asset: addAsset(assets.current, surface(f.w, f.h)),
    });
    setTool('brush');
  };
  const duplicate = () => {
    const f = current(),
      layers = selectedLayersForFrame(f);
    if (!layers.length) {
      setNotice('Select at least one layer before duplicating');
      return;
    }
    if (layers.some((layer) => layerIsLocked(f, layer))) {
      setNotice('Unlock all selected layers before duplicating');
      return;
    }
    if (f.layers.length + layers.length > 32) {
      setNotice('32-layer limit reached');
      return;
    }
    const copies = layers.map((layer) => ({
      ...structuredClone(layer),
      id: crypto.randomUUID(),
      name: (layer.name + ' copy').slice(0, 160),
      locked: false,
    }));
    let next: Frame = {
      ...f,
      layers: [...f.layers, ...copies],
      active: copies.at(-1)!.id,
      selectedLayerIds: copies.map((layer) => layer.id),
    };
    // Copies of grouped layers inherit their folder, so normalize every
    // affected folder after appending the copies instead of leaving a second
    // block at the end of the flat stack.
    for (const groupId of new Set(
      copies.flatMap((layer) => (layer.groupId ? [layer.groupId] : [])),
    )) {
      const memberIds = next.layers
        .filter((layer) => layer.groupId === groupId)
        .map((layer) => layer.id);
      next = {
        ...next,
        layers: groupLayerMembers(next, memberIds, groupId).layers,
      };
    }
    if (
      commit(next)
    )
      setNotice(
        copies.length === 1
          ? 'Layer duplicated'
          : `${copies.length} layers duplicated`,
      );
  };
  const copyLayer = () => {
    const f = current(),
      layer = f.layers.find((item) => item.id === f.active);
    if (!layer) {
      setNotice('Select a layer before copying');
      return false;
    }
    clipboardLayer.current = structuredClone(layer);
    setHasClipboard(true);
    setNotice('Active layer copied');
    return true;
  };
  const clearClipboard = () => {
    clipboardLayer.current = null;
    setHasClipboard(false);
  };
  const pasteLayer = () => {
    const copied = clipboardLayer.current;
    if (!copied) {
      setNotice('Copy a layer before pasting');
      return;
    }
    const f = current();
    if (
      copied.kind === 'raster' &&
      (!assets.current[copied.asset] ||
        (copied.mask && !assets.current[copied.mask]))
    ) {
      clearClipboard();
      setNotice('The copied layer is no longer available in this document');
      return;
    }
    const copiedGroup = copied.groupId
      ? f.groups?.find((group) => group.id === copied.groupId)
      : undefined;
    const pasted = {
      ...structuredClone(copied),
      id: crypto.randomUUID(),
      name: `${copied.name} copy`.slice(0, 160),
      locked: false,
      ...(copiedGroup && !copiedGroup.locked
        ? { groupId: copiedGroup.id }
        : { groupId: undefined }),
    } as Layer;
    addLayer(pasted);
    setNotice('Layer pasted');
  };
  const cutLayer = () => {
    const f = current(),
      layer = f.layers.find((item) => item.id === f.active);
    if (!layer) {
      setNotice('Select a layer before cutting');
      return false;
    }
    if (f.layers.length === 1) {
      setNotice('The last layer cannot be cut');
      return false;
    }
    if (layerIsLocked(f, layer)) {
      setNotice('Unlock this layer before cutting');
      return false;
    }
    if (!copyLayer()) return false;
    if (!remove()) return false;
    setNotice('Layer cut');
    return true;
  };
  const hideActiveLayer = () => {
    const layer = current().layers.find((item) => item.id === current().active);
    if (layer) editLayer({ visible: !layer.visible });
  };
  const fillActiveLayer = async () => {
    const f = current(),
      layer = f.layers.find((item) => item.id === f.active);
    if (
      !layer ||
      layer.kind !== 'raster' ||
      layerIsLocked(f, layer) ||
      !layer.visible
    ) {
      setNotice('Select a visible, unlocked raster layer before filling');
      return;
    }
    try {
      const image = await decodeAsset(assets.current[layer.asset]),
        output = surface(image.naturalWidth, image.naturalHeight),
        context = output.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const fill = surface(output.width, output.height),
        fillContext = fill.getContext('2d')!;
      fillContext.fillStyle = color;
      fillContext.fillRect(0, 0, fill.width, fill.height);
      if (f.selection) {
        const mask = await localSelectionMask(
          f.selection,
          f.w,
          f.h,
          layer,
          output.width,
          output.height,
        );
        fillContext.globalCompositeOperation = 'destination-in';
        fillContext.drawImage(mask, 0, 0);
      }
      context.drawImage(fill, 0, 0);
      const asset = addAsset(assets.current, output);
      if (
        commit({
          ...f,
          layers: f.layers.map((item) =>
            item.id === layer.id ? { ...item, asset } : item,
          ),
        })
      )
        setNotice(
          f.selection
            ? 'Selection filled; undo restores the original pixels'
            : 'Layer filled; undo restores the original pixels',
        );
    } catch {
      setNotice('Could not fill this layer');
    }
  };
  const clearActiveLayer = async () => {
    const f = current(),
      layer = f.layers.find((item) => item.id === f.active);
    if (
      !layer ||
      layer.kind !== 'raster' ||
      layerIsLocked(f, layer) ||
      !layer.visible
    ) {
      setNotice('Select a visible, unlocked raster layer before clearing');
      return;
    }
    try {
      const image = await decodeAsset(assets.current[layer.asset]),
        output = surface(image.naturalWidth, image.naturalHeight),
        context = output.getContext('2d')!;
      if (f.selection) {
        context.drawImage(image, 0, 0);
        const mask = await localSelectionMask(
          f.selection,
          f.w,
          f.h,
          layer,
          output.width,
          output.height,
        );
        context.globalCompositeOperation = 'destination-out';
        context.drawImage(mask, 0, 0);
      }
      const asset = addAsset(assets.current, output);
      if (
        commit({
          ...f,
          layers: f.layers.map((item) =>
            item.id === layer.id ? { ...item, asset } : item,
          ),
        })
      )
        setNotice(
          f.selection
            ? 'Selection cleared; undo restores the original pixels'
            : 'Layer cleared; undo restores the original pixels',
        );
    } catch {
      setNotice('Could not clear this layer');
    }
  };
  const mergeVisible = async () => {
    const beforeFrame = current();
    const beforeIndex = index.current;
    const beforeRevision = revisionRef.current;
    const plan = planMergeVisible(beforeFrame);
    if (!plan.ok) {
      setNotice(mergeVisibleReason(plan.reason));
      return;
    }
    try {
      const image = await renderFrame(
        {
          ...beforeFrame,
          layers: beforeFrame.layers.map((layer) => ({
            ...layer,
            visible: plan.visibleLayerIds.includes(layer.id),
          })),
        },
        assets.current,
      );
      // Both checks matter: the pointer catches same-tick history edits, while
      // revision catches selection/import/travel publishes that own a new
      // document revision before the render resolves.
      if (
        index.current !== beforeIndex ||
        current() !== beforeFrame ||
        revisionRef.current !== beforeRevision
      )
        return;
      const merged = rasterFrame(image, assets.current, 'Merged visible');
      const next = applyMergeVisible(beforeFrame, plan, merged.layers[0]);
      if (commit(next))
        setNotice('Visible layers merged; undo restores the individual layers');
    } catch {
      setNotice('Could not merge visible layers');
    }
  };
  const mergeLayers = async () => {
    const f = current();
    const selectionIds = selectedIdsForFrame(f);
    const selectedPlan =
      selectionIds.length >= 2 ? planSelectedLayerMerge(f) : undefined;
    if (selectedPlan && !selectedPlan.ok) {
      setNotice(selectedLayerMergeReason(selectedPlan.reason));
      return;
    }
    const pairPlan = selectedPlan ? undefined : planLayerMerge(f);
    if (!selectedPlan && !pairPlan?.ok) {
      setNotice(layerMergeReason(pairPlan!.reason));
      return;
    }
    const pairSuccess = pairPlan?.ok ? pairPlan : undefined;
    const beforeIndex = index.current;
    const beforeFrame = f;
    const selectedIndices = selectedPlan?.ok
      ? selectedPlan.selectedIndices
      : [pairSuccess!.lowerIndex, pairSuccess!.activeIndex];
    const selectedLayers = selectedIndices.map((layerIndex) => f.layers[layerIndex]);
    const active = selectedLayers[selectedLayers.length - 1];
    try {
      // Render only the selected root-level range in stack order. Grouped
      // selections are rejected by the planner because they need isolated
      // folder merge semantics; ordinary folder rendering remains unchanged.
      const image = await renderFrame(
        {
          ...f,
          layers: selectedLayers,
          groups: [],
          active: active.id,
        },
        assets.current,
      );
      if (index.current !== beforeIndex || current() !== beforeFrame) return;
      const mergedFrame = rasterFrame(
        image,
        assets.current,
        selectedLayers
          .map((layer) => layer.name || 'Layer')
          .join(' + '),
      );
      const merged = {
        ...mergedFrame.layers[0],
        visible: true,
        locked: false,
      };
      const next = selectedPlan?.ok
        ? applySelectedLayerMerge(f, selectedPlan, merged)
        : (() => {
            const layers = f.layers.slice();
            layers.splice(pairSuccess!.lowerIndex, 2, merged);
            return {
              ...f,
              layers,
              ...(f.artboards
                ? {
                    artboards: sanitizeArtboardLayerMembership(
                      f.artboards,
                      layers.map((layer) => layer.id),
                    ),
                  }
                : {}),
              active: merged.id,
              selectedLayerIds: [merged.id],
            };
          })();
      if (
        commit(next)
      )
        setNotice(
          selectedPlan?.ok
            ? `${selectedLayers.length} layers merged; undo restores the individual layers`
            : 'Layers merged; undo restores the individual layers',
        );
    } catch {
      setNotice('Could not merge the selected layers');
    }
  };
  const flattenImage = async () => {
    try {
      const f = current(),
        image = await renderFrame(f, assets.current),
        flattened = rasterFrame(image, assets.current, 'Flattened image');
      if (
        commit({
          ...flattened,
          ...(f.artboards
            ? {
                artboards: sanitizeArtboardLayerMembership(
                  f.artboards,
                  flattened.layers.map((layer) => layer.id),
                ),
              }
            : {}),
          selectedLayerIds: [flattened.active],
        })
      )
        setNotice('Image flattened; undo restores editable layers');
    } catch {
      setNotice('Could not flatten the image');
    }
  };
  const remove = () => {
    const f = current(),
      selected = selectedLayersForFrame(f),
      ids = new Set(selected.map((layer) => layer.id));
    if (!selected.length) {
      setNotice('Select at least one layer before deleting');
      return false;
    }
    if (selected.some((layer) => layerIsLocked(f, layer))) {
      setNotice('Unlock all selected layers before deleting');
      return false;
    }
    if (selected.length >= f.layers.length) {
      setNotice('Keep at least one layer in the document');
      return false;
    }
    const layers = f.layers.filter((layer) => !ids.has(layer.id)),
      active = layers.find((layer) => layer.id === f.active)?.id || layers.at(-1)!.id,
      selectedLayerIds = selectedIdsForFrame(f).filter((id) => !ids.has(id));
    const usedGroups = new Set(
      layers.flatMap((layer) => (layer.groupId ? [layer.groupId] : [])),
    );
    if (
      !commit({
        ...f,
        layers,
        groups: (f.groups || []).filter((group) => usedGroups.has(group.id)),
        ...(f.artboards
          ? {
              artboards: sanitizeArtboardLayerMembership(
                f.artboards,
                layers.map((layer) => layer.id),
              ),
            }
          : {}),
        active,
        selectedLayerIds,
      })
    )
      return false;
    setNotice(
      selected.length === 1
        ? 'Layer deleted. Undo restores it.'
        : `${selected.length} layers deleted. Undo restores them.`,
    );
    return true;
  };
  const reorder = (direction: number) => {
    const f = current(),
      layers = f.layers.slice(),
      from = layers.findIndex((l) => l.id === f.active),
      to = from + direction;
    if (to < 0 || to >= layers.length || layerIsLocked(f, layers[from])) return;
    [layers[from], layers[to]] = [layers[to], layers[from]];
    commit({ ...f, layers });
  };
  const arrangeLayers = (mode: LayerArrangeMode) => {
    const f = current();
    const plan = planLayerArrange(f, mode);
    if (!plan.ok) {
      setNotice(layerArrangeReason(plan.reason));
      return false;
    }
    const next = applyLayerArrange(f, plan);
    if (next === f) return false;
    if (!commit(next)) return false;
    const labels: Record<LayerArrangeMode, string> = {
      front: 'Bring to Front',
      forward: 'Bring Forward',
      backward: 'Send Backward',
      back: 'Send to Back',
    };
    setNotice(`${labels[mode]} applied; undo restores the previous order`);
    return true;
  };
  const rasterize = async () => {
    const f = current(),
      layer = f.layers.find((l) => l.id === f.active)!;
    if (layerIsLocked(f, layer)) return;
    try {
      const image = await renderFrame(
        {
          ...f,
          layers: [
            {
              ...layer,
              visible: true,
              opacity: 1,
              blend: 'source-over',
              adjustments: { ...neutral },
            },
          ],
        },
        assets.current,
      );
      if (current() !== f) return;
      const rasterLayer: Layer = {
        ...commonLayer(layer.name),
        id: layer.id,
        kind: 'raster',
        asset: addAsset(assets.current, image),
        opacity: layer.opacity,
        blend: layer.blend,
        visible: layer.visible,
        adjustments: layer.adjustments,
        groupId: layer.groupId,
      };
      const changed = commit({
        ...f,
        layers: f.layers.map((item) => (item.id === layer.id ? rasterLayer : item)),
      });
      if (changed)
        setNotice('Layer rasterized. Undo restores editable content.');
    } catch {
      setNotice('Could not rasterize layer');
    }
  };
  const load = async (selected?: File, asLayer = false) => {
    if (quickMasking) {
      setNotice('Exit Quick Mask mode before opening an image');
      return;
    }
    const importInfo = selected
      ? describeImportFormat(selected.name, selected.type)
      : null;
    if (!selected || !importInfo?.tryDecode) {
      setNotice(
        importInfo?.disclosure || 'Choose a browser-readable image file',
      );
      if (file.current) file.current.value = '';
      if (layerFile.current) layerFile.current.value = '';
      return;
    }
    const original = current();
    try {
      if (selected.size > 64 * 1024 * 1024)
        throw new Error('Image file exceeds 64 MB');
      const url = URL.createObjectURL(selected);
      const image = new Image();
      try {
        image.src = url;
        await image.decode();
      } finally {
        URL.revokeObjectURL(url);
      }
      if (
        image.width * image.height > 16000000 ||
        image.width > 16000 ||
        image.height > 16000
      )
        throw new Error(
          'Image exceeds 16 megapixels. Current draft unchanged.',
        );
      const c = surface(image.width, image.height);
      c.getContext('2d')!.drawImage(image, 0, 0);
      if (current() !== original)
        throw new Error('Document changed during import. Please try again.');
      if (asLayer) {
        const added = addLayer({
          ...commonLayer(selected.name.slice(0, 160)),
          kind: 'raster',
          asset: addAsset(assets.current, c),
        });
        if (!added) return;
      } else if (
        !startRaster(c, selected.name.replace(/\.[^/.]+$/, '').slice(0, 160))
      )
        return;
      setNotice(
        importInfo.format === 'heic'
          ? `HEIC/HEIF imported as a flattened raster${asLayer ? ' layer' : ''}; source metadata omitted`
          : asLayer
            ? 'Image layer added'
            : 'Photo opened as a flattened raster; source metadata omitted',
      );
    } catch (error) {
      setNotice(
        importInfo.format === 'heic'
          ? importFailureMessage(importInfo)
          : error instanceof Error
            ? error.message
          : 'This image could not be opened',
      );
    } finally {
      if (file.current) file.current.value = '';
      if (layerFile.current) layerFile.current.value = '';
    }
  };
  const importSmartObject = async (selected?: File, replace = false) => {
    if (quickMasking) {
      setNotice('Exit Quick Mask mode before importing a smart object');
      return;
    }
    const importInfo = selected
      ? describeImportFormat(selected.name, selected.type)
      : null;
    if (!selected || !importInfo?.tryDecode) {
      setNotice(importInfo?.disclosure || 'Choose a browser-readable image file');
      if (smartObjectFile.current) smartObjectFile.current.value = '';
      return;
    }
    const original = current();
    try {
      if (selected.size > 64 * 1024 * 1024) throw new Error('Image file exceeds 64 MB');
      const url = URL.createObjectURL(selected),
        image = new Image();
      try {
        image.src = url;
        await image.decode();
      } finally {
        URL.revokeObjectURL(url);
      }
      if (
        image.width * image.height > 16000000 ||
        image.width > 16000 ||
        image.height > 16000
      )
        throw new Error('Image exceeds 16 megapixels. Current draft unchanged.');
      const source = surface(image.width, image.height),
        sourceContext = source.getContext('2d')!;
      sourceContext.drawImage(image, 0, 0);
      if (current() !== original)
        throw new Error('Document changed during import. Please try again.');
      const asset = addAsset(assets.current, source),
        sourceName = selected.name.slice(0, 160);
      if (replace) {
        const target = original.layers.find((layer) => layer.id === original.active);
        if (!target || target.kind !== 'smart-object') {
          setNotice('Select a smart object before replacing its contents');
          return;
        }
        if (
          commit({
            ...original,
            layers: original.layers.map((layer) =>
              layer.id === target.id
                ? { ...layer, asset, sourceName }
                : layer,
            ),
          })
        )
          setNotice('Smart object contents replaced; transform and edits preserved');
      } else if (
        addLayer({
          ...commonLayer(sourceName),
          kind: 'smart-object',
          asset,
          sourceName,
        })
      ) {
        setNotice('Embedded smart object added');
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'This image could not be embedded',
      );
    } finally {
      if (smartObjectFile.current) smartObjectFile.current.value = '';
    }
  };
  const chooseSmartObjectFile = (replace: boolean) => {
    smartObjectAction.current = replace ? 'replace' : 'new';
    smartObjectFile.current?.click();
  };
  const point = (
    e: Pick<React.PointerEvent<HTMLCanvasElement>, 'clientX' | 'clientY'>,
  ) => {
    const c = canvas.current!,
      rect = c.getBoundingClientRect(),
      computed = window.getComputedStyle(c),
      layoutWidth = Number.parseFloat(computed.width),
      layoutHeight = Number.parseFloat(computed.height);
    return canvasPointFromClient(
      e.clientX,
      e.clientY,
      rect,
      Number.isFinite(layoutWidth) && layoutWidth > 0
        ? layoutWidth
        : c.offsetWidth || rect.width,
      Number.isFinite(layoutHeight) && layoutHeight > 0
        ? layoutHeight
        : c.offsetHeight || rect.height,
      c.width,
      c.height,
      viewRotation,
    );
  };
  const pressure = (e: React.PointerEvent<HTMLCanvasElement>) =>
    (e.pointerType === 'pen' || e.pointerType === 'touch') &&
    e.pressure > 0 &&
    e.pressure <= 1
      ? e.pressure
      : 1;
  /** Apply a canvas-space alpha stroke to a detached mask preview. */
  const refineMaskCanvas = (
    target: HTMLCanvasElement,
    stroke: MaskRefinementStroke,
  ) => {
    const context = target.getContext('2d');
    if (!context) throw new Error('Mask refinement canvas is unavailable');
    const image = context.getImageData(0, 0, target.width, target.height),
      result = applyMaskRefinementPixels(
        image.data,
        target.width,
        target.height,
        stroke,
      );
    image.data.set(result.pixels);
    context.putImageData(image, 0, 0);
    return result.changed;
  };
  const drawPathOverlay = (
    path: PathModel,
    matrix: Matrix = [1, 0, 0, 1, 0, 0],
    selectedIndex: number | null = null,
    dashed = false,
  ) => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    const contours = pathContours(path);
    if (!contours.length) return;
    const map = (point: { x: number; y: number }) => ({
      x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
      y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
    });
    context.save();
    context.strokeStyle = '#38bdf8';
    context.fillStyle = 'rgba(56,189,248,.14)';
    context.lineWidth = 1.5;
    context.setLineDash(dashed ? [7, 5] : []);
    context.beginPath();
    for (const contour of contours) {
      if (!contour.nodes.length) continue;
      const transformed = contour.nodes.map(map);
      context.moveTo(transformed[0].x, transformed[0].y);
      for (const [index, node] of transformed.slice(1).entries()) {
        const sourcePrevious = contour.nodes[index], sourceNode = contour.nodes[index + 1];
        if (sourcePrevious.outHandle || sourceNode.inHandle) {
          const out = map(sourcePrevious.outHandle ?? sourcePrevious);
          const incoming = map(sourceNode.inHandle ?? sourceNode);
          context.bezierCurveTo(out.x, out.y, incoming.x, incoming.y, node.x, node.y);
        } else context.lineTo(node.x, node.y);
      }
      if (contour.closed && contour.nodes.length > 1) {
        const sourcePrevious = contour.nodes[contour.nodes.length - 1], sourceNode = contour.nodes[0];
        if (sourcePrevious.outHandle || sourceNode.inHandle) {
          const out = map(sourcePrevious.outHandle ?? sourcePrevious);
          const incoming = map(sourceNode.inHandle ?? sourceNode);
          context.bezierCurveTo(out.x, out.y, incoming.x, incoming.y, transformed[0].x, transformed[0].y);
        }
        context.closePath();
      }
    }
    context.stroke();
    if (path.fill) context.fill(path.fillRule === 'evenodd' ? 'evenodd' : 'nonzero');
    for (const [contourIndex, contour] of contours.entries()) {
      if (!contour.nodes.length) continue;
      const transformed = contour.nodes.map(map);
      // Expose editable Bezier controls while a path is selected so Direct
      // Selection can discover and drag them without hiding the curve shape.
      context.lineWidth = 1;
      for (const node of contour.nodes) {
        const anchor = map(node);
        for (const handle of [node.inHandle, node.outHandle]) {
          if (!handle) continue;
          const control = map(handle);
          context.strokeStyle = 'rgba(148,163,184,.8)';
          context.beginPath();
          context.moveTo(anchor.x, anchor.y);
          context.lineTo(control.x, control.y);
          context.stroke();
          context.fillStyle = '#38bdf8';
          context.beginPath();
          context.arc(control.x, control.y, 4, 0, Math.PI * 2);
          context.fill();
        }
      }
      for (const [index, node] of transformed.entries()) {
        context.beginPath();
        context.fillStyle = contourIndex === 0 && index === selectedIndex ? '#fbbf24' : '#ffffff';
        context.strokeStyle = '#0f172a';
        context.arc(node.x, node.y, contourIndex === 0 && index === selectedIndex ? 6 : 4, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      }
    }
    context.setLineDash([]);
    context.restore();
  };
  const previewPenPath = (g: Gesture) => {
    const points = g.points || [];
    if (!points.length) return;
    const preview: PathModel = {
      nodes: points,
      closed: false,
      fill: false,
      stroke: true,
      strokeWidth: Math.max(1, size / 3),
      fillColor: color,
      strokeColor: color,
    };
    void paint(g.frame).then(() => {
      if (gesture.current === g)
        drawPathOverlay(preview, [1, 0, 0, 1, 0, 0], null, true);
    });
  };
  const previewFreeformPath = (g: Gesture) => {
    const points = g.points || [];
    if (points.length < 2) return previewPenPath(g);
    const preview = buildFreeformPath(points, {
      strokeWidth: Math.max(1, size / 3),
      fillColor: color,
      strokeColor: color,
    });
    void paint(g.frame).then(() => {
      if (gesture.current === g)
        drawPathOverlay(preview, [1, 0, 0, 1, 0, 0], null, true);
    });
  };
  const previewCurvaturePath = (g: Gesture) => {
    const points = g.points || [];
    if (points.length < 2) return previewPenPath(g);
    const preview = buildCurvaturePath(points, {
      strokeWidth: Math.max(1, size / 3),
      fillColor: color,
      strokeColor: color,
    });
    void paint(g.frame).then(() => {
      if (gesture.current === g)
        drawPathOverlay(preview, [1, 0, 0, 1, 0, 0], null, true);
    });
  };
  const finishFreeformPath = (g: Gesture) => {
    if (!g.points || g.points.length < 2) {
      setNotice('Freeform Pen needs at least two points');
      return;
    }
    try {
      const path = buildFreeformPath(g.points, {
        strokeWidth: Math.max(1, size / 3),
        fillColor: color,
        strokeColor: color,
      });
      const added = addLayer({
        ...commonLayer('Freeform Path ' + g.frame.layers.length),
        kind: 'path',
        path,
      });
      if (added) setNotice('Editable freeform path layer added');
    } catch {
      setNotice('Could not create a freeform path');
    }
  };
  const finishCurvaturePath = (g: Gesture, closed = false) => {
    if (!g.points || g.points.length < 2) {
      void paint(g.frame);
      setNotice('Curvature Pen needs at least two points');
      return;
    }
    try {
      const path = buildCurvaturePath(
        g.points,
        {
          strokeWidth: Math.max(1, size / 3),
          fillColor: color,
          strokeColor: color,
        },
        closed,
      );
      const added = addLayer({
        ...commonLayer('Curvature Path ' + g.frame.layers.length),
        kind: 'path',
        path,
      });
      if (added) setNotice('Editable curvature path layer added');
    } catch {
      void paint(g.frame);
      setNotice('Could not create a curvature path');
    }
  };
  const pointerDown = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (quickMasking && quickMaskRef.current) {
      if (gesture.current || quickMaskGesture.current || doc.rendering) return;
      paintSpan.current?.cancel();
      paintSpan.current = beginPerformanceSpan('paint');
      const p = point(e);
      canvas.current?.setPointerCapture(e.pointerId);
      quickMaskGesture.current = {
        frame: current(),
        last: p,
        selected: quickMaskReveal || e.altKey,
        before: quickMaskRef.current.selected.slice(),
      };
      updateQuickMaskAt(
        quickMaskRef.current,
        p.x,
        p.y,
        quickMaskReveal || e.altKey,
      );
      return;
    }
    // Polygonal lasso is a click-to-place workflow. Keep its gesture alive
    // between pointer events so touch, pen and mouse can place vertices one
    // at a time; clicking near the first point closes the path.
    if (gesture.current?.tool === 'polygonal-lasso') {
      const g = gesture.current,
        p = point(e),
        points = g.points || (g.points = []),
        first = points[0];
      if (
        first &&
        points.length >= 3 &&
        Math.hypot(p.x - first.x, p.y - first.y) <= 14
      ) {
        gesture.current = null;
        finishPolygonalLasso(g);
      } else {
        const bounded = {
          x: Math.max(0, Math.min(g.frame.w, p.x)),
          y: Math.max(0, Math.min(g.frame.h, p.y)),
        };
        if (g.tool === 'curvature-pen') {
          g.points = appendCurvaturePoint(points, bounded);
        } else {
          points.push(bounded);
        }
        g.last = p;
        g.moved = (g.points || points).length > 1;
        void paint(g.frame).then(() => {
          if (gesture.current !== g) return;
          const context = canvas.current?.getContext('2d');
          if (!context || !g.points?.length) return;
          context.save();
          context.strokeStyle = '#fff';
          context.lineWidth = 2;
          context.setLineDash([8, 5]);
          context.beginPath();
          context.moveTo(g.points[0].x, g.points[0].y);
          for (const point of g.points.slice(1))
            context.lineTo(point.x, point.y);
          context.stroke();
          context.restore();
        });
      }
      return;
    }
    // Pen and Curvature Pen are click-to-place workflows. Keep the gesture
    // alive between clicks so mouse, pen and touch can place each anchor.
    if (
      gesture.current?.tool === 'pen' ||
      gesture.current?.tool === 'curvature-pen'
    ) {
      const g = gesture.current,
        p = point(e),
        points = g.points || (g.points = []),
        first = points[0];
      if (
        first &&
        points.length >= 3 &&
        Math.hypot(p.x - first.x, p.y - first.y) <= 14
      ) {
        const nodes = points.map((node) => ({
          x: node.x,
          y: node.y,
          ...(node.inHandle ? { inHandle: { ...node.inHandle } } : {}),
          ...(node.outHandle ? { outHandle: { ...node.outHandle } } : {}),
        }));
        gesture.current = null;
        if (g.tool === 'curvature-pen') {
          g.points = nodes;
          finishCurvaturePath(g, true);
        } else {
          const path: PathModel = {
            nodes,
            closed: true,
            fill: true,
            stroke: true,
            strokeWidth: Math.max(1, size / 3),
            fillColor: color,
            strokeColor: color,
          };
          if (validatePath(path)) {
            const added = addLayer({
              ...commonLayer('Path ' + g.frame.layers.length),
              kind: 'path',
              path,
            });
            if (added) setNotice('Editable path layer added');
          }
        }
      } else {
        points.push({
          x: Math.max(0, Math.min(g.frame.w, p.x)),
          y: Math.max(0, Math.min(g.frame.h, p.y)),
        });
        g.last = p;
        g.moved = points.length > 1;
        if (g.tool === 'curvature-pen') previewCurvaturePath(g);
        else previewPenPath(g);
      }
      return;
    }
    if (tool === 'freeform-pen') {
      if (doc.rendering || !frame) return;
      const f = current(), p = point(e);
      canvas.current!.setPointerCapture(e.pointerId);
      const g: Gesture = {
        tool,
        start: p,
        last: p,
        frame: f,
        points: [{ x: Math.max(0, Math.min(f.w, p.x)), y: Math.max(0, Math.min(f.h, p.y)) }],
        moved: false,
      };
      gesture.current = g;
      setNotice('Freeform Pen: draw a path, release to finish');
      return;
    }
    // Photoshop's Pen tool edits an existing path when the pointer is over
    // an anchor or stroke.  Alt/Option removes an anchor, Shift toggles a
    // corner/smooth point, and an unmodified stroke click inserts an anchor;
    // clicking empty canvas still starts a new path as before.
    if (tool === 'pen') {
      const f = current(), activeLayer = f.layers.find((item) => item.id === f.active), p = point(e);
      if (activeLayer?.kind !== 'path') {
        // Empty canvas or a non-path active layer starts a new path below.
      } else if (layerIsLocked(f, activeLayer) || !activeLayer.visible) {
        setNotice('Select a visible, unlocked path layer before editing anchors');
        return;
      } else {
        const localPath = inversePoint(activeLayer.matrix, p);
        if (!localPath) {
          setNotice('This path transform cannot be edited');
          return;
        }
        const scale = Math.max(
          Math.hypot(activeLayer.matrix[0], activeLayer.matrix[1]),
          Math.hypot(activeLayer.matrix[2], activeLayer.matrix[3]),
          0.0001,
        );
        const path = validatePath(activeLayer.path);
        const nodeIndex = hitTestPathNode(path, localPath, 12 / scale);
        if (nodeIndex !== null && (e.altKey || e.shiftKey)) {
          const next = e.altKey
            ? removePathNode(path, nodeIndex)
            : setPathNodeSmooth(
                path,
                nodeIndex,
                !(path.nodes[nodeIndex].inHandle || path.nodes[nodeIndex].outHandle),
              );
          if (commit({ ...f, layers: f.layers.map((item) => item.id === activeLayer.id ? { ...item, path: next } : item) }))
            setNotice(e.altKey ? 'Path anchor deleted' : 'Path anchor converted');
          return;
        }
        if (!e.altKey && !e.shiftKey) {
          const hit = nearestPathSegment(path, localPath, 12 / scale);
          if (hit) {
            const next = insertPathNode(path, hit.segmentIndex, hit.t);
            if (commit({ ...f, layers: f.layers.map((item) => item.id === activeLayer.id ? { ...item, path: next } : item) }))
              setNotice('Path anchor added');
            return;
          }
        }
      }
    }
    if (tool === 'pen' || tool === 'curvature-pen') {
      if (doc.rendering || !frame) return;
      const f = current(),
        p = point(e);
      canvas.current!.setPointerCapture(e.pointerId);
      const g: Gesture = {
        tool,
        start: p,
        last: p,
        frame: f,
        points: [
          {
            x: Math.max(0, Math.min(f.w, p.x)),
            y: Math.max(0, Math.min(f.h, p.y)),
          },
        ],
        moved: false,
      };
      gesture.current = g;
      previewPenPath(g);
      setNotice(
        tool === 'curvature-pen'
          ? 'Curvature Pen: click to place smooth points, click the first point to close'
          : 'Pen: click to place points, click the first point to close',
      );
      return;
    }
    if (tool === 'quick-selection') {
      if (gesture.current || !frame || doc.rendering) return;
      const f = current(),
        p = point(e),
        g: Gesture = {
          tool,
          start: p,
          last: p,
          frame: f,
          moved: false,
          points: [p],
          queued: [{ x: p.x, y: p.y, pressure: pressure(e), pointerType: e.pointerType }],
          quickSelectionOperation: selectionOperation,
          quickSelectionSize: size,
          quickSelectionTolerance: colorTolerance,
          quickSelectionOpacity: brushOpacity / 100,
        };
      gesture.current = g;
      canvas.current?.setPointerCapture(e.pointerId);
      g.pending = (async () => {
        try {
          const rendered = await renderFrame(f, assets.current),
            context = rendered.getContext('2d');
          if (!context) throw new Error('Quick Selection canvas is unavailable');
          g.quickSelectionSource = new Uint8ClampedArray(
            context.getImageData(0, 0, f.w, f.h).data,
          );
          if (f.selection) {
            const selectionCanvas = await renderSelection(f.selection, f.w, f.h, assets.current),
              alpha = selectionCanvas.getContext('2d')!.getImageData(0, 0, f.w, f.h).data;
            g.quickSelectionExisting = new Uint8ClampedArray(f.w * f.h);
            for (let index = 0; index < g.quickSelectionExisting.length; index += 1)
              g.quickSelectionExisting[index] = alpha[index * 4 + 3];
            if (g.quickSelectionOperation !== 'replace')
              g.quickSelectionBase = g.quickSelectionExisting.slice();
          }
          if (gesture.current !== g) return;
          g.quickSelectionMask = quickSelectionMask(g.quickSelectionSource, {
            width: f.w,
            height: f.h,
            size: g.quickSelectionSize!,
            tolerance: g.quickSelectionTolerance!,
            opacity: g.quickSelectionOpacity!,
            points: g.points || [p],
          });
          g.changed = g.quickSelectionMask.some((value) => value > 0);
          g.queued = undefined;
          selectionBrushPreview(g);
        } catch {
          if (gesture.current === g) {
            gesture.current = null;
            setNotice('Could not prepare Quick Selection');
          }
        }
      })();
      await g.pending;
      return;
    }
    if (tool === 'selection-brush') {
      if (gesture.current || !frame || doc.rendering) return;
      const f = current(),
        p = point(e),
        g: Gesture = {
          tool,
          start: p,
          last: p,
          frame: f,
          moved: false,
          points: [p],
          queued: [
            { x: p.x, y: p.y, pressure: pressure(e), pointerType: e.pointerType },
          ],
          selectionBrushOperation: selectionOperation,
          selectionBrushSize: size,
          selectionBrushHardness: hardness,
          selectionBrushOpacity: brushOpacity / 100,
          selectionBrushPressureSize: pressureSize,
          selectionBrushPressureOpacity: pressureOpacity,
        };
      gesture.current = g;
      canvas.current?.setPointerCapture(e.pointerId);
      g.pending = (async () => {
        try {
          if (f.selection) {
            const rendered = await renderSelection(
              f.selection,
              f.w,
              f.h,
              assets.current,
            );
            const alpha = rendered
              .getContext('2d')!
              .getImageData(0, 0, f.w, f.h).data;
            g.selectionExisting = new Uint8ClampedArray(f.w * f.h);
            for (let index = 0; index < g.selectionExisting.length; index += 1)
              g.selectionExisting[index] = alpha[index * 4 + 3];
            if (g.selectionBrushOperation !== 'replace')
              g.selectionBase = g.selectionExisting.slice();
          }
          if (gesture.current !== g) return;
          g.selectionBrushMask = new Uint8ClampedArray(f.w * f.h);
          let from = p;
          for (const queued of g.queued || []) {
            const next = paintSelectionBrushSegment(g.selectionBrushMask, {
              width: f.w,
              height: f.h,
              x1: from.x,
              y1: from.y,
              x2: queued.x,
              y2: queued.y,
              size: g.selectionBrushSize!,
              hardness: g.selectionBrushHardness!,
              opacity: g.selectionBrushOpacity!,
              pressure: queued.pressure,
              pressureSize: g.selectionBrushPressureSize,
              pressureOpacity: g.selectionBrushPressureOpacity,
            });
            g.selectionBrushMask = next.mask;
            g.changed = Boolean(g.changed || next.changed);
            from = queued;
          }
          g.queued = undefined;
          g.last = from;
          if (gesture.current !== g) return;
          selectionBrushPreview(g);
        } catch {
          if (gesture.current === g) {
            gesture.current = null;
            setNotice('Could not prepare Selection Brush');
          }
        }
      })();
      await g.pending;
      return;
    }
    if (gesture.current || !frame) return;
    if (
      quickMasking ||
      [
        'brush',
        'pencil',
        'color-replace',
        'eraser',
        'background-eraser',
        'magic-eraser',
        'mask-brush',
        'mask-eraser',
        'adjustment-brush',
        'clone',
        'heal',
        'spot-heal',
        'patch',
        'red-eye',
        'pattern-stamp',
        'smudge',
        'dodge',
        'burn',
        'sponge',
        'gradient',
        'mixer-brush',
        'history-brush',
      ].includes(tool)
    ) {
      paintSpan.current?.cancel();
      paintSpan.current = beginPerformanceSpan('paint');
    }
    const f = current(),
      layer = f.layers.find((l) => l.id === f.active)!,
      p = point(e);
    const local =
      layer.kind === 'raster' ? inversePoint(layer.matrix, p) || p : p;
    canvas.current!.setPointerCapture(e.pointerId);
    if (tool === 'slice-select') {
      const selected = sliceAtPoint(f.slices, p.x, p.y);
      if (!selected) {
        setSlicePreview(null);
        setSlicePreviewMode('draft');
        void paint(f);
        setNotice('Click inside a saved slice to select it');
        return;
      }
      if (f.activeSliceId !== selected.id) commit({ ...f, activeSliceId: selected.id });
      setSlicePreview({ frame: current(), ...selected });
      setSlicePreviewMode('selected');
      setSliceName(selected.name);
      void paint(current());
      setNotice(`Slice selected: ${selected.name} · ${selected.width} × ${selected.height} px`);
      return;
    }
    if (tool === 'frame') {
      gesture.current = { tool, start: p, last: p, frame: f, moved: false };
      setNotice('Frame: drag an artboard viewport, then add it');
      return;
    }
    if (
      tool === 'mask-brush' ||
      tool === 'mask-eraser' ||
      tool === 'adjustment-brush'
    ) {
      if (
        layerIsLocked(f, layer) ||
        !layer.visible ||
        !isMaskableLayer(layer) ||
        (tool === 'adjustment-brush'
          ? layer.kind !== 'adjustment'
          : !isRasterContentLayer(layer))
      ) {
        setNotice(
          tool === 'adjustment-brush'
            ? 'Select a visible, unlocked adjustment layer before painting its mask'
            : 'Select a visible, unlocked raster layer before refining its mask',
        );
        return;
      }
      if (!layer.mask) {
        setNotice('Create a layer mask or remove a background before refining');
        return;
      }
      const mode: MaskRefinementMode =
          tool === 'mask-eraser' ? 'conceal' : 'reveal',
        maskAsset = assets.current[layer.mask],
        initialPoint = {
          x: p.x,
          y: p.y,
          pressure: pressure(e),
        },
        g: Gesture = {
          tool,
          start: p,
          last: p,
          frame: f,
          layer,
          lastPressure: initialPoint.pressure,
          pointerType: e.pointerType,
          moved: false,
          queued: [initialPoint],
          maskRefinementStroke: {
            version: 1,
            points: [initialPoint],
            size: Math.max(1, size),
            hardness,
            opacity: brushOpacity / 100,
            mode,
          },
        };
      gesture.current = g;
      g.pending = (async () => {
        try {
          const image = await decodeAsset(maskAsset);
          if (image.naturalWidth !== f.w || image.naturalHeight !== f.h)
            throw new Error('Layer mask dimensions do not match the canvas');
          const buffer = surface(f.w, f.h),
            context = buffer.getContext('2d');
          if (!context) throw new Error('Mask refinement canvas is unavailable');
          context.imageSmoothingEnabled = false;
          context.drawImage(image, 0, 0);
          if (gesture.current !== g) return;
          g.maskBuffer = buffer;
          const queued = (g.queued || [initialPoint]).slice(
            0,
            MASK_REFINEMENT_MAX_POINTS,
          );
          g.maskRefinementStroke = {
            ...g.maskRefinementStroke!,
            points: queued.map((item) => ({
              x: item.x,
              y: item.y,
              pressure: item.pressure,
            })),
          };
          g.changed = refineMaskCanvas(buffer, g.maskRefinementStroke);
          g.last = queued[queued.length - 1] || p;
          g.queued = undefined;
          g.maskPreviewAsset = crypto.randomUUID();
          setPreviewAsset(assets.current, g.maskPreviewAsset, buffer);
          const previewFrame: Frame = {
            ...f,
            layers: f.layers.map((item) =>
              item.id === layer.id
                ? {
                    ...item,
                    mask: g.maskPreviewAsset,
                    maskEnabled: true,
                    maskInverted: layer.maskInverted === true,
                  }
                : item,
            ),
          };
          void paint(previewFrame);
        } catch {
          if (gesture.current === g) {
            gesture.current = null;
            setNotice('Could not prepare mask refinement');
          }
        }
      })();
      await g.pending;
      return;
    }
    if (tool === 'direct-select') {
      if (layerIsLocked(f, layer) || !layer.visible || layer.kind !== 'path') {
        setNotice(
          'Select a visible, unlocked path layer before selecting nodes',
        );
        return;
      }
      const localPoint = inversePoint(layer.matrix, p);
      if (!localPoint) {
        setNotice('This path transform cannot be edited');
        return;
      }
      const scale = Math.max(
        Math.hypot(layer.matrix[0], layer.matrix[1]),
        Math.hypot(layer.matrix[2], layer.matrix[3]),
        0.0001,
      );
      const pathHandle = hitTestPathHandle(layer.path, localPoint, 10 / scale);
      const pathIndex = pathHandle?.index ?? hitTestPathNode(layer.path, localPoint, 10 / scale);
      if (pathIndex === null) {
        setNotice('Click a path node or Bezier handle to select it');
        return;
      }
      const g: Gesture = {
        tool,
        start: p,
        last: p,
        frame: f,
        layer,
        pathIndex,
        pathHandle: pathHandle?.kind,
        pathOrigin: validatePath(layer.path),
        moved: false,
      };
      gesture.current = g;
      drawPathOverlay(layer.path, layer.matrix, pathIndex);
      return;
    }
    if (tool === 'zoom') {
      setZoom((value) => Math.min(140, value + 10));
      setNotice('Zoomed in');
      return;
    }
    if (tool === 'rotate-view') {
      const rect = canvas.current!.getBoundingClientRect();
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      gesture.current = {
        tool,
        start: p,
        last: p,
        frame: f,
        moved: false,
        viewRotationStart: viewRotation,
        viewRotationCenter: center,
        viewRotationPointerAngle: Math.atan2(e.clientY - center.y, e.clientX - center.x),
      };
      canvas.current!.setPointerCapture(e.pointerId);
      setNotice('Rotate View: drag around the canvas; use Reset view to restore');
      return;
    }
    if (tool === 'eyedropper') {
      const pixel = canvas
        .current!.getContext('2d')!
        .getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
      setColor(
        '#' +
          [pixel[0], pixel[1], pixel[2]]
            .map((value) => value.toString(16).padStart(2, '0'))
            .join(''),
      );
      setNotice('Color sampled from image');
      return;
    }
    if (tool === 'color-sampler') {
      const pixel = canvas
        .current!.getContext('2d')!
        .getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
      const hex =
        '#' +
        [pixel[0], pixel[1], pixel[2]]
          .map((value) => value.toString(16).padStart(2, '0'))
          .join('');
      if (
        appendMeasurement({
          id: newMeasurementId(),
          kind: 'sample',
          x: p.x,
          y: p.y,
          color: hex,
          alpha: pixel[3],
        })
      )
        setNotice(`Color sampler: ${hex.toUpperCase()} · alpha ${pixel[3]}`);
      return;
    }
    if (tool === 'ruler') {
      canvas.current!.setPointerCapture(e.pointerId);
      gesture.current = { tool, start: p, last: p, frame: f, moved: false };
      setMeasurementPreview({ start: p, end: p });
      setNotice('Ruler: drag to measure pixels and angle');
      return;
    }
    if (tool === 'note') {
      const text = window.prompt('Note for this image', '');
      if (text?.trim()) {
        if (
          appendMeasurement({
            id: newMeasurementId(),
            kind: 'note',
            x: p.x,
            y: p.y,
            text: text.trim().slice(0, 500),
          })
        )
          setNotice('Note added to the draft');
      } else setNotice('Note cancelled');
      return;
    }
    if (tool === 'count') {
      const index = nextCountIndex(f.measurements || []);
      if (
        appendMeasurement({
          id: newMeasurementId(),
          kind: 'count',
          x: p.x,
          y: p.y,
          index,
        })
      )
        setNotice(`Count marker ${index} added`);
      return;
    }
    if (tool === 'hand') {
      gesture.current = {
        tool,
        start: p,
        last: p,
        frame: f,
        moved: false,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
      };
      return;
    }
    if (tool === 'fill') {
      if (
        layerIsLocked(f, layer) ||
        !layer.visible ||
        layer.kind !== 'raster'
      ) {
        setNotice('Select a visible, unlocked raster layer before filling');
        return;
      }
      try {
        const image = await decodeAsset(assets.current[layer.asset]),
          buffer = surface(image.naturalWidth, image.naturalHeight);
        buffer.getContext('2d')!.drawImage(image, 0, 0);
        if (!floodFill(buffer, local.x, local.y, color)) {
          setNotice('No contiguous pixels matched at that point');
          return;
        }
        const asset = addAsset(assets.current, buffer);
        if (
          commit({
            ...f,
            layers: f.layers.map((item) =>
              item.id === layer.id ? { ...item, asset } : item,
            ),
          })
        )
          setNotice('Area filled; undo restores the original pixels');
      } catch {
        setNotice('Could not fill this layer');
      }
      return;
    }
    if (tool === 'magic-eraser') {
      if (
        layerIsLocked(f, layer) ||
        !layer.visible ||
        layer.kind !== 'raster'
      ) {
        setNotice('Select a visible, unlocked raster layer before erasing');
        return;
      }
      try {
        const image = await decodeAsset(assets.current[layer.asset]),
          buffer = surface(image.naturalWidth, image.naturalHeight);
        buffer.getContext('2d')!.drawImage(image, 0, 0);
        if (!eraseMagicRegion(buffer, local.x, local.y, colorTolerance)) {
          setNotice('No contiguous pixels matched at that point');
          return;
        }
        const asset = addAsset(assets.current, buffer);
        if (
          commit({
            ...f,
            layers: f.layers.map((item) =>
              item.id === layer.id ? { ...item, asset } : item,
            ),
          })
        )
          setNotice('Magic Eraser removed the contiguous region');
      } catch {
        setNotice('Could not erase this layer');
      }
      return;
    }
    if (tool === 'background-eraser') {
      if (
        layerIsLocked(f, layer) ||
        !layer.visible ||
        layer.kind !== 'raster'
      ) {
        setNotice('Select a visible, unlocked raster layer before erasing');
        return;
      }
      const g = {
        tool,
        start: local,
        last: local,
        frame: f,
        layer,
        lastPressure: pressure(e),
        pointerType: e.pointerType,
        moved: false,
        queued: [
          { ...local, pressure: pressure(e), pointerType: e.pointerType },
        ],
      } as Gesture;
      gesture.current = g;
      g.pending = (async () => {
        try {
          const image = await decodeAsset(assets.current[layer.asset]),
            source = surface(image.naturalWidth, image.naturalHeight),
            buffer = surface(image.naturalWidth, image.naturalHeight),
            sourceContext = source.getContext('2d')!,
            bufferContext = buffer.getContext('2d')!;
          sourceContext.drawImage(image, 0, 0);
          bufferContext.drawImage(image, 0, 0);
          if (gesture.current !== g) return;
          const sample = sourceContext.getImageData(
            Math.max(0, Math.min(source.width - 1, Math.floor(local.x))),
            Math.max(0, Math.min(source.height - 1, Math.floor(local.y))),
            1,
            1,
          ).data;
          g.source = source;
          g.buffer = buffer;
          g.replaceTarget = [sample[0], sample[1], sample[2], sample[3]];
          let from = g.start;
          for (const point of g.queued || [
            {
              ...g.start,
              pressure: g.lastPressure,
              pointerType: g.pointerType,
            },
          ]) {
            eraseBackgroundStroke(
              source,
              buffer,
              g.replaceTarget,
              from.x,
              from.y,
              point.x,
              point.y,
              localSize(layer.matrix, size),
              colorTolerance,
              brushOpacity / 100,
            );
            from = point;
          }
          g.queued = undefined;
          void paint(f, { [layer.id]: buffer });
        } catch {
          gesture.current = null;
          setNotice('Could not prepare background eraser');
        }
      })();
      await g.pending;
      return;
    }
    if (tool === 'smudge') {
      if (
        layerIsLocked(f, layer) ||
        !layer.visible ||
        layer.kind !== 'raster'
      ) {
        setNotice('Select a visible, unlocked raster layer before smudging');
        return;
      }
      const g = {
        tool,
        start: local,
        last: local,
        frame: f,
        layer,
        lastPressure: pressure(e),
        pointerType: e.pointerType,
        moved: false,
        queued: [
          { ...local, pressure: pressure(e), pointerType: e.pointerType },
        ],
      } as Gesture;
      gesture.current = g;
      g.pending = (async () => {
        try {
          const image = await decodeAsset(assets.current[layer.asset]),
            source = surface(image.naturalWidth, image.naturalHeight),
            buffer = surface(image.naturalWidth, image.naturalHeight),
            sourceContext = source.getContext('2d')!,
            bufferContext = buffer.getContext('2d')!;
          sourceContext.drawImage(image, 0, 0);
          bufferContext.drawImage(image, 0, 0);
          if (gesture.current !== g) return;
          g.selectionMask = await selectionMaskForLayer(
            f.selection,
            f,
            layer,
            assets.current,
            image.naturalWidth,
            image.naturalHeight,
          );
          if (gesture.current !== g) return;
          g.source = source;
          g.buffer = buffer;
          let from = g.start;
          for (const queued of g.queued || []) {
            const changed = smudgeCanvasSegment(source, buffer, from, queued, {
              size: localSize(layer.matrix, size),
              hardness,
              flow: brushOpacity / 100,
              selectionMask: g.selectionMask,
            });
            from = queued;
            g.changed = Boolean(g.changed || changed);
          }
          g.queued = undefined;
          void paint(f, { [layer.id]: buffer });
        } catch {
          gesture.current = null;
          setNotice('Could not prepare Smudge tool');
        }
      })();
      await g.pending;
      return;
    }
    if (tool === 'mixer-brush' || tool === 'history-brush') {
      if (layerIsLocked(f, layer) || !layer.visible || layer.kind !== 'raster') {
        setNotice(`Select a visible, unlocked raster layer before using ${tool === 'mixer-brush' ? 'Mixer Brush' : 'History Brush'}`);
        return;
      }
      const g: Gesture = {
        tool,
        start: local,
        last: local,
        frame: f,
        layer,
        lastPressure: pressure(e),
        pointerType: e.pointerType,
        moved: false,
        brushPoints: [{ x: local.x, y: local.y, pressure: pressure(e) }],
        queued: [{ ...local, pressure: pressure(e), pointerType: e.pointerType }],
      };
      gesture.current = g;
      g.pending = (async () => {
        try {
          const currentImage = await decodeAsset(assets.current[layer.asset]),
            source = surface(currentImage.naturalWidth, currentImage.naturalHeight),
            buffer = surface(currentImage.naturalWidth, currentImage.naturalHeight);
          source.getContext('2d')!.drawImage(currentImage, 0, 0);
          buffer.getContext('2d')!.drawImage(currentImage, 0, 0);
          let sourceIndex = index.current;
          if (tool === 'history-brush') {
            sourceIndex = Math.max(0, Math.min(history.current.length - 1, historySourceIndex ?? index.current));
            const sourceFrame = history.current[sourceIndex];
            const sourceLayer = sourceFrame?.layers.find((item) => item.id === layer.id) ||
              sourceFrame?.layers.find((item) => item.id === sourceFrame.active);
            if (sourceLayer?.kind === 'raster' && sourceLayer.asset) {
              const candidate = await decodeAsset(assets.current[sourceLayer.asset]);
              if (candidate.naturalWidth === currentImage.naturalWidth && candidate.naturalHeight === currentImage.naturalHeight) {
                source.getContext('2d')!.clearRect(0, 0, source.width, source.height);
                source.getContext('2d')!.drawImage(candidate, 0, 0);
              }
            }
            g.historySourceIndex = sourceIndex;
          }
          if (gesture.current !== g) return;
          g.source = source;
          g.buffer = buffer;
          g.sourcePixels = new Uint8ClampedArray(source.getContext('2d')!.getImageData(0, 0, source.width, source.height).data);
          g.selectionMask = await selectionMaskForLayer(f.selection, f, layer, assets.current, source.width, source.height);
          const points = (g.queued || []).map((item) => ({ x: item.x, y: item.y, pressure: item.pressure }));
          g.brushPoints = points;
          const destination = new Uint8ClampedArray(buffer.getContext('2d')!.getImageData(0, 0, buffer.width, buffer.height).data);
          const next = tool === 'mixer-brush'
            ? applyMixerBrushPixels(destination, g.sourcePixels, buffer.width, buffer.height, points, {
                ...mixerBrush,
                size: localSize(layer.matrix, size),
                hardness,
              }, g.selectionMask)
            : applyHistoryBrushPixels(destination, g.sourcePixels, buffer.width, buffer.height, points, {
                ...historyBrush,
                size: localSize(layer.matrix, size),
                hardness,
              }, g.selectionMask);
          buffer.getContext('2d')!.putImageData(new ImageData(next as unknown as Uint8ClampedArray<ArrayBuffer>, buffer.width, buffer.height), 0, 0);
          g.last = points.at(-1) || g.last;
          g.queued = undefined;
          void paint(f, { [layer.id]: buffer });
        } catch {
          gesture.current = null;
          setNotice(`Could not prepare ${tool === 'mixer-brush' ? 'Mixer Brush' : 'History Brush'}`);
        }
      })();
      await g.pending;
      return;
    }
    if (tool === 'dodge' || tool === 'burn' || tool === 'sponge') {
      if (
        layerIsLocked(f, layer) ||
        !layer.visible ||
        layer.kind !== 'raster'
      ) {
        setNotice('Select a visible, unlocked raster layer before toning');
        return;
      }
      const g = {
        tool,
        start: local,
        last: local,
        frame: f,
        layer,
        lastPressure: pressure(e),
        pointerType: e.pointerType,
        moved: false,
        queued: [
          { ...local, pressure: pressure(e), pointerType: e.pointerType },
        ],
      } as Gesture;
      gesture.current = g;
      g.pending = (async () => {
        try {
          const image = await decodeAsset(assets.current[layer.asset]),
            source = surface(image.naturalWidth, image.naturalHeight),
            buffer = surface(image.naturalWidth, image.naturalHeight),
            sourceContext = source.getContext('2d')!,
            bufferContext = buffer.getContext('2d')!;
          sourceContext.drawImage(image, 0, 0);
          bufferContext.drawImage(image, 0, 0);
          if (gesture.current !== g) return;
          g.selectionMask = await selectionMaskForLayer(
            f.selection,
            f,
            layer,
            assets.current,
            image.naturalWidth,
            image.naturalHeight,
          );
          if (gesture.current !== g) return;
          g.source = source;
          g.buffer = buffer;
          let from = g.start;
          for (const queued of g.queued || [
            {
              ...g.start,
              pressure: g.lastPressure,
              pointerType: g.pointerType,
            },
          ]) {
            const changed = tonalCanvasSegment(source, buffer, from, queued, {
              size: localSize(layer.matrix, size),
              hardness,
              exposure: tonalExposure,
              flow: brushOpacity / 100,
              range: tonalRange,
              mode: tool,
              spongeMode,
              spongeVibrance,
              selectionMask: g.selectionMask,
            });
            from = queued;
            g.changed = Boolean(g.changed || changed);
          }
          g.queued = undefined;
          void paint(f, { [layer.id]: buffer });
        } catch {
          gesture.current = null;
          setNotice('Could not prepare tonal tool');
        }
      })();
      await g.pending;
      return;
    }
    if (tool === 'spot-heal') {
      if (layerIsLocked(f, layer) || !layer.visible || layer.kind !== 'raster') {
        setNotice('Select a visible, unlocked raster layer before Spot Healing');
        return;
      }
      if ((layer.spotHealing?.length ?? 0) >= SPOT_HEALING_MAX_STROKES) {
        setNotice('This layer has 128 Spot Healing strokes; export a copy before adding more');
        return;
      }
      const asset = assets.current[layer.asset],
        x = Math.max(0, Math.min(asset.w - 1, local.x)),
        y = Math.max(0, Math.min(asset.h - 1, local.y)),
        g: Gesture = {
          tool,
          start: { x, y },
          last: { x, y },
          frame: f,
          layer,
          moved: false,
          spotHealingStroke: {
            version: 1,
            points: [{ x, y }],
            size: localSize(layer.matrix, size),
            hardness,
            opacity: brushOpacity / 100,
          },
        };
      gesture.current = g;
      void paint({
        ...f,
        layers: f.layers.map((item) => item.id === layer.id
          ? { ...item, spotHealing: [...(item.spotHealing ?? []), g.spotHealingStroke!] }
          : item),
      });
      return;
    }
    if (tool === 'patch') {
      if (layerIsLocked(f, layer) || !layer.visible || layer.kind !== 'raster') {
        setNotice('Select a visible, unlocked raster layer before Patch');
        return;
      }
      if (!cloneSource) {
        setCloneSource(local);
        setNotice('Patch source set; drag on the image to paint the patch');
        return;
      }
      if ((layer.patchStrokes?.length ?? 0) >= PATCH_MAX_STROKES) {
        setNotice(
          `This layer has ${PATCH_MAX_STROKES} Patch strokes; export a copy before adding more`,
        );
        return;
      }
      const asset = assets.current[layer.asset],
        x = Math.max(0, Math.min(asset.w - 1, local.x)),
        y = Math.max(0, Math.min(asset.h - 1, local.y)),
        g: Gesture = {
          tool,
          start: { x, y },
          last: { x, y },
          frame: f,
          layer,
          moved: false,
          patchStroke: {
            version: 1,
            points: [{ x, y }],
            size: localSize(layer.matrix, size),
            hardness,
            opacity: brushOpacity / 100,
            sourceOffset: {
              x: cloneSource.x - x,
              y: cloneSource.y - y,
            },
          },
        };
      gesture.current = g;
      void paint({
        ...f,
        layers: f.layers.map((item) => item.id === layer.id
          ? { ...item, patchStrokes: [...(item.patchStrokes ?? []), g.patchStroke!] }
          : item),
      });
      return;
    }
    if (tool === 'clone' || tool === 'heal') {
      if (
        layerIsLocked(f, layer) ||
        !layer.visible ||
        layer.kind !== 'raster'
      ) {
        setNotice('Select a visible, unlocked raster layer before retouching');
        return;
      }
      // Match Photoshop's Option/Alt-click source workflow.  A source can be
      // re-anchored between strokes without switching tools; the click only
      // updates the source point and must never create a history entry.
      if (tool === 'clone' && e.altKey) {
        setCloneSource(local);
        setNotice('Clone source set; drag on the image to paint it');
        return;
      }
      if (!cloneSource) {
        setCloneSource(local);
        setNotice('Clone source set; drag on the image to paint it');
        return;
      }
      const g = {
        tool,
        start: local,
        last: local,
        frame: f,
        layer,
        lastPressure: pressure(e),
        pointerType: e.pointerType,
        moved: false,
        queued: [
          { ...local, pressure: pressure(e), pointerType: e.pointerType },
        ],
      } as Gesture;
      const sourceAnchor = cloneSource;
      gesture.current = g;
      g.pending = (async () => {
        const sourceImage = await decodeAsset(assets.current[layer.asset]),
          source = surface(sourceImage.naturalWidth, sourceImage.naturalHeight);
        source.getContext('2d')!.drawImage(sourceImage, 0, 0);
        if (gesture.current !== g) return;
        g.source = source;
        g.buffer = surface(source.width, source.height);
        g.buffer.getContext('2d')!.drawImage(source, 0, 0);
        let from = g.start;
        for (const point of g.queued || [
          { ...g.start, pressure: g.lastPressure, pointerType: g.pointerType },
        ]) {
          stampCanvasSegment(g.buffer, from, point, {
            size: localSize(layer.matrix, size),
            hardness,
            opacity: brushOpacity / 100,
            pointerType: point.pointerType,
            pressure: point.pressure,
            pressureSize,
            pressureOpacity,
            spacing: brushSpacing,
            angle: brushAngle,
            roundness: brushRoundness,
            flipX: brushFlipX,
            flipY: brushFlipY,
            mode: tool === 'heal' ? 'heal' : 'clone',
            source,
            sourceAnchor,
            destinationAnchor: g.start,
          });
          from = point;
        }
        g.queued = undefined;
        void paint(f, { [layer.id]: g.buffer });
      })();
      await g.pending;
      return;
    }
    if (tool === 'pattern-stamp') {
      if (
        layerIsLocked(f, layer) ||
        !layer.visible ||
        layer.kind !== 'raster'
      ) {
        setNotice(
          'Select a visible, unlocked raster layer before pattern stamping',
        );
        return;
      }
      const g = {
        tool,
        start: local,
        last: local,
        frame: f,
        layer,
        lastPressure: pressure(e),
        pointerType: e.pointerType,
        patternId,
        patternTileSize,
        moved: false,
        queued: [
          { ...local, pressure: pressure(e), pointerType: e.pointerType },
        ],
      } as Gesture;
      gesture.current = g;
      g.pending = (async () => {
        try {
          const sourceImage = await decodeAsset(assets.current[layer.asset]),
            buffer = surface(
              sourceImage.naturalWidth,
              sourceImage.naturalHeight,
            );
          buffer.getContext('2d')!.drawImage(sourceImage, 0, 0);
          if (gesture.current !== g) return;
          g.buffer = buffer;
          let from = g.start;
          for (const point of g.queued || [
            {
              ...g.start,
              pressure: g.lastPressure,
              pointerType: g.pointerType,
            },
          ]) {
            g.changed =
              patternCanvasSegment(g.buffer, from, point, {
                size: localSize(layer.matrix, size),
                hardness,
                opacity: brushOpacity / 100,
                pointerType: point.pointerType,
                pressure: point.pressure,
                pressureSize,
                pressureOpacity,
                spacing: brushSpacing,
                angle: brushAngle,
                roundness: brushRoundness,
                flipX: brushFlipX,
                flipY: brushFlipY,
                pattern: g.patternId!,
                tileSize: g.patternTileSize!,
                foreground: brushColor(color),
                background: brushColor(backgroundColor),
              }) || Boolean(g.changed);
            from = point;
          }
          g.queued = undefined;
          void paint(f, { [layer.id]: g.buffer });
        } catch {
          gesture.current = null;
          setNotice('Could not prepare Pattern Stamp');
        }
      })();
      await g.pending;
      return;
    }
    if (tool === 'red-eye') {
      if (
        layerIsLocked(f, layer) ||
        !layer.visible ||
        layer.kind !== 'raster'
      ) {
        setNotice(
          'Select a visible, unlocked raster layer before Red Eye correction',
        );
        return;
      }
      const g = {
        tool,
        start: local,
        last: local,
        frame: f,
        layer,
        redEyeThreshold,
        redEyeAmount,
        moved: false,
        queued: [
          { ...local, pressure: pressure(e), pointerType: e.pointerType },
        ],
      } as Gesture;
      gesture.current = g;
      g.pending = (async () => {
        try {
          const image = await decodeAsset(assets.current[layer.asset]),
            buffer = surface(image.naturalWidth, image.naturalHeight);
          buffer.getContext('2d')!.drawImage(image, 0, 0);
          if (gesture.current !== g) return;
          g.buffer = buffer;
          let from = g.start;
          for (const point of g.queued || [g.start]) {
            redEyeCanvasStroke(buffer, from, point, {
              radius: localSize(layer.matrix, size) / 2,
              threshold: g.redEyeThreshold ?? 36,
              amount: (g.redEyeAmount ?? 100) / 100,
            });
            from = point;
          }
          g.queued = undefined;
          void paint(f, { [layer.id]: buffer });
        } catch {
          gesture.current = null;
          setNotice('Could not prepare Red Eye correction');
        }
      })();
      await g.pending;
      return;
    }
    if (tool === 'color-replace') {
      if (
        layerIsLocked(f, layer) ||
        !layer.visible ||
        layer.kind !== 'raster'
      ) {
        setNotice(
          'Select a visible, unlocked raster layer before replacing colors',
        );
        return;
      }
      const g = {
        tool,
        start: local,
        last: local,
        frame: f,
        layer,
        moved: false,
      } as Gesture;
      gesture.current = g;
      g.pending = (async () => {
        try {
          const sourceImage = await decodeAsset(assets.current[layer.asset]),
            source = surface(
              sourceImage.naturalWidth,
              sourceImage.naturalHeight,
            );
          source.getContext('2d')!.drawImage(sourceImage, 0, 0);
          if (gesture.current !== g) return;
          const sample = source
            .getContext('2d')!
            .getImageData(
              Math.max(0, Math.min(source.width - 1, Math.floor(local.x))),
              Math.max(0, Math.min(source.height - 1, Math.floor(local.y))),
              1,
              1,
            ).data;
          g.source = source;
          g.replaceTarget = [sample[0], sample[1], sample[2], sample[3]];
          g.buffer = surface(source.width, source.height);
          g.buffer.getContext('2d')!.drawImage(source, 0, 0);
          replaceColorStroke(
            source,
            g.buffer,
            g.replaceTarget,
            local.x,
            local.y,
            local.x,
            local.y,
            color,
            size,
            colorTolerance,
            brushOpacity / 100,
          );
          void paint(f, { [layer.id]: g.buffer });
        } catch {
          gesture.current = null;
          setNotice('Could not prepare color replacement');
        }
      })();
      await g.pending;
      return;
    }
    if (tool === 'gradient') {
      if (
        layerIsLocked(f, layer) ||
        !layer.visible ||
        layer.kind !== 'raster'
      ) {
        setNotice(
          'Select a visible, unlocked raster layer before applying a gradient',
        );
        return;
      }
      gesture.current = {
        tool,
        start: local,
        last: local,
        frame: f,
        layer,
        moved: false,
      };
      return;
    }
    if (tool === 'magic-wand') {
      if (
        layerIsLocked(f, layer) ||
        !layer.visible ||
        layer.kind !== 'raster'
      ) {
        setNotice(
          'Select a visible, unlocked raster layer before color-selecting',
        );
        return;
      }
      const frameIndex = index.current,
        workToken = ++selectionWorkToken.current,
        operation = selectionOperation,
        sourceAssets = assets.current;
      try {
        const source = await renderFrame(
            { ...f, layers: [layer] },
            sourceAssets,
          ),
          mask = colorSelectMask(source, p.x, p.y);
        if (!isCurrentSelectionOperation(f, frameIndex, workToken)) return;
        const next: Selection = {
          shape: 'rectangle',
          x: 0,
          y: 0,
          w: f.w,
          h: f.h,
          feather: 0,
          inverted: false,
        };
        const candidate = await composeSelectionCandidate(
          f,
          next,
          mask,
          operation,
          sourceAssets,
        );
        publishSelectionCandidate(
          f,
          frameIndex,
          workToken,
          candidate,
          'Color selection created from contiguous pixels',
        );
      } catch {
        if (isCurrentSelectionOperation(f, frameIndex, workToken))
          setNotice('Could not create a color selection');
      }
      return;
    }
    if (tool === 'magnetic-lasso') {
      if (layerIsLocked(f, layer) || !layer.visible || layer.kind !== 'raster') {
        setNotice('Select a visible, unlocked raster layer before using Magnetic Lasso');
        return;
      }
      setNotice('Magnetic Lasso: drag along an edge, release to close');
      canvas.current?.setPointerCapture(e.pointerId);
      const g: Gesture = {
        tool,
        start: p,
        last: p,
        frame: f,
        layer,
        points: [p],
        magneticRadius: Math.max(6, Math.min(24, Math.round(size / 2))),
        moved: false,
      };
      gesture.current = g;
      g.pending = (async () => {
        try {
          const rendered = await renderFrame({ ...f, layers: [layer] }, assets.current);
          if (gesture.current !== g) return;
          const context = rendered.getContext('2d');
          if (!context) throw new Error('Magnetic Lasso could not sample the layer');
          g.magneticData = context.getImageData(0, 0, f.w, f.h).data;
          const pending = g.magneticPendingPoints;
          if (pending?.length && gesture.current === g) {
            for (const point of pending) {
              const snapped = snapMagneticPoint(
                g.magneticData,
                f.w,
                f.h,
                point,
                g.magneticRadius ?? 12,
              );
              if (Math.hypot(snapped.x - g.last.x, snapped.y - g.last.y) >= 2) {
                g.points?.push(snapped);
                g.moved = true;
                g.last = snapped;
              }
            }
            g.magneticPendingPoints = undefined;
          }
          setNotice('Magnetic Lasso: drag along an edge, release to close');
        } catch {
          if (gesture.current === g) {
            gesture.current = null;
            setNotice('Could not prepare Magnetic Lasso');
          }
        }
      })();
      await g.pending;
      return;
    }
    if (tool === 'row-select' || tool === 'column-select') {
      // Photoshop's single-row and single-column marquees are one-pixel
      // precision presets. A click is enough; using the pointer-down point
      // also keeps the interaction reliable on touch and pen devices.
      const x = Math.max(0, Math.min(f.w - 1, Math.floor(p.x))),
        y = Math.max(0, Math.min(f.h - 1, Math.floor(p.y)));
      const row = tool === 'row-select';
      mergeSelection({
        shape: 'rectangle',
        x: row ? 0 : x,
        y: row ? y : 0,
        w: row ? f.w : 1,
        h: row ? 1 : f.h,
        feather: 0,
        inverted: false,
      });
      setNotice(
        row
          ? 'Single row selection created'
          : 'Single column selection created',
      );
      return;
    }
    if (tool === 'text') {
      const added = addLayer({
        ...commonLayer('Text ' + f.layers.length),
        kind: 'text',
        text: text || 'Your text',
        fontSize,
        fontFamily: 'Arial',
        bold: true,
        color,
        boxWidth: Math.max(1, f.w - p.x),
        textAlign: 'left',
        lineHeight: 1.2,
        letterSpacing: 0,
        orientation: 'horizontal',
        matrix: [1, 0, 0, 1, p.x, p.y],
      });
      if (added) setNotice('Editable text layer added');
      return;
    }
    if (tool === 'select' || tool === 'ellipse-select' || tool === 'lasso') {
      gesture.current = {
        tool,
        start: p,
        last: p,
        frame: f,
        moved: false,
        points: [p],
      };
      return;
    }
    if (tool === 'polygonal-lasso') {
      gesture.current = {
        tool,
        start: p,
        last: p,
        frame: f,
        moved: false,
        points: [p],
      };
      setNotice(
        'Polygonal lasso: click to place points, click the first point to close',
      );
      return;
    }
    if (
      tool === 'rectangle' ||
      tool === 'ellipse' ||
      tool === 'line' ||
      tool === 'polygon' ||
      tool === 'crop' ||
      tool === 'perspective-crop' ||
      tool === 'slice'
    ) {
      gesture.current = { tool, start: p, last: p, frame: f, moved: false };
      return;
    }
    if (layerIsLocked(current(), layer) || !layer.visible) {
      setNotice('Select a visible, unlocked layer');
      return;
    }
    if (
      (tool === 'brush' || tool === 'pencil' || tool === 'eraser') &&
      layer.kind !== 'raster'
    ) {
      setNotice('Add a paint layer, or rasterize this layer before painting');
      return;
    }
    const rasterAsset = layer.kind === 'raster' ? layer.asset : null;
    const g = {
      tool,
      start: tool === 'move' ? p : local,
      last: tool === 'move' ? p : local,
      frame: f,
      layer,
      lastPressure: pressure(e),
      pointerType: e.pointerType,
      moved: false,
      queued: [{ ...local, pressure: pressure(e), pointerType: e.pointerType }],
    } as Gesture;
    gesture.current = g;
    if (tool === 'brush' || tool === 'pencil' || tool === 'eraser') {
      g.pending = (async () => {
        try {
          const image = await decodeAsset(assets.current[rasterAsset!]),
            buffer = surface(image.naturalWidth, image.naturalHeight);
          buffer.getContext('2d')!.drawImage(image, 0, 0);
          if (gesture.current !== g) return;
          g.buffer = buffer;
          let from = local;
          for (const point of g.queued || [
            { ...local, pressure: g.lastPressure, pointerType: g.pointerType },
          ]) {
            stampCanvasSegment(buffer, from, point, {
              size: localSize(layer.matrix, size),
              hardness: tool === 'pencil' ? 100 : hardness,
              opacity: brushOpacity / 100,
              pointerType: point.pointerType,
              pressure: point.pressure,
              pressureSize: tool !== 'pencil' && pressureSize,
              pressureOpacity: tool !== 'pencil' && pressureOpacity,
              spacing: brushSpacing,
              angle: brushAngle,
              roundness: tool === 'pencil' ? 100 : brushRoundness,
              flipX: brushFlipX,
              flipY: brushFlipY,
              mode: tool === 'eraser' ? 'destination-out' : 'source-over',
              color: tool === 'eraser' ? undefined : brushColor(color),
            });
            from = point;
          }
          g.queued = undefined;
          void paint(f, { [layer.id]: buffer });
        } catch {
          gesture.current = null;
          setNotice('Could not prepare paint layer');
        }
      })();
      await g.pending;
    }
  };
  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (quickMaskGesture.current && quickMaskRef.current) {
      const p = point(e),
        g = quickMaskGesture.current;
      updateQuickMaskAt(quickMaskRef.current, p.x, p.y, g.selected);
      g.last = p;
      return;
    }
    const g = gesture.current;
    if (!g) return;
    const p = point(e);
    const local =
      g.layer?.kind === 'raster' || g.layer?.kind === 'path'
        ? inversePoint(g.layer.matrix, p) || p
        : p;
    g.lastPressure = pressure(e);
    g.pointerType = e.pointerType;
    g.moved = true;
    if (
      (g.tool === 'mask-brush' ||
        g.tool === 'mask-eraser' ||
        g.tool === 'adjustment-brush') &&
      g.maskRefinementStroke
    ) {
      const point = { x: p.x, y: p.y, pressure: g.lastPressure };
      if (!g.maskBuffer) {
        if ((g.queued?.length || 0) < MASK_REFINEMENT_MAX_POINTS)
          (g.queued ||= []).push({ ...point, pointerType: e.pointerType });
        g.last = p;
        return;
      }
      if (g.maskRefinementStroke.points.length < MASK_REFINEMENT_MAX_POINTS) {
        const from = g.maskRefinementStroke.points[
          g.maskRefinementStroke.points.length - 1
        ];
        g.maskRefinementStroke.points.push(point);
        g.changed = refineMaskCanvas(g.maskBuffer, {
          ...g.maskRefinementStroke,
          points: [from, point],
        }) || Boolean(g.changed);
        if (g.maskPreviewAsset) {
          setPreviewAsset(assets.current, g.maskPreviewAsset, g.maskBuffer);
          const previewFrame: Frame = {
            ...g.frame,
            layers: g.frame.layers.map((item) =>
              item.id === g.layer!.id
                ? {
                    ...item,
                    mask: g.maskPreviewAsset,
                    maskEnabled: true,
                    maskInverted: false,
                  }
                : item,
            ),
          };
          void paint(previewFrame);
        }
      }
      g.last = p;
      return;
    }
    if (g.tool === 'spot-heal' && g.layer?.kind === 'raster' && g.spotHealingStroke) {
      const asset = assets.current[g.layer.asset],
        x = Math.max(0, Math.min(asset.w - 1, local.x)),
        y = Math.max(0, Math.min(asset.h - 1, local.y)),
        stroke = g.spotHealingStroke,
        distance = Math.hypot(x - g.last.x, y - g.last.y),
        spacing = Math.max(1, stroke.size * 0.25),
        steps = Math.max(1, Math.ceil(distance / spacing));
      for (let step = 1; step <= steps && stroke.points.length < SPOT_HEALING_MAX_POINTS; step += 1) {
        const t = step / steps;
        stroke.points.push({ x: g.last.x + (x - g.last.x) * t, y: g.last.y + (y - g.last.y) * t });
      }
      g.last = { x, y };
      void paint({
        ...g.frame,
        layers: g.frame.layers.map((item) => item.id === g.layer!.id
          ? { ...item, spotHealing: [...(item.spotHealing ?? []), stroke] }
          : item),
      });
      return;
    }
    if (g.tool === 'patch' && g.layer?.kind === 'raster' && g.patchStroke) {
      const asset = assets.current[g.layer.asset],
        x = Math.max(0, Math.min(asset.w - 1, local.x)),
        y = Math.max(0, Math.min(asset.h - 1, local.y)),
        stroke = g.patchStroke,
        distance = Math.hypot(x - g.last.x, y - g.last.y),
        spacing = Math.max(1, stroke.size * 0.25),
        steps = Math.max(1, Math.ceil(distance / spacing));
      for (let step = 1; step <= steps && stroke.points.length < PATCH_MAX_POINTS; step += 1) {
        const t = step / steps;
        stroke.points.push({ x: g.last.x + (x - g.last.x) * t, y: g.last.y + (y - g.last.y) * t });
      }
      g.last = { x, y };
      void paint({
        ...g.frame,
        layers: g.frame.layers.map((item) => item.id === g.layer!.id
          ? { ...item, patchStrokes: [...(item.patchStrokes ?? []), stroke] }
          : item),
      });
      return;
    }
    if (g.tool === 'freeform-pen') {
      const points = g.points || [];
      const next = appendFreeformPoint(points, {
        x: Math.max(0, Math.min(g.frame.w, p.x)),
        y: Math.max(0, Math.min(g.frame.h, p.y)),
      });
      if (next.length !== points.length) {
        g.points = next;
        g.last = p;
        g.moved = next.length > 1;
        previewFreeformPath(g);
      }
      return;
    }
    if (g.tool === 'rotate-view' && g.viewRotationCenter && g.viewRotationPointerAngle !== undefined) {
      const currentAngle = Math.atan2(
        e.clientY - g.viewRotationCenter.y,
        e.clientX - g.viewRotationCenter.x,
      );
      const delta = rotationDelta(g.viewRotationPointerAngle, currentAngle);
      setViewRotation(normalizeViewRotation((g.viewRotationStart ?? viewRotation) + delta));
      g.last = p;
      g.moved = true;
      return;
    }
    if (g.tool === 'hand') {
      if (stage.current) {
        const delta = screenPanDelta(
          g.lastClientX ?? e.clientX,
          g.lastClientY ?? e.clientY,
          e.clientX,
          e.clientY,
        );
        stage.current.scrollLeft -= delta.x;
        stage.current.scrollTop -= delta.y;
      }
      g.lastClientX = e.clientX;
      g.lastClientY = e.clientY;
      g.last = p;
      return;
    }
    if (g.tool === 'ruler') {
      g.moved = true;
      g.last = p;
      setMeasurementPreview({ start: g.start, end: p });
      return;
    }
    // Holding Shift while dragging a Pen point creates an outgoing cubic
    // handle. Alt mirrors the handle to the incoming side, matching the
    // familiar Photoshop tangent workflow while keeping click-only paths
    // perfectly backward compatible.
    if (g.tool === 'pen' && (e.shiftKey || e.altKey) && g.points?.length) {
      const node = g.points[g.points.length - 1];
      node.outHandle = { x: p.x, y: p.y };
      if (e.altKey)
        node.inHandle = { x: node.x * 2 - p.x, y: node.y * 2 - p.y };
      g.moved = true;
      g.last = p;
      previewPenPath(g);
      return;
    }
    if (
      g.tool === 'direct-select' &&
      g.layer?.kind === 'path' &&
      g.pathIndex !== undefined &&
      g.pathOrigin
    ) {
      const moved = g.pathHandle
        ? movePathHandle(g.pathOrigin, g.pathIndex, g.pathHandle, local.x, local.y)
        : movePathNode(g.pathOrigin, g.pathIndex, local.x, local.y);
      g.moved = true;
      void paint({
        ...g.frame,
        layers: g.frame.layers.map((item) =>
          item.id === g.layer!.id ? { ...item, path: moved } : item,
        ),
      }).then(() => {
        if (gesture.current === g)
          drawPathOverlay(moved, g.layer!.matrix, g.pathIndex!);
      });
      g.last = p;
      return;
    }
    if (
      (g.tool === 'brush' || g.tool === 'pencil' || g.tool === 'eraser') &&
      !g.buffer
    )
      g.queued?.push({
        ...local,
        pressure: g.lastPressure,
        pointerType: g.pointerType,
      });
    if (
      (g.tool === 'clone' || g.tool === 'heal') &&
      g.buffer &&
      g.source &&
      cloneSource
    ) {
      stampCanvasSegment(g.buffer, g.last, local, {
        size: localSize(g.layer!.matrix, size),
        hardness,
        opacity: brushOpacity / 100,
        pointerType: g.pointerType,
        pressure: g.lastPressure,
        pressureSize,
        pressureOpacity,
        spacing: brushSpacing,
        angle: brushAngle,
        roundness: brushRoundness,
        flipX: brushFlipX,
        flipY: brushFlipY,
        mode: g.tool === 'heal' ? 'heal' : 'clone',
        source: g.source,
        sourceAnchor: cloneSource,
        destinationAnchor: g.start,
      });
      void paint(g.frame, { [g.layer!.id]: g.buffer });
      g.last = local;
      return;
    }
    if (g.tool === 'pattern-stamp' && g.buffer) {
      g.changed =
        patternCanvasSegment(g.buffer, g.last, local, {
          size: localSize(g.layer!.matrix, size),
          hardness,
          opacity: brushOpacity / 100,
          pointerType: g.pointerType,
          pressure: g.lastPressure,
          pressureSize,
          pressureOpacity,
          spacing: brushSpacing,
          angle: brushAngle,
          roundness: brushRoundness,
          flipX: brushFlipX,
          flipY: brushFlipY,
          pattern: g.patternId!,
          tileSize: g.patternTileSize!,
          foreground: brushColor(color),
          background: brushColor(backgroundColor),
        }) || Boolean(g.changed);
      void paint(g.frame, { [g.layer!.id]: g.buffer });
      g.last = local;
      return;
    }
    if (g.tool === 'red-eye' && g.buffer) {
      redEyeCanvasStroke(g.buffer, g.last, local, {
        radius: localSize(g.layer!.matrix, size) / 2,
        threshold: g.redEyeThreshold ?? 36,
        amount: (g.redEyeAmount ?? 100) / 100,
      });
      void paint(g.frame, { [g.layer!.id]: g.buffer });
      g.last = local;
      return;
    }
    if (g.tool === 'quick-selection') {
      const points = g.points || (g.points = [g.start]);
      if (Math.hypot(p.x - g.last.x, p.y - g.last.y) >= 1) points.push(p);
      if (!g.quickSelectionSource) {
        (g.queued || (g.queued = [])).push({
          x: p.x,
          y: p.y,
          pressure: g.lastPressure,
          pointerType: g.pointerType,
        });
        g.last = p;
        return;
      }
      g.quickSelectionMask = quickSelectionMask(g.quickSelectionSource, {
        width: g.frame.w,
        height: g.frame.h,
        size: g.quickSelectionSize ?? size,
        tolerance: g.quickSelectionTolerance ?? colorTolerance,
        opacity: g.quickSelectionOpacity ?? brushOpacity / 100,
        points,
      });
      g.changed = g.quickSelectionMask.some((value) => value > 0);
      selectionBrushPreview(g);
      g.last = p;
      g.moved = true;
      return;
    }
    if (g.tool === 'selection-brush') {
      const points = g.points || (g.points = [g.start]);
      if (Math.hypot(p.x - g.last.x, p.y - g.last.y) >= 1) points.push(p);
      if (!g.selectionBrushMask) {
        (g.queued || (g.queued = [])).push({
          x: p.x,
          y: p.y,
          pressure: g.lastPressure,
          pointerType: g.pointerType,
        });
        g.last = p;
        return;
      }
      const result = paintSelectionBrushSegment(g.selectionBrushMask, {
        width: g.frame.w,
        height: g.frame.h,
        x1: g.last.x,
        y1: g.last.y,
        x2: p.x,
        y2: p.y,
        size: g.selectionBrushSize ?? size,
        hardness: g.selectionBrushHardness ?? hardness,
        opacity: g.selectionBrushOpacity ?? brushOpacity / 100,
        pressure: g.lastPressure,
        pressureSize: g.selectionBrushPressureSize ?? pressureSize,
        pressureOpacity: g.selectionBrushPressureOpacity ?? pressureOpacity,
      });
      g.selectionBrushMask = result.mask;
      g.changed = Boolean(g.changed || result.changed);
      selectionBrushPreview(g);
      g.last = p;
      return;
    }
    if (
      g.tool === 'background-eraser' &&
      g.buffer &&
      g.source &&
      g.replaceTarget
    ) {
      eraseBackgroundStroke(
        g.source,
        g.buffer,
        g.replaceTarget,
        g.last.x,
        g.last.y,
        local.x,
        local.y,
        localSize(g.layer!.matrix, size),
        colorTolerance,
        brushOpacity / 100,
      );
      void paint(g.frame, { [g.layer!.id]: g.buffer });
      g.last = local;
      return;
    }
    if (g.tool === 'smudge' && !g.buffer) {
      (g.queued || (g.queued = [])).push({
        ...local,
        pressure: g.lastPressure,
        pointerType: g.pointerType,
      });
    }
    if (g.tool === 'smudge' && g.buffer && g.source) {
      const changed = smudgeCanvasSegment(g.source, g.buffer, g.last, local, {
        size: localSize(g.layer!.matrix, size),
        hardness,
        flow: brushOpacity / 100,
        selectionMask: g.selectionMask,
      });
      g.changed = Boolean(g.changed || changed);
      void paint(g.frame, { [g.layer!.id]: g.buffer });
      g.last = local;
      return;
    }
    if (g.tool === 'mixer-brush' || g.tool === 'history-brush') {
      if (!g.buffer || !g.sourcePixels || !g.layer) {
        (g.queued || (g.queued = [])).push({ ...local, pressure: pressure(e), pointerType: e.pointerType });
        return;
      }
      const nextPoint = { x: local.x, y: local.y, pressure: pressure(e) };
      const destination = new Uint8ClampedArray(g.buffer.getContext('2d')!.getImageData(0, 0, g.buffer.width, g.buffer.height).data);
      const next = g.tool === 'mixer-brush'
        ? applyMixerBrushPixels(destination, g.sourcePixels, g.buffer.width, g.buffer.height, [nextPoint], {
            ...mixerBrush,
            size: localSize(g.layer.matrix, size),
            hardness,
          }, g.selectionMask)
        : applyHistoryBrushPixels(destination, g.sourcePixels, g.buffer.width, g.buffer.height, [nextPoint], {
            ...historyBrush,
            size: localSize(g.layer.matrix, size),
            hardness,
          }, g.selectionMask);
      g.buffer.getContext('2d')!.putImageData(new ImageData(next as unknown as Uint8ClampedArray<ArrayBuffer>, g.buffer.width, g.buffer.height), 0, 0);
      g.brushPoints = [...(g.brushPoints || []), nextPoint];
      g.moved = true;
      g.last = local;
      void paint(g.frame, { [g.layer.id]: g.buffer });
      return;
    }
    if (g.tool === 'background-eraser' && !g.buffer) {
      (g.queued || (g.queued = [])).push({
        ...local,
        pressure: g.lastPressure,
        pointerType: g.pointerType,
      });
    }
    if (
      (g.tool === 'dodge' || g.tool === 'burn' || g.tool === 'sponge') &&
      !g.buffer
    ) {
      (g.queued || (g.queued = [])).push({
        ...local,
        pressure: g.lastPressure,
        pointerType: g.pointerType,
      });
    }
    if (
      (g.tool === 'dodge' || g.tool === 'burn' || g.tool === 'sponge') &&
      g.buffer &&
      g.source
    ) {
      const changed = tonalCanvasSegment(g.source, g.buffer, g.last, local, {
        size: localSize(g.layer!.matrix, size),
        hardness,
        exposure: tonalExposure,
        flow: brushOpacity / 100,
        range: tonalRange,
        mode: g.tool,
        spongeMode,
        spongeVibrance,
        selectionMask: g.selectionMask,
      });
      g.changed = Boolean(g.changed || changed);
      void paint(g.frame, { [g.layer!.id]: g.buffer });
      g.last = local;
      return;
    }
    if ((g.tool === 'clone' || g.tool === 'heal') && !g.buffer) {
      (g.queued || (g.queued = [])).push({
        ...local,
        pressure: g.lastPressure,
        pointerType: g.pointerType,
      });
    }
    if (g.tool === 'pattern-stamp' && !g.buffer) {
      (g.queued || (g.queued = [])).push({
        ...local,
        pressure: g.lastPressure,
        pointerType: g.pointerType,
      });
    }
    if (g.tool === 'red-eye' && !g.buffer) {
      (g.queued || (g.queued = [])).push({
        ...local,
        pressure: g.lastPressure,
        pointerType: g.pointerType,
      });
    }
    if (
      g.tool === 'color-replace' &&
      g.buffer &&
      g.source &&
      g.replaceTarget &&
      g.layer
    ) {
      replaceColorStroke(
        g.source,
        g.buffer,
        g.replaceTarget,
        g.last.x,
        g.last.y,
        local.x,
        local.y,
        color,
        size,
        colorTolerance,
        brushOpacity / 100,
      );
      void paint(g.frame, { [g.layer.id]: g.buffer });
      g.last = local;
      return;
    }
    if (g.tool === 'move' && g.layer) {
      const matrix = [...g.layer.matrix] as Matrix;
      matrix[4] += p.x - g.start.x;
      matrix[5] += p.y - g.start.y;
      void paint({
        ...g.frame,
        layers: g.frame.layers.map((l) =>
          l.id === g.layer!.id ? { ...l, matrix } : l,
        ),
      });
    } else if (
      (g.tool === 'brush' || g.tool === 'pencil' || g.tool === 'eraser') &&
      g.buffer &&
      g.layer
    ) {
      stampCanvasSegment(g.buffer, g.last, local, {
        size: localSize(g.layer.matrix, size),
        hardness: g.tool === 'pencil' ? 100 : hardness,
        opacity: brushOpacity / 100,
        pointerType: g.pointerType,
        pressure: g.lastPressure,
        pressureSize: g.tool !== 'pencil' && pressureSize,
        pressureOpacity: g.tool !== 'pencil' && pressureOpacity,
        spacing: brushSpacing,
        angle: brushAngle,
        roundness: g.tool === 'pencil' ? 100 : brushRoundness,
        flipX: brushFlipX,
        flipY: brushFlipY,
        mode: g.tool === 'eraser' ? 'destination-out' : 'source-over',
        color: g.tool === 'eraser' ? undefined : brushColor(color),
      });
      void paint(g.frame, { [g.layer.id]: g.buffer });
    } else if (
      g.tool === 'rectangle' ||
      g.tool === 'ellipse' ||
      g.tool === 'line' ||
      g.tool === 'polygon'
    ) {
      const width = Math.abs(p.x - g.start.x),
        height = Math.abs(p.y - g.start.y);
      const layer: Layer =
        g.tool === 'line'
          ? {
              ...commonLayer('Line'),
              kind: 'line',
              width: Math.max(1, width),
              height: Math.max(1, height),
              stroke: Math.max(1, size / 3),
              color,
              matrix: [
                1,
                0,
                0,
                1,
                Math.min(p.x, g.start.x),
                Math.min(p.y, g.start.y),
              ],
            }
          : ({
              ...commonLayer(g.tool === 'polygon' ? 'Polygon' : 'Shape'),
              kind:
                g.tool === 'ellipse'
                  ? 'ellipse'
                  : g.tool === 'polygon'
                    ? 'polygon'
                    : 'rectangle',
              width: Math.max(1, width),
              height: Math.max(1, height),
              stroke: Math.max(1, size / 3),
              color,
              ...(g.tool === 'polygon' ? { sides: 5 } : { fill: false }),
              matrix: [
                1,
                0,
                0,
                1,
                Math.min(p.x, g.start.x),
                Math.min(p.y, g.start.y),
              ],
            } as Layer);
      const context = canvas.current!.getContext('2d')!;
      context.save();
      context.strokeStyle = color;
      context.lineWidth = Math.max(1, size / 3);
      context.setLineDash([8, 5]);
      context.beginPath();
      if (g.tool === 'line') {
        context.moveTo(g.start.x, g.start.y);
        context.lineTo(p.x, p.y);
      } else if (g.tool === 'polygon') {
        const left = Math.min(g.start.x, p.x),
          top = Math.min(g.start.y, p.y),
          cx = left + width / 2,
          cy = top + height / 2,
          rx = Math.max(1, width / 2),
          ry = Math.max(1, height / 2);
        for (let i = 0; i < 5; i += 1) {
          const angle = -Math.PI / 2 + (i * Math.PI * 2) / 5,
            x = cx + Math.cos(angle) * rx,
            y = cy + Math.sin(angle) * ry;
          if (i === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.closePath();
      } else if (g.tool === 'ellipse') {
        context.ellipse(
          Math.min(p.x, g.start.x) + width / 2,
          Math.min(p.y, g.start.y) + height / 2,
          width / 2,
          height / 2,
          0,
          0,
          Math.PI * 2,
        );
      } else
        context.rect(
          Math.min(p.x, g.start.x),
          Math.min(p.y, g.start.y),
          width,
          height,
        );
      context.stroke();
      context.restore();
      void paint({ ...g.frame, layers: [...g.frame.layers, layer] });
    } else if (g.tool === 'select' || g.tool === 'ellipse-select') {
      void paint(g.frame).then(() => {
        if (gesture.current !== g) return;
        const c = canvas.current!,
          x = c.getContext('2d')!;
        x.save();
        x.strokeStyle = '#fff';
        x.lineWidth = 2;
        x.setLineDash([8, 5]);
        const left = Math.min(g.start.x, p.x),
          top = Math.min(g.start.y, p.y),
          width = Math.abs(p.x - g.start.x),
          height = Math.abs(p.y - g.start.y);
        if (g.tool === 'ellipse-select') {
          x.beginPath();
          x.ellipse(
            left + width / 2,
            top + height / 2,
            width / 2,
            height / 2,
            0,
            0,
            Math.PI * 2,
          );
          x.stroke();
        } else x.strokeRect(left, top, width, height);
        x.restore();
      });
    } else if (g.tool === 'lasso') {
      const points = g.points || (g.points = [g.start]);
      if (Math.hypot(p.x - g.last.x, p.y - g.last.y) >= 2) points.push(p);
      void paint(g.frame).then(() => {
        if (gesture.current !== g) return;
        const x = canvas.current!.getContext('2d')!;
        x.save();
        x.strokeStyle = '#fff';
        x.lineWidth = 2;
        x.setLineDash([8, 5]);
        x.beginPath();
        x.moveTo(points[0].x, points[0].y);
        for (const point of points.slice(1)) x.lineTo(point.x, point.y);
        x.stroke();
        x.restore();
      });
    } else if (g.tool === 'magnetic-lasso') {
      const points = g.points || (g.points = [g.start]);
      if (!g.magneticData) {
        const pending = g.magneticPendingPoints || [];
        // Keep enough of a fast drag to reconstruct a useful polygon after
        // the asynchronous layer sample completes, while bounding memory for
        // a stalled render on very high-frequency pointer devices.
        g.magneticPendingPoints =
          pending.length < 512 ? [...pending, p] : [...pending.slice(1), p];
        return;
      }
      const snapped = snapMagneticPoint(
        g.magneticData,
        g.frame.w,
        g.frame.h,
        p,
        g.magneticRadius ?? 12,
      );
      if (Math.hypot(snapped.x - g.last.x, snapped.y - g.last.y) >= 2) {
        points.push(snapped);
        g.moved = true;
        g.last = snapped;
      }
      void paint(g.frame).then(() => {
        if (gesture.current !== g) return;
        const x = canvas.current!.getContext('2d')!;
        x.save();
        x.strokeStyle = '#fff';
        x.lineWidth = 2;
        x.setLineDash([8, 5]);
        x.beginPath();
        x.moveTo(points[0].x, points[0].y);
        for (const point of points.slice(1)) x.lineTo(point.x, point.y);
        x.stroke();
        x.restore();
      });
    } else if (g.tool === 'polygonal-lasso') {
      const points = g.points || (g.points = [g.start]);
      void paint(g.frame).then(() => {
        if (gesture.current !== g) return;
        const x = canvas.current!.getContext('2d')!;
        x.save();
        x.strokeStyle = '#fff';
        x.lineWidth = 2;
        x.setLineDash([8, 5]);
        x.beginPath();
        x.moveTo(points[0].x, points[0].y);
        for (const point of points.slice(1)) x.lineTo(point.x, point.y);
        x.lineTo(p.x, p.y);
        x.stroke();
        x.restore();
      });
    } else if (g.tool === 'crop') {
      const c = canvas.current!,
        x = c.getContext('2d')!;
      void paint(g.frame).then(() => {
        if (gesture.current !== g) return;
        x.save();
        x.strokeStyle = '#ffffff';
        x.lineWidth = 2;
        x.setLineDash([10, 6]);
        x.strokeRect(g.start.x, g.start.y, p.x - g.start.x, p.y - g.start.y);
        x.restore();
      });
    } else if (g.tool === 'perspective-crop') {
      const c = canvas.current!,
        x = c.getContext('2d')!;
      void paint(g.frame).then(() => {
        if (gesture.current !== g) return;
        const left = Math.min(g.start.x, p.x),
          top = Math.min(g.start.y, p.y),
          right = Math.max(g.start.x, p.x),
          bottom = Math.max(g.start.y, p.y),
          insetX = Math.max(0, (right - left) * 0.08),
          insetY = Math.max(0, (bottom - top) * 0.08);
        x.save();
        x.strokeStyle = '#ffb099';
        x.lineWidth = 2;
        x.setLineDash([10, 6]);
        x.beginPath();
        x.moveTo(left + insetX, top);
        x.lineTo(right - insetX, top + insetY);
        x.lineTo(right, bottom - insetY);
        x.lineTo(left, bottom);
        x.closePath();
        x.stroke();
        x.restore();
      });
    } else if (g.tool === 'slice') {
      const c = canvas.current!,
        x = c.getContext('2d')!;
      void paint(g.frame).then(() => {
        if (gesture.current !== g) return;
        x.save();
        x.strokeStyle = '#7dd3fc';
        x.lineWidth = 2;
        x.setLineDash([8, 5]);
        x.strokeRect(g.start.x, g.start.y, p.x - g.start.x, p.y - g.start.y);
        x.restore();
      });
    } else if (g.tool === 'frame') {
      const c = canvas.current!,
        x = c.getContext('2d')!;
      void paint(g.frame).then(() => {
        if (gesture.current !== g) return;
        x.save();
        x.strokeStyle = '#c084fc';
        x.lineWidth = 2;
        x.setLineDash([10, 5]);
        x.strokeRect(g.start.x, g.start.y, p.x - g.start.x, p.y - g.start.y);
        x.restore();
      });
    }
    g.last = g.layer?.kind === 'raster' || g.layer?.kind === 'path' ? local : p;
  };
  const pointerUp = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    const completedPaint = paintSpan.current;
    paintSpan.current = null;
    completedPaint?.finish();
    if (quickMaskGesture.current) {
      const mask = quickMaskRef.current;
      const canceledGesture = quickMaskGesture.current;
      quickMaskGesture.current = null;
      if (mask && e.type !== 'pointercancel') {
        const asset = persistQuickMask(mask);
        if (asset)
          void paint({ ...current(), quickMask: { asset, active: true } }).then(
            () => drawQuickMaskOverlay(mask),
          );
      } else if (mask) {
        const restored = createQuickMask(
          mask.width,
          mask.height,
          canceledGesture.before,
        );
        quickMaskRef.current = restored;
        setQuickMask(restored);
        void paint(current()).then(() => drawQuickMaskOverlay(restored));
        setNotice('Quick Mask stroke cancelled');
      }
      return;
    }
    const g = gesture.current;
    if (!g) return;
    if (g.tool === 'polygonal-lasso') {
      if (e.type === 'pointercancel') {
        gesture.current = null;
        void paint(current());
        setNotice('Polygonal lasso cancelled');
      }
      // A polygonal lasso remains active after each click. It is finalized by
      // clicking its first vertex or by the double-click handler below.
      return;
    }
    if (g.tool === 'magnetic-lasso') {
      await g.pending;
      if (gesture.current !== g) return;
      if (e.type === 'pointercancel') {
        gesture.current = null;
        void paint(current());
        setNotice('Magnetic Lasso cancelled');
      } else if (!g.moved) {
        // A tap only arms the tool. Keep the gesture alive so Escape can
        // cancel it, matching Photoshop's staged lasso interaction on touch.
        void paint(g.frame);
        setNotice('Magnetic Lasso: drag along an edge, release to close');
      } else {
        gesture.current = null;
        finishPolygonalLasso(g);
        setNotice('Magnetic selection created');
      }
      return;
    }
    if (g.tool === 'freeform-pen') {
      if (e.type === 'pointercancel') {
        gesture.current = null;
        void paint(current());
        setNotice('Freeform Pen cancelled');
      } else {
        gesture.current = null;
        finishFreeformPath(g);
      }
      return;
    }
    if (g.tool === 'pen') {
      if (e.type === 'pointercancel') {
        gesture.current = null;
        void paint(current());
        setNotice('Pen path cancelled');
      } else if (g.points?.length) {
        // A pointer-up ends one click, while the path remains active until the
        // first node is clicked again or Escape is pressed.
        previewPenPath(g);
      }
      return;
    }
    if (g.tool === 'curvature-pen') {
      if (e.type === 'pointercancel') {
        gesture.current = null;
        void paint(current());
        setNotice('Curvature Pen path cancelled');
      } else if (g.points?.length) {
        previewCurvaturePath(g);
      }
      return;
    }
    const p = point(e),
      f = g.frame;
    const local =
      g.layer?.kind === 'raster' || g.layer?.kind === 'path'
        ? inversePoint(g.layer.matrix, p) || p
        : p;
    await g.pending;
    if (gesture.current !== g) return;
    gesture.current = null;
    const latest = current(),
      latestLayer = g.layer
        ? latest.layers.find((layer) => layer.id === g.layer!.id)
        : undefined;
    if (latest !== f || (g.layer && latestLayer !== g.layer)) {
      if (g.tool === 'ruler') setMeasurementPreview(null);
      discardPreviewAsset(assets.current, g.maskPreviewAsset);
      void paint(latest);
      setNotice('Gesture cancelled because the document changed');
      return;
    }
    if (e.type === 'pointercancel') {
      if (g.tool === 'rotate-view')
        setViewRotation(normalizeViewRotation(g.viewRotationStart ?? 0));
      if (g.tool === 'ruler') setMeasurementPreview(null);
      discardPreviewAsset(assets.current, g.maskPreviewAsset);
      void paint(current());
      setNotice('Gesture cancelled');
      return;
    }
    if (g.tool === 'rotate-view') {
      setNotice(`Rotate View: ${normalizeViewRotation(viewRotation)}°`);
      return;
    }
    if (g.tool === 'quick-selection' && g.quickSelectionSource) {
      if (g.points && g.points.length) {
        g.quickSelectionMask = quickSelectionMask(g.quickSelectionSource, {
          width: f.w,
          height: f.h,
          size: g.quickSelectionSize ?? size,
          tolerance: g.quickSelectionTolerance ?? colorTolerance,
          opacity: g.quickSelectionOpacity ?? brushOpacity / 100,
          points: g.points,
        });
      }
      const mask = g.quickSelectionMask;
      if (!mask || !mask.some((value) => value > 0)) {
        void paint(f);
        setNotice('No Quick Selection change applied');
        return;
      }
      const composed = combineSelectionBrushMasks(
        g.quickSelectionBase,
        mask,
        g.quickSelectionOperation ?? selectionOperation,
      );
      const sameAsExisting =
        g.quickSelectionExisting &&
        g.quickSelectionExisting.length === composed.mask.length &&
        g.quickSelectionExisting.every((value, index) => value === composed.mask[index]);
      if (!composed.changed || sameAsExisting) {
        void paint(f);
        setNotice('No Quick Selection change applied');
        return;
      }
      const selectionMask = createQuickMask(f.w, f.h, composed.mask),
        maskId = quickMaskAsset(selectionMask),
        selection: Selection = {
          shape: 'rectangle',
          x: 0,
          y: 0,
          w: f.w,
          h: f.h,
          feather: 0,
          inverted: false,
          mask: maskId,
        };
      if (commit({ ...f, selection }))
        setNotice(`Quick Selection created (tolerance ${g.quickSelectionTolerance ?? colorTolerance})`);
      return;
    }
    if (
      (g.tool === 'mask-brush' ||
        g.tool === 'mask-eraser' ||
        g.tool === 'adjustment-brush') &&
      g.layer &&
      isMaskableLayer(g.layer) &&
      g.maskBuffer &&
      g.maskRefinementStroke
    ) {
      if (g.moved && (g.last.x !== p.x || g.last.y !== p.y)) {
        const finalPoint = {
          x: p.x,
          y: p.y,
          pressure: g.lastPressure ?? pressure(e),
        };
        if (
          g.maskRefinementStroke.points.length < MASK_REFINEMENT_MAX_POINTS
        ) {
          const from = g.maskRefinementStroke.points[
            g.maskRefinementStroke.points.length - 1
          ];
          g.maskRefinementStroke.points.push(finalPoint);
          g.changed = refineMaskCanvas(g.maskBuffer, {
            ...g.maskRefinementStroke,
            points: [from, finalPoint],
          }) || Boolean(g.changed);
        }
      }
      if (!g.changed) {
        discardPreviewAsset(assets.current, g.maskPreviewAsset);
        void paint(f);
        setNotice('No mask refinement change applied');
        return;
      }
      const mask = addAsset(assets.current, g.maskBuffer),
        changed = commit({
          ...f,
          layers: f.layers.map((item) =>
            item.id === g.layer!.id
              ? {
                  ...item,
                  mask,
                  maskEnabled: true,
                  maskInverted: false,
                }
              : item,
          ),
        });
      if (g.maskPreviewAsset && g.maskPreviewAsset !== mask)
        discardPreviewAsset(assets.current, g.maskPreviewAsset);
      if (changed)
        setNotice(
            g.tool === 'adjustment-brush'
              ? 'Adjustment Brush applied to the adjustment mask'
              : g.maskRefinementStroke.mode === 'reveal'
                ? 'Mask Brush revealed masked pixels'
                : 'Mask Eraser concealed pixels',
        );
      return;
    }
    if (g.tool === 'ruler') {
      setMeasurementPreview(null);
      if (!g.moved || measurementDistance(g.start, p) < 1) {
        void paint(f);
        setNotice('Ruler needs a drag of at least one pixel');
        return;
      }
      const pixels = measurementDistance(g.start, p);
      if (
        appendMeasurement({
          id: newMeasurementId(),
          kind: 'ruler',
          start: g.start,
          end: p,
          pixels,
          angle: measurementAngle(g.start, p),
        })
      )
        setNotice(
          `Ruler: ${formatMeasurement(pixels, measurementAngle(g.start, p))}`,
        );
      return;
    }
    if (
      g.tool === 'direct-select' &&
      g.layer?.kind === 'path' &&
      g.pathIndex !== undefined &&
      g.pathOrigin
    ) {
      if (!g.moved) {
        void paint(f);
        return;
      }
      const moved = g.pathHandle
        ? movePathHandle(g.pathOrigin, g.pathIndex, g.pathHandle, local.x, local.y)
        : movePathNode(g.pathOrigin, g.pathIndex, local.x, local.y);
      if (
        commit({
          ...f,
          layers: f.layers.map((item) =>
            item.id === g.layer!.id ? { ...item, path: moved } : item,
          ),
        })
      )
        setNotice(g.pathHandle ? 'Path handle moved' : 'Path node moved');
    } else if (g.tool === 'move' && g.layer && g.moved) {
      const matrix = [...g.layer.matrix] as Matrix;
      matrix[4] += p.x - g.start.x;
      matrix[5] += p.y - g.start.y;
      const changed = commit({
        ...f,
        layers: f.layers.map((l) =>
          l.id === g.layer!.id ? { ...l, matrix } : l,
        ),
      });
      if (changed) setNotice('Layer moved');
    } else if (g.tool === 'spot-heal' && g.layer?.kind === 'raster' && g.spotHealingStroke) {
      const stroke = g.spotHealingStroke;
      if (commit({
        ...f,
        layers: f.layers.map((item) => item.id === g.layer!.id
          ? { ...item, spotHealing: [...(item.spotHealing ?? []), stroke] }
          : item),
      })) setNotice('Spot Healing applied nondestructively');
    } else if (g.tool === 'patch' && g.layer?.kind === 'raster' && g.patchStroke) {
      const stroke = g.patchStroke;
      if (!g.moved) {
        void paint(f);
        setNotice('Patch needs a drag after setting a source');
        return;
      }
      if (commit({
        ...f,
        layers: f.layers.map((item) => item.id === g.layer!.id
          ? { ...item, patchStrokes: [...(item.patchStrokes ?? []), stroke] }
          : item),
      })) setNotice('Patch applied nondestructively');
    } else if (
      (g.tool === 'brush' || g.tool === 'pencil' || g.tool === 'eraser') &&
      g.buffer &&
      g.layer
    ) {
      g.lastPressure = g.lastPressure ?? 1;
      g.pointerType = g.pointerType || e.pointerType;
      if (g.moved && (g.last.x !== local.x || g.last.y !== local.y))
        stampCanvasSegment(g.buffer, g.last, local, {
          size: localSize(g.layer.matrix, size),
          hardness: g.tool === 'pencil' ? 100 : hardness,
          opacity: brushOpacity / 100,
          pointerType: g.pointerType,
          pressure: g.lastPressure,
          pressureSize: g.tool !== 'pencil' && pressureSize,
          pressureOpacity: g.tool !== 'pencil' && pressureOpacity,
          spacing: brushSpacing,
          angle: brushAngle,
          roundness: g.tool === 'pencil' ? 100 : brushRoundness,
          flipX: brushFlipX,
          flipY: brushFlipY,
          mode: g.tool === 'eraser' ? 'destination-out' : 'source-over',
          color: g.tool === 'eraser' ? undefined : brushColor(color),
        });
      const asset = addAsset(assets.current, g.buffer);
      const changed = commit({
        ...f,
        layers: f.layers.map((l) =>
          l.id === g.layer!.id ? ({ ...l, kind: 'raster', asset } as Layer) : l,
        ),
      });
      if (changed) setNotice('Paint layer updated');
    } else if (
      (g.tool === 'mask-brush' ||
        g.tool === 'mask-eraser' ||
        g.tool === 'adjustment-brush') &&
      g.layer &&
      isMaskableLayer(g.layer) &&
      g.maskBuffer &&
      g.maskRefinementStroke
    ) {
      if (!g.changed) {
        void paint(f);
        setNotice('Mask refinement made no change');
        return;
      }
      const asset = addAsset(assets.current, g.maskBuffer),
        changed = commit({
          ...f,
          layers: f.layers.map((item) =>
            item.id === g.layer!.id
              ? {
                  ...item,
                  mask: asset,
                  maskEnabled: item.maskEnabled !== false,
                  maskInverted: item.maskInverted === true,
                }
              : item,
          ),
        });
      if (changed)
        setNotice(
          g.tool === 'adjustment-brush'
            ? 'Adjustment Brush applied to the adjustment mask'
            : g.tool === 'mask-brush'
              ? 'Mask Brush revealed masked pixels'
              : 'Mask Eraser concealed pixels',
        );
    } else if (
      (g.tool === 'rectangle' ||
        g.tool === 'ellipse' ||
        g.tool === 'line' ||
        g.tool === 'polygon') &&
      g.moved
    ) {
      const width = Math.max(1, Math.round(Math.abs(p.x - g.start.x))),
        height = Math.max(1, Math.round(Math.abs(p.y - g.start.y))),
        matrix = [
          1,
          0,
          0,
          1,
          Math.min(p.x, g.start.x),
          Math.min(p.y, g.start.y),
        ] as Matrix;
      addLayer(
        g.tool === 'line'
          ? {
              ...commonLayer('Line ' + f.layers.length),
              kind: 'line',
              width,
              height,
              stroke: Math.max(1, size / 3),
              color,
              matrix,
            }
          : ({
              ...commonLayer(
                (g.tool === 'polygon' ? 'Polygon ' : 'Shape ') +
                  f.layers.length,
              ),
              kind:
                g.tool === 'ellipse'
                  ? 'ellipse'
                  : g.tool === 'polygon'
                    ? 'polygon'
                    : 'rectangle',
              width,
              height,
              stroke: Math.max(1, size / 3),
              color,
              fill: false,
              ...(g.tool === 'polygon' ? { sides: 5 } : {}),
              matrix,
            } as Layer),
      );
    } else if (
      (g.tool === 'select' || g.tool === 'ellipse-select') &&
      g.moved
    ) {
      const x = Math.max(0, Math.min(g.start.x, p.x)),
        y = Math.max(0, Math.min(g.start.y, p.y)),
        w = Math.min(f.w - x, Math.abs(p.x - g.start.x)),
        h = Math.min(f.h - y, Math.abs(p.y - g.start.y));
      if (w > 0 && h > 0)
        mergeSelection({
          shape: g.tool === 'ellipse-select' ? 'ellipse' : 'rectangle',
          x,
          y,
          w,
          h,
          feather: 0,
          inverted: false,
        });
      else void paint(f);
    } else if (g.tool === 'lasso' && g.moved) {
      const points = g.points || [];
      if (points.length >= 3) {
        const x = Math.max(0, Math.min(...points.map((point) => point.x))),
          y = Math.max(0, Math.min(...points.map((point) => point.y))),
          right = Math.min(f.w, Math.max(...points.map((point) => point.x))),
          bottom = Math.min(f.h, Math.max(...points.map((point) => point.y)));
        mergeSelection({
          shape: 'polygon',
          x,
          y,
          w: right - x,
          h: bottom - y,
          points,
          feather: 0,
          inverted: false,
        });
      } else void paint(f);
    } else if (g.tool === 'crop' && g.moved) {
      try {
        const plan = planRectangularCrop(f.w, f.h, g.start, p);
        // Keep the source frame and history untouched until the user confirms
        // the crop.  This makes accidental touch drags recoverable and keeps
        // export/undo semantics identical to every other committed edit.
        cropPreviewId.current += 1;
        setCropPreview({ frame: f, ...plan });
        void paint(f);
        setNotice(
          `Crop preview: ${plan.width} × ${plan.height} px · press Enter to apply`,
        );
      } catch {
        void paint(f);
        setNotice('Crop needs at least one pixel inside the image');
      }
    } else if (g.tool === 'perspective-crop' && g.moved) {
      try {
        const left = Math.max(0, Math.min(g.start.x, p.x)),
          top = Math.max(0, Math.min(g.start.y, p.y)),
          right = Math.min(f.w, Math.max(g.start.x, p.x)),
          bottom = Math.min(f.h, Math.max(g.start.y, p.y)),
          insetX = Math.max(1, (right - left) * 0.08),
          insetY = Math.max(1, (bottom - top) * 0.08),
          quad: CropQuad = [
            { x: left + insetX, y: top },
            { x: right - insetX, y: top + insetY },
            { x: right, y: bottom - insetY },
            { x: left, y: bottom },
          ],
          plan = planPerspectiveCrop(f.w, f.h, { quad });
        perspectiveCropPreviewId.current += 1;
        setPerspectiveCropPreview({ frame: f, ...plan });
        void paint(f);
        setNotice(
          `Perspective crop preview: ${plan.width} × ${plan.height} px · edit corners or press Enter to apply`,
        );
      } catch {
        void paint(f);
        setNotice('Perspective crop needs a convex selection inside the image');
      }
    } else if (g.tool === 'slice' && g.moved) {
      try {
        const crop = planRectangularCrop(f.w, f.h, g.start, p),
          [slice] = planSlices(f.w, f.h, [
            {
            id: `slice-${slicePreviewId.current + 1}`,
            name: sliceName,
            x: crop.left,
            y: crop.top,
            width: crop.width,
            height: crop.height,
            },
          ]).slices;
        slicePreviewId.current += 1;
        setSlicePreview({ frame: f, ...slice });
        setSliceName(slice.name);
        void paint(f);
        setNotice(
          `Slice preview: ${slice.width} × ${slice.height} px · name it and download`,
        );
      } catch {
        void paint(f);
        setNotice('Slice needs at least one pixel inside the image');
      }
    } else if (g.tool === 'frame' && g.moved) {
      try {
        const crop = planRectangularCrop(f.w, f.h, g.start, p);
        setFramePreview({ frame: f, x: crop.left, y: crop.top, width: crop.width, height: crop.height });
        setFrameName(`Artboard ${(f.artboards?.length || 0) + 1}`);
        setFrameBackground(backgroundColor);
        void paint(f);
        setNotice(`Frame preview: ${crop.width} × ${crop.height} px · name and add artboard`);
      } catch {
        void paint(f);
        setNotice('Frame needs at least one pixel inside the image');
      }
    } else if (g.tool === 'frame') {
      void paint(f);
      setNotice('Frame needs a drag of at least one pixel');
    } else if (g.tool === 'gradient' && g.moved && g.layer) {
      try {
        if (g.layer.kind !== 'raster') return;
        const image = await decodeAsset(assets.current[g.layer.asset]),
          buffer = surface(image.naturalWidth, image.naturalHeight);
        buffer.getContext('2d')!.drawImage(image, 0, 0);
        const context = buffer.getContext('2d')!,
          gradient = context.createLinearGradient(
            g.start.x,
            g.start.y,
            local.x,
            local.y,
          );
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, '#ffffff00');
        context.fillStyle = gradient;
        context.fillRect(0, 0, buffer.width, buffer.height);
        const asset = addAsset(assets.current, buffer);
        if (
          commit({
            ...f,
            layers: f.layers.map((item) =>
              item.id === g.layer!.id ? { ...item, asset } : item,
            ),
          })
        )
          setNotice('Gradient applied; undo restores the original pixels');
      } catch {
        setNotice('Could not apply gradient');
      }
    } else if (
      (g.tool === 'mixer-brush' || g.tool === 'history-brush') &&
      g.buffer &&
      g.layer
    ) {
      const asset = addAsset(assets.current, g.buffer);
      if (commit({
        ...f,
        layers: f.layers.map((item) => item.id === g.layer!.id ? { ...item, asset } : item),
      })) {
        const label = g.tool === 'mixer-brush' ? 'Mixer Brush stroke applied' :
          `History Brush restored source ${typeof g.historySourceIndex === 'number' ? g.historySourceIndex + 1 : index.current + 1}`;
        setNotice(label);
      }
    } else if (
      (g.tool === 'clone' || g.tool === 'heal') &&
      g.buffer &&
      g.layer
    ) {
      const asset = addAsset(assets.current, g.buffer);
      if (
        commit({
          ...f,
          layers: f.layers.map((item) =>
            item.id === g.layer!.id ? { ...item, asset } : item,
          ),
        })
      )
        setNotice(
          g.tool === 'heal' ? 'Healing stroke applied' : 'Clone stroke applied',
        );
    } else if (g.tool === 'pattern-stamp' && g.buffer && g.layer) {
      if (g.moved && (g.last.x !== local.x || g.last.y !== local.y))
        g.changed =
          patternCanvasSegment(g.buffer, g.last, local, {
            size: localSize(g.layer.matrix, size),
            hardness,
            opacity: brushOpacity / 100,
            pointerType: g.pointerType || e.pointerType,
            pressure: g.lastPressure ?? pressure(e),
            pressureSize,
            pressureOpacity,
            spacing: brushSpacing,
            angle: brushAngle,
            roundness: brushRoundness,
            flipX: brushFlipX,
            flipY: brushFlipY,
            pattern: g.patternId!,
            tileSize: g.patternTileSize!,
            foreground: brushColor(color),
            background: brushColor(backgroundColor),
          }) || Boolean(g.changed);
      if (!g.changed) {
        void paint(f);
        setNotice('No Pattern Stamp change applied');
        return;
      }
      const asset = addAsset(assets.current, g.buffer);
      if (
        commit({
          ...f,
          layers: f.layers.map((item) =>
            item.id === g.layer!.id ? { ...item, asset } : item,
          ),
        })
      )
        setNotice('Pattern Stamp stroke applied');
    } else if (g.tool === 'selection-brush' && g.selectionBrushMask) {
      if (g.moved && (g.last.x !== p.x || g.last.y !== p.y)) {
        const finalSegment = paintSelectionBrushSegment(g.selectionBrushMask, {
          width: f.w,
          height: f.h,
          x1: g.last.x,
          y1: g.last.y,
          x2: p.x,
          y2: p.y,
          size: g.selectionBrushSize ?? size,
          hardness: g.selectionBrushHardness ?? hardness,
          opacity: g.selectionBrushOpacity ?? brushOpacity / 100,
          pressure: g.lastPressure ?? pressure(e),
          pressureSize: g.selectionBrushPressureSize ?? pressureSize,
          pressureOpacity: g.selectionBrushPressureOpacity ?? pressureOpacity,
        });
        g.selectionBrushMask = finalSegment.mask;
        g.changed = Boolean(g.changed || finalSegment.changed);
      }
      if (!g.changed) {
        void paint(f);
        setNotice('No Selection Brush change applied');
        return;
      }
      const composed = combineSelectionBrushMasks(
        g.selectionBase,
        g.selectionBrushMask,
        g.selectionBrushOperation ?? selectionOperation,
      );
      const sameAsExisting =
        g.selectionExisting &&
        g.selectionExisting.length === composed.mask.length &&
        g.selectionExisting.every((value, index) => value === composed.mask[index]);
      if (!composed.changed || sameAsExisting) {
        void paint(f);
        setNotice('No Selection Brush change applied');
        return;
      }
      const selectionMask = createQuickMask(f.w, f.h, composed.mask),
        maskId = quickMaskAsset(selectionMask),
        selection: Selection = {
          shape: 'rectangle',
          x: 0,
          y: 0,
          w: f.w,
          h: f.h,
          feather: 0,
          inverted: false,
          mask: maskId,
        };
      if (commit({ ...f, selection }))
        setNotice('Selection Brush selection created');
    } else if (g.tool === 'red-eye' && g.buffer && g.layer) {
      if (g.moved && (g.last.x !== local.x || g.last.y !== local.y))
        redEyeCanvasStroke(g.buffer, g.last, local, {
          radius: localSize(g.layer.matrix, size) / 2,
          threshold: g.redEyeThreshold ?? 36,
          amount: (g.redEyeAmount ?? 100) / 100,
        });
      const asset = addAsset(assets.current, g.buffer);
      if (
        commit({
          ...f,
          layers: f.layers.map((item) =>
            item.id === g.layer!.id ? { ...item, asset } : item,
          ),
        })
      )
        setNotice('Red Eye correction applied');
    } else if (g.tool === 'background-eraser' && g.buffer && g.layer) {
      if (
        g.moved &&
        g.source &&
        g.replaceTarget &&
        (g.last.x !== local.x || g.last.y !== local.y)
      )
        eraseBackgroundStroke(
          g.source,
          g.buffer,
          g.replaceTarget,
          g.last.x,
          g.last.y,
          local.x,
          local.y,
          localSize(g.layer.matrix, size),
          colorTolerance,
          brushOpacity / 100,
        );
      const asset = addAsset(assets.current, g.buffer);
      if (
        commit({
          ...f,
          layers: f.layers.map((item) =>
            item.id === g.layer!.id ? { ...item, asset } : item,
          ),
        })
      )
        setNotice('Background Eraser stroke applied');
    } else if (g.tool === 'smudge' && g.buffer && g.layer) {
      let changed = Boolean(g.changed);
      if (g.moved && g.source && (g.last.x !== local.x || g.last.y !== local.y))
        changed =
          smudgeCanvasSegment(g.source, g.buffer, g.last, local, {
            size: localSize(g.layer.matrix, size),
            hardness,
            flow: brushOpacity / 100,
            selectionMask: g.selectionMask,
          }) || changed;
      if (!changed) {
        void paint(f);
        setNotice('No Smudge change applied');
        return;
      }
      const asset = addAsset(assets.current, g.buffer);
      if (
        commit({
          ...f,
          layers: f.layers.map((item) =>
            item.id === g.layer!.id ? { ...item, asset } : item,
          ),
        })
      )
        setNotice('Smudge stroke applied');
    } else if (
      (g.tool === 'dodge' || g.tool === 'burn' || g.tool === 'sponge') &&
      g.buffer &&
      g.layer
    ) {
      let changed = Boolean(g.changed);
      if (g.moved && g.source && (g.last.x !== local.x || g.last.y !== local.y))
        changed =
          tonalCanvasSegment(g.source, g.buffer, g.last, local, {
            size: localSize(g.layer.matrix, size),
            hardness,
            exposure: tonalExposure,
            flow: brushOpacity / 100,
            range: tonalRange,
            mode: g.tool,
            spongeMode,
            spongeVibrance,
            selectionMask: g.selectionMask,
          }) || changed;
      if (!changed) {
        void paint(f);
        setNotice('No tonal change applied');
        return;
      }
      const asset = addAsset(assets.current, g.buffer);
      if (
        commit({
          ...f,
          layers: f.layers.map((item) =>
            item.id === g.layer!.id ? { ...item, asset } : item,
          ),
        })
      )
        setNotice(
          `${g.tool === 'sponge' ? 'Sponge' : g.tool === 'dodge' ? 'Dodge' : 'Burn'} stroke applied`,
        );
    } else if (g.tool === 'color-replace' && g.buffer && g.layer) {
      const asset = addAsset(assets.current, g.buffer);
      if (
        commit({
          ...f,
          layers: f.layers.map((item) =>
            item.id === g.layer!.id ? { ...item, asset } : item,
          ),
        })
      )
        setNotice(
          'Color replacement applied; undo restores the original pixels',
        );
    } else void paint(f);
  };
  const doubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    if (g?.tool !== 'polygonal-lasso') return;
    // Double-clicking the final vertex is the desktop equivalent of clicking
    // the first vertex. The second pointer-down may already have added that
    // vertex, so remove it when it duplicates the preceding point.
    const p = point(e),
      points = g.points || [];
    if (points.length >= 2) {
      const last = points[points.length - 1],
        previous = points[points.length - 2];
      if (
        Math.hypot(last.x - p.x, last.y - p.y) <= 14 &&
        Math.hypot(last.x - previous.x, last.y - previous.y) <= 1
      )
        points.pop();
    }
    gesture.current = null;
    finishPolygonalLasso(g);
  };
  const transform = async (a: 'left' | 'right' | 'h' | 'v') => {
    if (quickMasking) {
      setNotice('Exit Quick Mask mode before transforming the document');
      return;
    }
    const f = current();
    const matrix: Matrix =
      a === 'left'
        ? [0, -1, 1, 0, 0, f.w]
        : a === 'right'
          ? [0, 1, -1, 0, f.h, 0]
          : a === 'h'
            ? [-1, 0, 0, 1, f.w, 0]
            : [1, 0, 0, -1, 0, f.h];
    const changed = commit(
      await transformFrameWithMasks(
        f,
        matrix,
        assets.current,
        a === 'left' || a === 'right' ? f.h : f.w,
        a === 'left' || a === 'right' ? f.w : f.h,
      ),
    );
    if (changed) setNotice('Transform applied to document; layers preserved');
  };
  const undo = () => {
      if (slicePreview) {
        cancelSlicePreview();
        return;
      }
      if (framePreview) {
        cancelFramePreview();
        return;
      }
      if (quickMasking) {
        setNotice('Exit Quick Mask mode before changing history');
        return;
      }
      travel(-1);
      setNotice('Undone');
    },
    redo = () => {
      if (quickMasking) {
        setNotice('Exit Quick Mask mode before changing history');
        return;
      }
      travel(1);
      setNotice('Redone');
    };
  const download = (format?: ExportFormat) => {
    if (format) setExportFormat(format);
    setExporting({ frame: current(), assets: { ...assets.current }, name });
  };
  const rotateViewBy = (degrees: number) => {
    setViewRotation((value) => normalizeViewRotation(value + degrees));
    setNotice(`Rotate View: ${normalizeViewRotation(viewRotation + degrees)}°`);
  };
  const resetViewRotation = () => {
    setViewRotation(0);
    setNotice('Rotate View reset');
  };
  const fitToScreen = () => {
      setZoom(72);
      stage.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
      setNotice('Fit to screen');
    },
    openFile = () => file.current?.click();
  const closeToolFlyout = () => {
    setToolFlyout(null);
    setToolFlyoutAnchor(null);
  };
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!menuArea.current?.contains(e.target as Node)) setActiveMenu(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);
  useEffect(() => () => {
    if (toolHoldTimer.current !== null) clearTimeout(toolHoldTimer.current);
  }, []);
  useEffect(() => {
    if (!activeMenu) return;
    const focus = pendingMenuFocus.current[activeMenu] || 'first';
    delete pendingMenuFocus.current[activeMenu];
    const focusMenuItem = () => {
      const buttons = (menuItemRefs.current[activeMenu] || []).filter(
        (button): button is HTMLButtonElement =>
          button !== null && !button.disabled,
      );
      buttons[focus === 'last' ? buttons.length - 1 : 0]?.focus();
    };
    // The popup is inserted after the state update. A frame also gives mobile
    // browsers a stable focus target after the virtual keyboard settles.
    const frame = requestAnimationFrame(focusMenuItem);
    return () => cancelAnimationFrame(frame);
  }, [activeMenu]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement,
        typing =
          /INPUT|TEXTAREA|SELECT/.test(target.tagName) ||
          target.isContentEditable,
        command = e.ctrlKey || e.metaKey;
      if (!ready || cloudBusy || document.querySelector('dialog[open]')) return;
      if (
        e.key === 'Escape' &&
        (gesture.current?.tool === 'polygonal-lasso' ||
          gesture.current?.tool === 'magnetic-lasso')
      ) {
        const canceled = gesture.current.tool;
        gesture.current = null;
        void paint(current());
        setNotice(
          canceled === 'magnetic-lasso'
            ? 'Magnetic Lasso cancelled'
            : 'Polygonal lasso cancelled',
        );
        return;
      }
      if (
        e.key === 'Escape' &&
        (gesture.current?.tool === 'pen' ||
          gesture.current?.tool === 'freeform-pen' ||
          gesture.current?.tool === 'curvature-pen' ||
          gesture.current?.tool === 'direct-select' ||
          gesture.current?.tool === 'selection-brush' ||
          gesture.current?.tool === 'quick-selection' ||
          gesture.current?.tool === 'patch')
      ) {
        const canceledTool = gesture.current.tool;
        gesture.current = null;
        void paint(current());
        setNotice(
          canceledTool === 'pen' ||
          canceledTool === 'freeform-pen' ||
          canceledTool === 'curvature-pen'
            ? 'Pen path cancelled'
            : canceledTool === 'selection-brush'
              ? 'Selection Brush cancelled'
              : canceledTool === 'quick-selection'
                ? 'Quick Selection cancelled'
              : canceledTool === 'patch'
                ? 'Patch stroke cancelled'
                : 'Path node selection cancelled',
        );
        return;
      }
      if (e.key === 'Escape' && quickMasking) {
        e.preventDefault();
        if (quickMaskGesture.current) {
          const mask = quickMaskRef.current;
          if (mask) {
            const restored = createQuickMask(
              mask.width,
              mask.height,
              quickMaskGesture.current.before,
            );
            quickMaskRef.current = restored;
            setQuickMask(restored);
          }
          quickMaskGesture.current = null;
          setNotice('Quick Mask stroke cancelled');
        } else exitQuickMask();
        return;
      }
      if (e.key === 'Escape' && cropPreview) {
        e.preventDefault();
        cancelCropPreview();
        return;
      }
      if (e.key === 'Escape' && perspectiveCropPreview) {
        e.preventDefault();
        cancelPerspectiveCropPreview();
        return;
      }
      if (e.key === 'Escape' && slicePreview) {
        e.preventDefault();
        cancelSlicePreview();
        return;
      }
      if (e.key === 'Escape' && framePreview) {
        e.preventDefault();
        cancelFramePreview();
        return;
      }
      if (
        e.key === 'Escape' &&
        (gesture.current?.tool === 'crop' ||
          gesture.current?.tool === 'perspective-crop' ||
          gesture.current?.tool === 'slice' ||
          gesture.current?.tool === 'frame')
      ) {
        e.preventDefault();
        const canceledPerspective = gesture.current.tool === 'perspective-crop';
        const canceledSlice = gesture.current.tool === 'slice';
        const canceledFrame = gesture.current.tool === 'frame';
        gesture.current = null;
        void paint(current());
        setNotice(
          canceledPerspective
            ? 'Perspective crop drag cancelled; document unchanged'
            : canceledSlice
              ? 'Slice drag cancelled; document unchanged'
              : canceledFrame
                ? 'Frame drag cancelled; document unchanged'
                : 'Crop drag cancelled; document unchanged',
        );
        return;
      }
      if (e.key === 'Escape' && gesture.current?.tool === 'rotate-view') {
        e.preventDefault();
        setViewRotation(normalizeViewRotation(gesture.current.viewRotationStart ?? 0));
        gesture.current = null;
        setNotice('Rotate View cancelled');
        return;
      }
      if (e.key === 'Enter' && perspectiveCropPreview && !typing) {
        e.preventDefault();
        void applyPerspectiveCropPreview();
        return;
      }
      if (e.key === 'Enter' && slicePreview && !typing) {
        e.preventDefault();
        void downloadSlice();
        return;
      }
      if (e.key === 'Enter' && framePreview && !typing) {
        e.preventDefault();
        addFrameArtboard();
        return;
      }
      if (e.key === 'Enter' && cropPreview && !typing) {
        e.preventDefault();
        void applyCropPreview();
        return;
      }
      if (gesture.current) return;
      if (e.key === 'Escape') {
        closeToolFlyout();
        closeMenu(true);
        return;
      }
      if (typing) return;
      if (quickMasking && command) {
        e.preventDefault();
        if (e.key.toLowerCase() === 's' && e.shiftKey) exportProject();
        else setNotice('Exit Quick Mask mode before changing the document');
        return;
      }
      if (e.key === 'F5' && e.shiftKey) {
        e.preventDefault();
        void fillActiveLayer();
        return;
      }
      if (command) {
        const k = e.key.toLowerCase();
        if (k === 'l' && e.shiftKey && command) {
          e.preventDefault();
          void autoCorrect('tone');
          return;
        }
        if (
          [
            'z',
            'y',
            's',
            'o',
            'n',
            'a',
            'd',
            'g',
            'j',
            'i',
            'c',
            'v',
            'x',
            't',
          ].includes(k) ||
          (k === 'w' && !e.altKey)
        )
          e.preventDefault();
        if (k === 'z') {
          if (e.shiftKey) redo();
          else undo();
        }
        if (k === 'y') redo();
        if (k === 's') {
          if (e.shiftKey) exportProject();
          else download();
        }
        if (k === 'o') openFile();
        if (k === 'n') newDocument(false);
        if (k === 'a') {
          if (e.shiftKey) setSelection(undefined);
          else selectAll();
        }
        if (k === 'd') setSelection(undefined);
        if (k === 'i') {
          if (e.altKey)
            setResizing({ width: current().w, height: current().h });
          else invertSelection();
        }
        if (k === 'g' && !e.altKey) {
          if (e.shiftKey) ungroupActiveLayer();
          else groupActiveLayer();
        }
        if (k === 'j' && !e.shiftKey) duplicate();
        if (k === 'c' && !e.shiftKey) copyLayer();
        if (k === 'x' && !e.shiftKey) cutLayer();
        if (k === 'v' && !e.shiftKey) pasteLayer();
        if (k === 't') beginLayerTransform();
        return;
      }
      if (e.key.toLowerCase() === 'd') {
        e.preventDefault();
        resetColors();
        return;
      }
      if (e.key.toLowerCase() === 'q') {
        e.preventDefault();
        toggleQuickMask();
        return;
      }
      if (e.key.toLowerCase() === 'x') {
        e.preventDefault();
        swapColors();
        return;
      }
      if (e.key === '[' || e.key === ']') {
        e.preventDefault();
        setSize((value) =>
          Math.max(2, Math.min(100, value + (e.key === ']' ? 2 : -2))),
        );
        return;
      }
      if (e.altKey) return;
      const lower = e.key.toLowerCase();
      const group = TOOL_GROUPS[lower];
      if (group) {
        e.preventDefault();
        const index = group.indexOf(tool);
        const direction = e.shiftKey ? -1 : 1;
        const next =
          group[
            (index < 0 ? 0 : index + direction + group.length) % group.length
          ];
        setTool(next);
        setNotice(
          toolSelectionNotice(
            next,
            TOOLS.find((item) => item.id === next)?.label || next,
          ),
        );
        return;
      }
      const alias = TOOL_ALIASES[lower];
      if (alias) {
        e.preventDefault();
        setTool(alias);
        setNotice(
          toolSelectionNotice(
            alias,
            TOOLS.find((item) => item.id === alias)?.label || alias,
          ),
        );
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        fitToScreen();
      }
      if (e.key === '1') {
        e.preventDefault();
        setZoom(100);
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((v) => Math.min(140, v + 10));
      }
      if (e.key === '-') {
        e.preventDefault();
        setZoom((v) => Math.max(20, v - 10));
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  const runCommand = async (command: Command) => {
    if (command === 'noop') return;
    if (command === 'actions') {
      setActionsOpen(true);
      return;
    }
    if (
      quickMasking &&
      ![
        'quick-mask',
        'zoom-in',
        'zoom-out',
        'fit',
        'actual',
        'project-save',
      ].includes(command)
    ) {
      setNotice('Exit Quick Mask mode before changing the document');
      return;
    }
    recordActionCommand(command);
    if (command === 'resize')
      setResizing({
        width: current().w,
        height: current().h,
        imageSize: effectiveImageSize(current().imageSize),
      });
    else if (command === 'canvas-size')
      setCanvasSizing({ width: current().w, height: current().h });
    else if (command === 'trim') setTrimming(true);
    else if (command === 'reveal-all') return revealAll();
    else if (command === 'project-save') exportProject();
    else if (command === 'batch-export')
      setBatchExporting({
        history: history.current.slice(),
        assets: { ...assets.current },
        name,
      });
    else if (command === 'batch-images') {
      batchActionRef.current = undefined;
      setBatchActionId(undefined);
      batchImageFile.current?.click();
    }
    else if (command === 'project-open') projectFile.current?.click();
    else if (command === 'new-white') newDocument(false);
    else if (command === 'new-transparent') newDocument(true);
    else if (command === 'open') openFile();
    else if (command === 'png') download('png');
    else if (command === 'jpg') download('jpeg');
    else if (command === 'webp') download('webp');
    else if (command === 'undo') undo();
    else if (command === 'redo') redo();
    else if (command === 'copy-layer') copyLayer();
    else if (command === 'cut-layer') cutLayer();
    else if (command === 'paste-layer') pasteLayer();
    else if (command === 'clear-layer') return clearActiveLayer();
    else if (command === 'fill-layer') return fillActiveLayer();
    else if (command === 'new-layer') addPaint();
    else if (command === 'new-fill-layer') setFillLayerDialog(true);
    else if (command === 'new-adjustment-layer') addAdjustmentLayer();
    else if (command === 'new-smart-object') chooseSmartObjectFile(false);
    else if (command === 'replace-smart-object') chooseSmartObjectFile(true);
    else if (command === 'rasterize-layer') return rasterize();
    else if (command === 'duplicate-layer') duplicate();
    else if (command === 'delete-layer') remove();
    else if (command === 'group-layer') groupActiveLayer();
    else if (command === 'ungroup-layer') ungroupActiveLayer();
    else if (command === 'align-left') alignActiveLayer('left');
    else if (command === 'align-center-horizontal')
      alignActiveLayer('center-horizontal');
    else if (command === 'align-right') alignActiveLayer('right');
    else if (command === 'align-top') alignActiveLayer('top');
    else if (command === 'align-center-vertical')
      alignActiveLayer('center-vertical');
    else if (command === 'align-bottom') alignActiveLayer('bottom');
    else if (command === 'distribute-horizontal')
      distributeGroupLayers('horizontal');
    else if (command === 'distribute-vertical')
      distributeGroupLayers('vertical');
    else if (command === 'hide-layer') hideActiveLayer();
    else if (command === 'arrange-front') arrangeLayers('front');
    else if (command === 'arrange-forward') arrangeLayers('forward');
    else if (command === 'arrange-backward') arrangeLayers('backward');
    else if (command === 'arrange-back') arrangeLayers('back');
    else if (command === 'merge-layers') return mergeLayers();
    else if (command === 'merge-visible') return mergeVisible();
    else if (command === 'flatten') return flattenImage();
    else if (command === 'combine-shapes-union') return combineSelectedShapes('union');
    else if (command === 'combine-shapes-subtract') return combineSelectedShapes('subtract');
    else if (command === 'combine-shapes-intersect') return combineSelectedShapes('intersect');
    else if (command === 'combine-shapes-exclude') return combineSelectedShapes('exclude');
    else if (command === 'patch-tool') {
      setTool('patch');
      setCloneSource(null);
      setNotice('Patch tool selected; click a source, then drag a destination');
    } else if (command === 'mixer-brush-tool') {
      setTool('mixer-brush');
      setNotice('Mixer Brush selected; drag to blend the immutable source snapshot');
    } else if (command === 'history-brush-tool') {
      setTool('history-brush');
      setNotice(`History Brush selected; source snapshot ${typeof historySourceIndex === 'number' ? historySourceIndex + 1 : index.current + 1}`);
    } else if (command === 'set-history-source') {
      setHistorySourceIndex(index.current);
      setNotice(`History Brush source set to snapshot ${index.current + 1}`);
    } else if (command === 'content-aware-fill') {
      await applyContentAwareFill();
    } else if (command === 'text-tool') {
      setTool('text');
      setNotice('Text tool selected');
    } else if (command === 'text-align-left') alignText('left');
    else if (command === 'text-align-center') alignText('center');
    else if (command === 'text-align-right') alignText('right');
    else if (command === 'text-orientation-horizontal')
      setTextOrientation('horizontal');
    else if (command === 'text-orientation-vertical')
      setTextOrientation('vertical');
    else if (command === 'text-mask-horizontal')
      await applyTextMask('horizontal');
    else if (command === 'text-mask-vertical')
      await applyTextMask('vertical');
    else if (command === 'select-all') selectAll();
    else if (command === 'select-all-layers') selectAllLayers();
    else if (command === 'deselect-layers') deselectLayers();
    else if (command === 'find-layers') {
      const input = document.getElementById('find-layers');
      if (input instanceof HTMLInputElement) {
        input.focus();
        input.select();
        setNotice('Find layers focused; search by name, type, group or state');
      }
    }
    else if (command === 'isolate-layers') isolateLayers();
    else if (command === 'deselect') setSelection(undefined);
    else if (command === 'reselect') reselect();
    else if (command === 'invert-selection') invertSelection();
    else if (command === 'similar-selection') await applySimilarSelection();
    else if (command === 'quick-mask') toggleQuickMask();
    else if (command === 'save-selection') {
      saveCurrentSelection();
      exportSelection();
    } else if (command === 'load-selection') selectionFile.current?.click();
    else if (command === 'transform-selection') {
      if (current().selection) setSelectionTransforming(true);
      else setNotice('Create a selection before transforming it');
    } else if (
      command === 'grow-selection' ||
      command === 'contract-selection' ||
      command === 'border-selection' ||
      command === 'smooth-selection'
    ) {
      if (current().selection)
        setSelectionRefining(
          command === 'grow-selection'
            ? 'grow'
            : command === 'contract-selection'
              ? 'contract'
              : command === 'border-selection'
                ? 'border'
                : 'smooth',
        );
      else setNotice('Create a selection before refining it');
    } else if (command === 'color-range') setColorRanging(true);
    else if (command === 'focus-area') setFocusAreaValue(true);
    else if (command === 'mask-selection') return createMaskFromSelection();
    else if (command === 'remove-background') return removeBackground();
    else if (command === 'free-transform') beginLayerTransform();
    else if (command === 'invert-layer-mask') invertLayerMask();
    else if (command === 'toggle-layer-mask') toggleLayerMask();
    else if (command === 'remove-layer-mask') clearMask();
    else if (command === 'create-clipping-mask') createClippingMask();
    else if (command === 'release-clipping-mask') releaseClippingMask();
    else if (command === 'reset') resetAdjustments();
    else if (command === 'levels')
      setNotice('Levels controls are available in Adjust selected layer');
    else if (command === 'hue-saturation')
      setNotice(
        'Hue/Saturation controls are available in Adjust selected layer',
      );
    else if (command === 'curves')
      setNotice('Curves controls are available in Adjust selected layer');
    else if (command === 'color-balance')
      setNotice(
        'Color Balance controls are available in Adjust selected layer',
      );
    else if (command === 'sharpen-noise')
      setNotice(
        'Sharpen and Noise controls are available in Adjust selected layer',
      );
    else if (command === 'auto-tone') return autoCorrect('tone');
    else if (command === 'auto-contrast') return autoCorrect('contrast');
    else if (command === 'auto-color') return autoCorrect('color');
    else if (command === 'filter-clear-effect')
      chooseFilterEffect('none', 'Filter effect');
    else if (command === 'filter-average')
      chooseFilterEffect('average-blur', 'Average Blur');
    else if (command === 'filter-blur-more')
      chooseFilterEffect('blur-more', 'Blur More');
    else if (command === 'filter-box-blur')
      chooseFilterEffect('box-blur', 'Box Blur');
    else if (command === 'filter-gaussian-blur')
      chooseFilterEffect('gaussian-blur', 'Gaussian Blur');
    else if (command === 'filter-lens-blur')
      chooseFilterEffect('lens-blur', 'Lens Blur (local approximation)');
    else if (command === 'filter-iris-blur')
      chooseFilterEffect('iris-blur', 'Iris Blur (elliptical focal approximation)');
    else if (command === 'filter-smart-blur')
      chooseFilterEffect('smart-blur', 'Smart Blur (edge-preserving approximation)');
    else if (command === 'filter-surface-blur')
      chooseFilterEffect('surface-blur', 'Surface Blur (tonal-surface approximation)');
    else if (command === 'filter-shape-blur')
      chooseFilterEffect('shape-blur', 'Shape Blur (diamond aperture)');
    else if (command === 'filter-motion-blur')
      chooseFilterEffect('motion-blur', 'Motion Blur');
    else if (command === 'filter-radial-blur')
      chooseFilterEffect('radial-blur', 'Radial Blur');
    else if (command === 'filter-spin-blur')
      chooseFilterEffect('spin-blur', 'Spin Blur (local approximation)');
    else if (command === 'filter-path-blur')
      chooseFilterEffect('path-blur', 'Path Blur (local approximation)');
    else if (command === 'filter-field-blur')
      chooseFilterEffect('field-blur', 'Field Blur');
    else if (command === 'filter-tilt-shift')
      chooseFilterEffect('tilt-shift', 'Tilt-Shift');
    else if (command === 'filter-mosaic')
      chooseFilterEffect('mosaic', 'Mosaic');
    else if (command === 'filter-crystallize')
      chooseFilterEffect('crystallize', 'Crystallize');
    else if (command === 'filter-color-halftone')
      chooseFilterEffect('color-halftone', 'Color Halftone');
    else if (command === 'filter-pointillize')
      chooseFilterEffect('pointillize', 'Pointillize (local approximation)');
    else if (command === 'filter-lens-correction')
      chooseFilterEffect('lens-correction', 'Lens Correction (local approximation)');
    else if (command === 'filter-displace')
      chooseFilterEffect('displace', 'Displace (procedural local approximation)');
    else if (command === 'filter-ripple')
      chooseFilterEffect('ripple', 'Ripple');
    else if (command === 'filter-pinch')
      chooseFilterEffect('pinch', 'Pinch');
    else if (command === 'filter-polar-coordinates')
      chooseFilterEffect('polar-coordinates', 'Polar Coordinates (local approximation)');
    else if (command === 'filter-spherize')
      chooseFilterEffect('spherize', 'Spherize');
    else if (command === 'filter-twirl') chooseFilterEffect('twirl', 'Twirl');
    else if (command === 'filter-wave') chooseFilterEffect('wave', 'Wave');
    else if (command === 'filter-shear')
      chooseFilterEffect('shear', 'Shear (linear local approximation)');
    else if (command === 'filter-zigzag')
      chooseFilterEffect('zigzag', 'ZigZag (radial local approximation)');
    else if (command === 'crop') {
      if (slicePreview) cancelSlicePreview();
      setTool('crop');
      setNotice('Drag on the image to crop');
    } else if (command === 'perspective-crop') {
      setTool('perspective-crop');
      setNotice('Drag on the image to define a perspective crop');
    } else if (command === 'slice') {
      if (cropPreview) cancelCropPreview();
      if (perspectiveCropPreview) cancelPerspectiveCropPreview();
      setTool('slice');
      setCloneSource(null);
      setNotice('Drag on the image to select a slice');
    } else if (command === 'slice-select') {
      setTool('slice-select');
      setCloneSource(null);
      setNotice(
        current().slices?.length
          ? 'Click a saved slice to select and edit it'
          : 'Create and save a slice before selecting it',
      );
    } else if (command === 'frame') {
      if (slicePreview) cancelSlicePreview();
      setTool('frame');
      setCloneSource(null);
      setNotice('Drag on the image to define an independent artboard');
    } else if (command === 'rotate-left') return transform('left');
    else if (command === 'rotate-right') return transform('right');
    else if (command === 'flip-h') return transform('h');
    else if (command === 'flip-v') return transform('v');
    else if (command.startsWith('filter-')) {
      const match = FILTERS.find(
        (f) => f[0].toLowerCase() === command.slice(7),
      );
      if (match) chooseFilter(match[1], match[0]);
    } else if (command === 'rotate-view-left') rotateViewBy(-15);
    else if (command === 'rotate-view-right') rotateViewBy(15);
    else if (command === 'reset-rotate-view') resetViewRotation();
    else if (command === 'zoom-in') setZoom((v) => Math.min(140, v + 10));
    else if (command === 'zoom-out') setZoom((v) => Math.max(20, v - 10));
    else if (command === 'fit') fitToScreen();
    else if (command === 'actual') setZoom(100);
  };
  const runActionRecipe = async (id: string) => {
    const action = actions.find((candidate) => candidate.id === id);
    if (!action || !action.steps.length) {
      setNotice('Record at least one command before running an action');
      return;
    }
    setRunningActionId(id);
    replayingActionRef.current = true;
    const result = await replayActionSet(
      action,
      (step: ActionStep) => {
        const f = current(),
          layer = f.layers.find((candidate) => candidate.id === f.active);
        const requiresLayer =
          step.command === 'reset' ||
          step.command.startsWith('auto-') ||
          step.command.startsWith('filter-') ||
          step.command.endsWith('layer-mask');
        if (quickMasking)
          throw new Error('Exit Quick Mask mode before replaying an action');
        if (
          requiresLayer &&
          (!layer || layerIsLocked(f, layer) || !layer.visible)
        )
          throw new Error('Unlock and show the active layer before replaying this step');
        if (step.command.startsWith('auto-') && layer?.kind !== 'raster')
          throw new Error('This automatic correction requires a raster layer');
        if (step.command.endsWith('layer-mask') && !layer?.mask)
          throw new Error('This step requires a layer mask');
        return runCommand(step.command as Command);
      },
    );
    replayingActionRef.current = false;
    setRunningActionId(undefined);
    if (result.failure) {
      setNotice(
        `Action stopped after ${result.completed} step${result.completed === 1 ? '' : 's'}: ${result.failure.error}`,
      );
    } else {
      setNotice(`Action “${action.name}” replayed (${result.completed} step${result.completed === 1 ? '' : 's'})`);
    }
  };
  const menuItemDisabled = (item: MenuItem) => {
    if (item.disabled || !frame) return true;
    if (
      quickMasking &&
      ![
        'quick-mask',
        'zoom-in',
        'zoom-out',
        'fit',
        'actual',
        'project-save',
      ].includes(item.command)
    )
      return true;
    const layer = frame.layers.find((item) => item.id === frame.active);
    const locked = layer ? layerIsLocked(frame, layer) : true;
    switch (item.command) {
      case 'undo':
        return !canUndo || quickMasking;
      case 'redo':
        return !canRedo || quickMasking;
      case 'copy-layer':
        return !layer;
      case 'cut-layer':
        return !layer || locked || frame.layers.length <= 1;
      case 'paste-layer':
        return !hasClipboard || frame.layers.length >= 32;
      case 'new-layer':
        return frame.layers.length >= 32;
      case 'clear-layer':
      case 'fill-layer':
        return !layer || layer.kind !== 'raster' || locked || !layer.visible;
      case 'duplicate-layer':
        return (
          !selectedIdsForFrame(frame).length ||
          selectedIdsForFrame(frame).some((id) => {
            const candidate = frame.layers.find((item) => item.id === id);
            return !candidate || layerIsLocked(frame, candidate);
          }) ||
          frame.layers.length + selectedIdsForFrame(frame).length > 32
        );
      case 'delete-layer':
        return !layer || locked || frame.layers.length <= 1;
      case 'group-layer':
        return (
          !selectedIdsForFrame(frame).length ||
          selectedIdsForFrame(frame).some((id) => {
            const candidate = frame.layers.find((item) => item.id === id);
            return !candidate || Boolean(candidate.groupId) || layerIsLocked(frame, candidate);
          }) ||
          (frame.groups || []).length >= 32
        );
      case 'ungroup-layer':
        return (
          !layer?.groupId ||
          Boolean(
            frame.groups?.find((group) => group.id === layer.groupId)?.locked,
          )
        );
      case 'mask-selection':
        return !layer || layer.kind !== 'raster' || locked || !frame.selection;
      case 'remove-background':
        return !layer || layer.kind !== 'raster' || locked || !layer.visible;
      case 'patch-tool':
        return !layer || layer.kind !== 'raster' || locked || !layer.visible;
      case 'content-aware-fill':
        return (
          !layer ||
          layer.kind !== 'raster' ||
          locked ||
          !layer.visible ||
          !frame.selection ||
          (layer.contentAwareFills?.length ?? 0) >= CONTENT_AWARE_MAX_OPERATIONS
        );
      case 'invert-layer-mask':
      case 'toggle-layer-mask':
      case 'remove-layer-mask':
        return (
          !layer ||
          layer.kind !== 'raster' ||
          locked ||
          !layer.visible ||
          !layer.mask
        );
      case 'create-clipping-mask': {
        const base = layer ? clippingCandidateBase(frame, layer) : undefined;
        return (
          !layer ||
          !isClippingSourceLayer(layer) ||
          !base ||
          Boolean(layer.clippingTo) ||
          layerIsLocked(frame, layer) ||
          layerIsLocked(frame, base) ||
          !layer.visible ||
          !base.visible
        );
      }
      case 'release-clipping-mask':
        return (
          !layer ||
          !layer.clippingTo ||
          !validClippingRelationship(frame, layer.id, layer.clippingTo) ||
          layerIsLocked(frame, layer)
        );
      case 'auto-tone':
      case 'auto-contrast':
      case 'auto-color':
        return !layer || layer.kind !== 'raster' || locked || !layer.visible;
      case 'filter-average':
      case 'filter-blur-more':
      case 'filter-field-blur':
      case 'filter-box-blur':
      case 'filter-gaussian-blur':
      case 'filter-lens-blur':
      case 'filter-iris-blur':
      case 'filter-smart-blur':
      case 'filter-surface-blur':
      case 'filter-shape-blur':
      case 'filter-tilt-shift':
      case 'filter-spin-blur':
      case 'filter-path-blur':
      case 'filter-mosaic':
      case 'filter-crystallize':
      case 'filter-color-halftone':
      case 'filter-pointillize':
      case 'filter-lens-correction':
      case 'filter-displace':
      case 'filter-ripple':
      case 'filter-polar-coordinates':
      case 'filter-spherize':
      case 'filter-twirl':
      case 'filter-wave':
      case 'filter-shear':
      case 'filter-zigzag':
      case 'filter-clear-effect':
        return !layer || locked || !layer.visible;
      case 'quick-mask':
        return !frame;
      case 'save-selection':
        return !frame.selection;
      case 'load-selection':
        return !frame;
      case 'reselect':
        return Boolean(frame.selection) || !frame.previousSelection;
      case 'select-all-layers':
        return selectedIdsForFrame(frame).length === frame.layers.length;
      case 'deselect-layers':
        return selectedIdsForFrame(frame).length === 0;
      case 'isolate-layers':
        return selectedIdsForFrame(frame).length === 0;
      case 'transform-selection':
        return !frame.selection;
      case 'free-transform':
        return !layer || locked;
      case 'align-left':
      case 'align-center-horizontal':
      case 'align-right':
      case 'align-top':
      case 'align-center-vertical':
      case 'align-bottom':
        return (
          !selectedIdsForFrame(frame).length ||
          selectedIdsForFrame(frame).some((id) => {
            const candidate = frame.layers.find((item) => item.id === id);
            return !candidate || layerIsLocked(frame, candidate);
          })
        );
      case 'distribute-horizontal':
      case 'distribute-vertical': {
        const group = layer ? groupForLayer(frame, layer) : undefined;
        return (
          !group ||
          group.locked ||
          !group.visible ||
          frame.layers.filter(
            (item) => item.groupId === group.id && item.visible && !item.locked,
          ).length < 3
        );
      }
      case 'grow-selection':
      case 'contract-selection':
      case 'border-selection':
      case 'smooth-selection':
      case 'similar-selection':
        return !frame.selection;
      case 'hide-layer':
        return !layer || Boolean(groupForLayer(frame, layer)?.locked);
      case 'arrange-front':
        return !planLayerArrange(frame, 'front').ok;
      case 'arrange-forward':
        return !planLayerArrange(frame, 'forward').ok;
      case 'arrange-backward':
        return !planLayerArrange(frame, 'backward').ok;
      case 'arrange-back':
        return !planLayerArrange(frame, 'back').ok;
      case 'merge-layers': {
        const selected = selectedIdsForFrame(frame);
        if (selected.length >= 2)
          return !planSelectedLayerMerge(frame).ok;
        return !planLayerMerge(frame).ok;
      }
      case 'text-align-left':
      case 'text-align-center':
      case 'text-align-right':
      case 'text-orientation-horizontal':
      case 'text-orientation-vertical':
        return !layer || layer.kind !== 'text' || locked;
      case 'text-mask-horizontal':
      case 'text-mask-vertical': {
        if (!layer || layer.kind !== 'text' || locked || !layer.visible)
          return true;
        if (groupForLayer(frame, layer)?.visible === false) return true;
        if (!layer.text.trim() || frame.w * frame.h > TEXT_MASK_MAX_PIXELS)
          return true;
        const [a, b, c, d, e, f] = layer.matrix;
        return (
          ![a, b, c, d, e, f].every((value) => Number.isFinite(value) && Math.abs(value) <= 1000000) ||
          Math.abs(a * d - b * c) < 1e-12
        );
      }
      case 'merge-visible':
        return !planMergeVisible(frame).ok;
      case 'combine-shapes-union':
      case 'combine-shapes-subtract':
      case 'combine-shapes-intersect':
      case 'combine-shapes-exclude': {
        const selected = selectedLayersForFrame(frame);
        const groupIds = new Set(selected.map((candidate) => candidate.groupId || ''));
        return selected.length < 2 || groupIds.size > 1 || selected.some((candidate) =>
          layerIsLocked(frame, candidate) || !candidate.visible ||
          groupForLayer(frame, candidate)?.visible === false ||
          (candidate.kind === 'line' || candidate.kind === 'text' || candidate.kind === 'raster' ||
            candidate.kind === 'smart-object' || candidate.kind === 'adjustment' ||
            (candidate.kind === 'path' && !booleanPathIsClosed(candidate.path))));
      }
      default:
        return false;
    }
  };
  const stopToolHold = () => {
    if (toolHoldTimer.current !== null) {
      clearTimeout(toolHoldTimer.current);
      toolHoldTimer.current = null;
    }
  };
  const selectToolbarTool = (id: Tool, label: string) => {
    toolHoldOpened.current = false;
    if (cropPreview) cancelCropPreview();
    if (perspectiveCropPreview) cancelPerspectiveCropPreview();
    if (slicePreview) cancelSlicePreview();
    if (framePreview) cancelFramePreview();
    if (gesture.current && gesture.current.tool !== id) {
      // Switching tools abandons any staged pointer gesture. This is
      // especially important for click-to-place tools on touch devices.
      gesture.current = null;
      void paint(current());
    }
    setTool(id);
    setCloneSource(null);
    closeToolFlyout();
    setNotice(toolSelectionNotice(id, label));
  };
  const beginToolHold = (id: Tool, button: HTMLButtonElement) => {
    stopToolHold();
    toolHoldOpened.current = false;
    const flyout = flyoutForTool(id);
    if (!flyout) return;
    toolHoldTimer.current = setTimeout(() => {
      toolHoldTimer.current = null;
      toolHoldOpened.current = true;
      setToolFlyout(flyout);
      setToolFlyoutAnchor(button);
    }, 420);
  };
  const openToolFlyoutFromKeyboard = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: Tool,
  ) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const flyout = flyoutForTool(id);
    if (!flyout) return;
    event.preventDefault();
    event.stopPropagation();
    setToolFlyout(flyout);
    setToolFlyoutAnchor(event.currentTarget);
  };
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <main
      className="editor-shell"
      role="application"
      aria-label="PixelForge photo editor"
      aria-busy={!ready || doc.rendering}
      inert={!ready || cloudBusy || recovering}
      tabIndex={-1}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void load(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={layerFile}
        data-testid="layer-input"
        className="hidden"
        type="file"
        accept="image/*,.heic,.heif,.heics,.heifs,.psd,.psb,.dng,.raw,.arw,.cr2,.cr3,.nef,.nrw,.orf,.raf,.rw2,.rwl,.sr2,.srf,.x3f"
        onChange={(e) => void load(e.target.files?.[0], true)}
      />
      <input
        ref={smartObjectFile}
        data-testid="smart-object-input"
        className="hidden"
        type="file"
        accept="image/*,.heic,.heif,.heics,.heifs,.psd,.psb,.dng,.raw,.arw,.cr2,.cr3,.nef,.nrw,.orf,.raf,.rw2,.rwl,.sr2,.srf,.x3f"
        onChange={(event) =>
          void importSmartObject(
            event.target.files?.[0],
            smartObjectAction.current === 'replace',
          )
        }
      />
      <input
        ref={projectFile}
        data-testid="project-input"
        className="hidden"
        type="file"
        accept=".pixelforge,application/json"
        onChange={(event) => void importProject(event.target.files?.[0])}
      />
      <input
        ref={selectionFile}
        data-testid="selection-input"
        className="hidden"
        type="file"
        accept=".pixelselection,application/json"
        onChange={(event) => void importSelection(event.target.files?.[0])}
      />
      <input
        ref={batchImageFile}
        data-testid="batch-image-input"
        className="hidden"
        type="file"
        accept="image/*,.heic,.heif,.heics,.heifs,.psd,.psb,.dng,.raw,.arw,.cr2,.cr3,.nef,.nrw,.orf,.raf,.rw2,.rwl,.sr2,.srf,.x3f"
        multiple
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          const actionId = batchActionRef.current;
          batchActionRef.current = undefined;
          if (files.length) {
            setBatchImages(files.map((file) => ({ name: file.name, file })));
            setBatchActionId(actionId);
          }
          event.currentTarget.value = '';
        }}
      />
      {resizing && (
        <ResizeDialog
          width={resizing.width}
          height={resizing.height}
          imageSize={resizing.imageSize}
          close={() => setResizing(null)}
          apply={resizeImage}
        />
      )}
      {canvasSizing && (
        <CanvasSizeDialog
          width={canvasSizing.width}
          height={canvasSizing.height}
          close={() => setCanvasSizing(null)}
          apply={resizeCanvas}
        />
      )}
      {trimming && (
        <TrimDialog close={() => setTrimming(false)} apply={trimDocument} />
      )}
      {transformSelectionValue && (
        <SelectionTransformDialog
          selection={transformSelectionValue}
          close={() => setSelectionTransforming(false)}
          apply={applySelectionTransform}
        />
      )}
      {layerTransformValue && (
        <LayerTransformDialog
          bounds={layerTransformValue.bounds}
          layerMatrix={layerTransformValue.layer.matrix}
          close={() => setLayerTransforming(false)}
          apply={applyLayerTransform}
        />
      )}
      {selectionRefineValue && (
        <SelectionModifyDialog
          mode={selectionRefineValue}
          close={() => setSelectionRefining(null)}
          apply={(radius) => void applySelectionRefinement(radius)}
        />
      )}
      {colorRanging && (
        <ColorRangeDialog
          initialColor={color}
          initialFuzziness={colorTolerance}
          close={() => setColorRanging(false)}
          apply={(sample, fuzziness) => void applyColorRange(sample, fuzziness)}
        />
      )}
      {fillLayerDialog && (
        <FillLayerDialog
          initialColor={color}
          close={() => setFillLayerDialog(false)}
          apply={addSolidFillLayer}
        />
      )}
      {focusAreaValue && (
        <FocusAreaDialog
          initialThreshold={focusAreaThreshold}
          initialSoftness={focusAreaSoftness}
          close={() => setFocusAreaValue(false)}
          apply={(threshold, softness) => void applyFocusArea(threshold, softness)}
        />
      )}
      {exporting && (
        <ExportDialog
          {...exporting}
          format={exportFormat}
          quality={exportQuality}
          targetBytes={exportTargetBytes}
          setFormat={setExportFormat}
          setQuality={setExportQuality}
          setTargetBytes={setExportTargetBytes}
          close={() => setExporting(null)}
          downloaded={setNotice}
        />
      )}
      {batchExporting && (
        <BatchExportDialog
          {...batchExporting}
          close={() => setBatchExporting(null)}
          downloaded={setNotice}
        />
      )}
      {batchImages && (
        <ImageBatchDialog
          sources={batchImages}
          action={actions.find((candidate) => candidate.id === batchActionId)}
          close={() => {
            setBatchImages(null);
            setBatchActionId(undefined);
          }}
          downloaded={setNotice}
        />
      )}
      {actionsOpen && (
        <ActionsPanel
          actions={actions}
          recordingId={recordingActionId}
          busyId={runningActionId}
          close={() => setActionsOpen(false)}
          start={beginActionRecording}
          stop={stopActionRecording}
          run={(id) => void runActionRecipe(id)}
          batch={beginBatchAction}
          remove={removeActionRecipe}
        />
      )}
      <input
        ref={file}
        data-testid="file-input"
        className="hidden"
        type="file"
        accept="image/*,.heic,.heif,.heics,.heifs,.psd,.psb,.dng,.raw,.arw,.cr2,.cr3,.nef,.nrw,.orf,.raf,.rw2,.rwl,.sr2,.srf,.x3f"
        onChange={(e) => load(e.target.files?.[0])}
      />
      <header className="topbar">
        <BrandLockup />
        <nav ref={menuArea} aria-label="Editor menus">
          {(Object.keys(MENU_DEFS) as MenuName[]).map((menuName) => (
            <div className="menu" key={menuName}>
              <button
                ref={(element) => {
                  menuButtonRefs.current[menuName] = element;
                }}
                className={activeMenu === menuName ? 'menu-active' : ''}
                aria-haspopup="menu"
                aria-expanded={activeMenu === menuName}
                onClick={() =>
                  activeMenu === menuName ? closeMenu(true) : openMenu(menuName)
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    if (activeMenu === menuName) closeMenu(true);
                    else openMenu(menuName);
                    return;
                  }
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    openMenu(
                      menuName,
                      event.key === 'ArrowUp' ? 'last' : 'first',
                    );
                  }
                }}
              >
                {menuName}
              </button>
              {activeMenu === menuName && (
                <div
                  className="menu-popup"
                  role="menu"
                  aria-label={`${menuName} menu`}
                  tabIndex={-1}
                  onKeyDown={(event) => handleMenuKeyDown(event, menuName)}
                >
                  {MENU_DEFS[menuName].map((item, index) =>
                    item.separator ? (
                      <hr key={`separator-${menuName}-${index}`} />
                    ) : (
                      <button
                        key={`${item.label}-${index}`}
                        ref={(element) => {
                          const items = menuItemRefs.current[menuName] || [];
                          items[index] = element;
                          menuItemRefs.current[menuName] = items;
                        }}
                        role="menuitem"
                        tabIndex={-1}
                        disabled={menuItemDisabled(item)}
                        title={
                          item.disabled
                            ? 'Planned for a later roadmap stage'
                            : undefined
                        }
                        onClick={() => {
                          setActiveMenu(null);
                          void runCommand(item.command);
                        }}
                      >
                        <span>{item.label}</span>
                        {item.shortcut && <kbd>{item.shortcut}</kbd>}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="top-actions">
          <button
            aria-label="Undo"
            className="icon"
            onClick={undo}
            disabled={!canUndo || quickMasking}
          >
            <Undo2 />
          </button>
          <button
            aria-label="Redo"
            className="icon"
            onClick={redo}
            disabled={!canRedo || quickMasking}
          >
            <Redo2 />
          </button>
          <button className="open" onClick={openFile}>
            <Upload /> Open image
          </button>
          <button className="export" onClick={() => download()}>
            <Download /> Export
          </button>
          <ReleaseStatus />
          <AccountMenu member={member} checking={checking} />
        </div>
      </header>
      <section className="docbar">
        <div>
          <FileImage />
          <input
            aria-label="Document name"
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <small>• &nbsp;{dimensions}</small>
        </div>
        <div className="draft-actions">
          <button
            disabled={recovering}
            onClick={() => {
              setDraftId(createDraftId());
              clearCloud();
              setNotice('New local copy created. The original draft is kept.');
            }}
          >
            Save local copy
          </button>
          {saveStatus === LOCAL_CONFLICT && (
            <button
              disabled={recovering}
              onClick={() => void reloadNewerDraft()}
            >
              Reload newer draft
            </button>
          )}
          <a href="/">Home</a>
          <button onClick={() => void discard()}>Discard draft</button>
        </div>
      </section>
      <div className="workspace">
        <aside
          className="toolbar"
          aria-label="Tools"
          data-testid="tool-palette"
        >
          {TOOL_CATEGORIES.map((category) => {
            const compactTools = compactCategoryTools(category, tool, toolFamilyChoices);
            const layout = compactTools.length === 1 ? 'one' : compactTools.length === 2 ? 'two' : 'many';
            return (
            <section
              className={`tool-category tool-category--${layout}`}
              aria-label={`${category.label} tools`}
              key={category.id}
            >
              <h3>{category.label}</h3>
              <div className={`tool-category-grid tool-category-grid--${layout}`}>
                {compactTools.map((toolId) => {
                  const item = TOOLS.find((candidate) => candidate.id === toolId);
                  if (!item) return null;
                  const { id, label, icon: Icon, key } = item,
                    flyout = flyoutForTool(id),
                    subtools = flyout ? flyoutTools(flyout) : [];
                  return (
                    <div className="tool-button-wrap" key={flyout ? `family-${flyout}` : id}>
                      <button
                        id={`toolbar-${flyout ?? id}`}
                        className={tool === id ? 'active' : ''}
                        data-tool-id={id}
                        onPointerDown={(event) => {
                          if (event.button === 0)
                            beginToolHold(id, event.currentTarget);
                        }}
                        onPointerUp={stopToolHold}
                        onPointerCancel={stopToolHold}
                        onPointerLeave={stopToolHold}
                        onContextMenu={(event) => {
                          if (!flyout) return;
                          event.preventDefault();
                          stopToolHold();
                          setToolFlyout(flyout);
                          setToolFlyoutAnchor(event.currentTarget);
                        }}
                        onKeyDown={(event) =>
                          openToolFlyoutFromKeyboard(event, id)
                        }
                        onClick={() => {
                          if (toolHoldOpened.current) {
                            // Releasing a long press opens the flyout without
                            // immediately selecting the parent tool.
                            toolHoldOpened.current = false;
                            return;
                          }
                          selectToolbarTool(id, label);
                        }}
                        aria-label={`${label} tool`}
                        aria-pressed={tool === id}
                        aria-haspopup={flyout ? 'menu' : undefined}
                        aria-expanded={
                          flyout
                            ? toolFlyout === flyout &&
                              toolFlyoutAnchor?.dataset.toolId === id
                            : undefined
                        }
                        title={
                          flyout
                            ? `${label} (${key}) · press and hold for subtools`
                            : `${label} (${key})`
                        }
                      >
                        <Icon />
                        <span>{label}</span>
                        <kbd>{key}</kbd>
                        {subtools.length > 1 && (
                          <span
                            className="tool-subtool-arrow"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                      {flyout &&
                        toolFlyout === flyout &&
                        toolFlyoutAnchor?.dataset.toolId === id && (
                          <ToolFlyout
                            label={label}
                            trigger={toolFlyoutAnchor}
                            selected={tool}
                            items={subtools.flatMap((subtoolId) => {
                              const subtool = TOOLS.find(
                                (candidate) => candidate.id === subtoolId,
                              );
                              return subtool
                                ? [
                                    {
                                      id: subtool.id,
                                      label: flyoutToolLabel(
                                        subtool.id,
                                        subtool.label,
                                      ),
                                      key: flyoutToolKey(
                                        subtool.id,
                                        subtool.key,
                                      ),
                                      icon: subtool.icon,
                                    },
                                  ]
                                : [];
                            })}
                            onSelect={(subtoolId) => {
                              const subtool = TOOLS.find(
                                (candidate) => candidate.id === subtoolId,
                              );
                              if (subtool)
                                selectToolbarTool(subtool.id, subtool.label);
                            }}
                            onClose={closeToolFlyout}
                          />
                        )}
                    </div>
                  );
                })}
              </div>
            </section>
            );
          })}
          <button
            className={
              quickMasking ? 'active quick-mask-tool' : 'quick-mask-tool'
            }
            onClick={toggleQuickMask}
            aria-label="Quick Mask mode"
            aria-pressed={quickMasking}
            title="Quick Mask mode (Q)"
          >
            <Bookmark />
            <span>Quick Mask</span>
            <kbd>Q</kbd>
          </button>
          <hr />
          <label className="color">
            <input
              aria-label="Drawing color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
            <i style={{ background: color }} />
            <small>Color</small>
          </label>
          <label className="color">
            <input
              aria-label="Background color"
              type="color"
              value={backgroundColor}
              onChange={(e) => setBackgroundColor(e.target.value)}
            />
            <i style={{ background: backgroundColor }} />
            <small>Background</small>
          </label>
        </aside>
        <section ref={stage} className={`stage ${drag ? 'dragging' : ''}`}>
          {saveStatus === LOCAL_CONFLICT && (
            <div role="alert" className="draft-conflict">
              {LOCAL_CONFLICT}
            </div>
          )}
          {drag && (
            <div className="drop">
              <ImagePlus />
              <b>Drop your photo here</b>
              <span>JPG, PNG, WEBP and more</span>
            </div>
          )}
          {cropPreview && (
            <fieldset
              className="crop-preview-controls"
              aria-label="Crop preview controls"
              data-testid="crop-preview-controls"
            >
              <span>
                Crop preview · {cropPreview.width} × {cropPreview.height} px
              </span>
              <button
                type="button"
                data-testid="crop-apply"
                disabled={cropApplying}
                onClick={() => void applyCropPreview()}
              >
                {cropApplying ? 'Applying…' : 'Apply crop'}
              </button>
              <button
                type="button"
                data-testid="crop-cancel"
                onClick={cancelCropPreview}
              >
                Cancel
              </button>
            </fieldset>
          )}
          {perspectiveCropPreview && (
            <fieldset
              className="crop-preview-controls perspective-crop-controls"
              aria-label="Perspective crop controls"
              data-testid="perspective-crop-controls"
            >
              <span>
                Perspective crop · {perspectiveCropPreview.width} ×{' '}
                {perspectiveCropPreview.height} px
              </span>
              <div className="perspective-crop-fields">
                {(
                  [
                    'Top left',
                    'Top right',
                    'Bottom right',
                    'Bottom left',
                  ] as const
                ).map((label, index) => (
                    <span key={label}>
                      <label>
                        {label} X
                        <input
                          aria-label={`${label} X`}
                          type="number"
                          min="0"
                          max={perspectiveCropPreview.frame.w}
                          value={Math.round(perspectiveCropPreview.quad[index].x)}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (!Number.isFinite(value)) return;
                          const quad = perspectiveCropPreview.quad.map(
                            (point) => ({ ...point }),
                          ) as CropQuad;
                            quad[index] = { ...quad[index], x: value };
                            updatePerspectiveCropPreview({ quad });
                          }}
                        />
                      </label>
                      <label>
                        {label} Y
                        <input
                          aria-label={`${label} Y`}
                          type="number"
                          min="0"
                          max={perspectiveCropPreview.frame.h}
                          value={Math.round(perspectiveCropPreview.quad[index].y)}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (!Number.isFinite(value)) return;
                          const quad = perspectiveCropPreview.quad.map(
                            (point) => ({ ...point }),
                          ) as CropQuad;
                            quad[index] = { ...quad[index], y: value };
                            updatePerspectiveCropPreview({ quad });
                          }}
                        />
                      </label>
                    </span>
                ))}
                <label>
                  Output width
                  <input
                    aria-label="Perspective output width"
                    type="number"
                    min="1"
                    max="16000"
                    value={perspectiveCropPreview.width}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value))
                        updatePerspectiveCropPreview({ width: value });
                    }}
                  />
                </label>
                <label>
                  Output height
                  <input
                    aria-label="Perspective output height"
                    type="number"
                    min="1"
                    max="16000"
                    value={perspectiveCropPreview.height}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value))
                        updatePerspectiveCropPreview({ height: value });
                    }}
                  />
                </label>
              </div>
              <button
                type="button"
                data-testid="perspective-crop-apply"
                disabled={perspectiveCropApplying}
                onClick={() => void applyPerspectiveCropPreview()}
              >
                {perspectiveCropApplying
                  ? 'Applying…'
                  : 'Apply perspective crop'}
              </button>
              <button
                type="button"
                data-testid="perspective-crop-cancel"
                onClick={cancelPerspectiveCropPreview}
              >
                Cancel
              </button>
            </fieldset>
          )}
          {slicePreview && (
            <fieldset
              className="crop-preview-controls slice-preview-controls"
              aria-label="Slice preview controls"
              data-testid="slice-preview-controls"
            >
              <label>
                <span>Slice name</span>
                <input
                  aria-label="Slice name"
                  required
                  maxLength={120}
                  value={sliceName}
                  onChange={(event) => setSliceName(event.target.value)}
                />
              </label>
              <span>
                {slicePreview.width} × {slicePreview.height} px
              </span>
              <button
                type="button"
                data-testid="slice-download"
                disabled={sliceExporting}
                onClick={() => void downloadSlice()}
              >
                {sliceExporting ? 'Encoding…' : 'Download PNG'}
              </button>
              <button
                type="button"
                data-testid="slice-save"
                onClick={slicePreviewMode === 'draft' ? saveSliceMetadata : updateSelectedSlice}
              >
                {slicePreviewMode === 'draft' ? 'Save slice' : 'Update slice'}
              </button>
              {slicePreviewMode === 'selected' && (
                <button
                  type="button"
                  data-testid="slice-delete"
                  onClick={deleteSelectedSlice}
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                data-testid="slice-cancel"
                onClick={cancelSlicePreview}
              >
                Cancel
              </button>
            </fieldset>
          )}
          {framePreview && (
            <fieldset
              className="crop-preview-controls frame-preview-controls"
              aria-label="Frame preview controls"
              data-testid="frame-preview-controls"
            >
              <label>
                <span>Artboard name</span>
                <input
                  aria-label="Artboard name"
                  required
                  maxLength={120}
                  value={frameName}
                  onChange={(event) => setFrameName(event.target.value)}
                />
              </label>
              <label>
                <span>Background</span>
                <input
                  aria-label="Artboard background"
                  type="color"
                  value={frameBackground}
                  onChange={(event) => setFrameBackground(event.target.value)}
                />
              </label>
              <span>
                {framePreview.width} × {framePreview.height} px · selected layers render independently
              </span>
              <button
                type="button"
                data-testid="frame-add"
                onClick={addFrameArtboard}
              >
                Add artboard
              </button>
              <button
                type="button"
                data-testid="frame-cancel"
                onClick={cancelFramePreview}
              >
                Cancel
              </button>
            </fieldset>
          )}
          {frame?.artboards?.length ? (
            <fieldset className="artboard-controls" aria-label="Artboard controls" data-testid="artboard-controls">
              <label>
                <span>Active artboard</span>
                <select
                  aria-label="Active artboard"
                  value={frame.activeArtboardId || frame.artboards[0].id}
                  onChange={(event) => selectArtboard(event.target.value)}
                >
                  {frame.artboards.map((item) => (
                    <option key={item.id} value={item.id} disabled={!item.visible}>
                      {item.name} ({item.w} × {item.h} px)
                    </option>
                  ))}
                </select>
              </label>
              <span data-testid="artboard-render-note">Export renders the selected artboard layer tree independently.</span>
            </fieldset>
          ) : null}
          <div
            className="canvas-wrap"
            data-testid="canvas-wrap"
            style={{
              width: `${zoom}%`,
              transform: `rotate(${normalizeViewRotation(viewRotation)}deg)`,
              transformOrigin: 'center center',
            }}
            data-artboard-count={frame?.artboards?.length ?? 0}
            data-active-artboard={frame?.activeArtboardId ?? ''}
            data-view-rotation={normalizeViewRotation(viewRotation)}
          >
            <canvas
              ref={canvas}
              data-testid="editor-canvas"
              data-rendering={doc.rendering ? 'true' : 'false'}
              onPointerDown={(e) => void pointerDown(e)}
              onPointerMove={pointerMove}
              onPointerUp={(e) => void pointerUp(e)}
              onPointerCancel={(e) => void pointerUp(e)}
              onDoubleClick={doubleClick}
              className={`tool-${tool}`}
            />
            {quickMasking && (
              <canvas
                ref={quickMaskOverlayCanvas}
                className="quick-mask-overlay"
                data-testid="quick-mask-overlay"
                aria-hidden="true"
              />
            )}
            {frame && (frame.measurements?.length || measurementPreview) ? (
              <svg
                className="measurement-overlay"
                data-testid="measurement-overlay"
                viewBox={`0 0 ${frame.w} ${frame.h}`}
                preserveAspectRatio="none"
                aria-label="Sampling and measurement overlays"
              >
                {(frame.measurements || []).map((item) => {
                  if (item.kind === 'sample')
                    return (
                      <g key={item.id} className="measurement-sample">
                        <circle cx={item.x} cy={item.y} r="8" />
                        <circle
                          cx={item.x}
                          cy={item.y}
                          r="5"
                          fill={item.color}
                        />
                        <title>{`${item.color.toUpperCase()} · alpha ${item.alpha}`}</title>
                      </g>
                    );
                  if (item.kind === 'ruler') {
                    const labelX = (item.start.x + item.end.x) / 2;
                    const labelY = (item.start.y + item.end.y) / 2 - 8;
                    return (
                      <g key={item.id} className="measurement-ruler">
                        <line
                          x1={item.start.x}
                          y1={item.start.y}
                          x2={item.end.x}
                          y2={item.end.y}
                        />
                        <text x={labelX} y={labelY}>
                          {formatMeasurement(item.pixels, item.angle)}
                        </text>
                      </g>
                    );
                  }
                  if (item.kind === 'note')
                    return (
                      <g key={item.id} className="measurement-note">
                        <circle cx={item.x} cy={item.y} r="7" />
                        <text x={item.x + 11} y={item.y + 4}>
                          {item.text}
                        </text>
                      </g>
                    );
                  return (
                    <g key={item.id} className="measurement-count">
                      <circle cx={item.x} cy={item.y} r="11" />
                      <text x={item.x} y={item.y + 4}>
                        {item.index}
                      </text>
                    </g>
                  );
                })}
                {measurementPreview && (
                  <g className="measurement-ruler measurement-preview">
                    <line
                      x1={measurementPreview.start.x}
                      y1={measurementPreview.start.y}
                      x2={measurementPreview.end.x}
                      y2={measurementPreview.end.y}
                    />
                    <text
                      x={
                        (measurementPreview.start.x +
                          measurementPreview.end.x) /
                        2
                      }
                      y={
                        (measurementPreview.start.y +
                          measurementPreview.end.y) /
                          2 -
                        8
                      }
                    >
                      {formatMeasurement(
                        measurementDistance(
                          measurementPreview.start,
                          measurementPreview.end,
                        ),
                        measurementAngle(
                          measurementPreview.start,
                          measurementPreview.end,
                        ),
                      )}
                    </text>
                  </g>
                )}
              </svg>
            ) : null}
            {cropPreview && (
              <svg
                className="crop-preview-overlay"
                data-testid="crop-preview-overlay"
                viewBox={`0 0 ${cropPreview.frame.w} ${cropPreview.frame.h}`}
                preserveAspectRatio="none"
                aria-label={`Crop preview ${cropPreview.width} by ${cropPreview.height} pixels`}
              >
                <rect
                  x="0"
                  y="0"
                  width={cropPreview.frame.w}
                  height={cropPreview.top}
                />
                <rect
                  x="0"
                  y={cropPreview.top}
                  width={cropPreview.left}
                  height={cropPreview.height}
                />
                <rect
                  x={cropPreview.left + cropPreview.width}
                  y={cropPreview.top}
                  width={Math.max(
                    0,
                    cropPreview.frame.w - cropPreview.left - cropPreview.width,
                  )}
                  height={cropPreview.height}
                />
                <rect
                  x="0"
                  y={cropPreview.top + cropPreview.height}
                  width={cropPreview.frame.w}
                  height={Math.max(
                    0,
                    cropPreview.frame.h - cropPreview.top - cropPreview.height,
                  )}
                />
                <rect
                  className="crop-preview-border"
                  x={cropPreview.left}
                  y={cropPreview.top}
                  width={cropPreview.width}
                  height={cropPreview.height}
                />
                <line
                  className="crop-preview-guide"
                  x1={cropPreview.left + cropPreview.width / 3}
                  y1={cropPreview.top}
                  x2={cropPreview.left + cropPreview.width / 3}
                  y2={cropPreview.top + cropPreview.height}
                />
                <line
                  className="crop-preview-guide"
                  x1={cropPreview.left + (cropPreview.width * 2) / 3}
                  y1={cropPreview.top}
                  x2={cropPreview.left + (cropPreview.width * 2) / 3}
                  y2={cropPreview.top + cropPreview.height}
                />
                <line
                  className="crop-preview-guide"
                  x1={cropPreview.left}
                  y1={cropPreview.top + cropPreview.height / 3}
                  x2={cropPreview.left + cropPreview.width}
                  y2={cropPreview.top + cropPreview.height / 3}
                />
                <line
                  className="crop-preview-guide"
                  x1={cropPreview.left}
                  y1={cropPreview.top + (cropPreview.height * 2) / 3}
                  x2={cropPreview.left + cropPreview.width}
                  y2={cropPreview.top + (cropPreview.height * 2) / 3}
                />
              </svg>
            )}
            {perspectiveCropPreview && (
              <svg
                className="crop-preview-overlay perspective-crop-overlay"
                data-testid="perspective-crop-overlay"
                viewBox={`0 0 ${perspectiveCropPreview.frame.w} ${perspectiveCropPreview.frame.h}`}
                preserveAspectRatio="none"
                aria-label={`Perspective crop preview ${perspectiveCropPreview.width} by ${perspectiveCropPreview.height} pixels`}
              >
                <polygon
                  className="perspective-crop-dim"
                  points={`0,0 ${perspectiveCropPreview.frame.w},0 ${perspectiveCropPreview.frame.w},${perspectiveCropPreview.frame.h} 0,${perspectiveCropPreview.frame.h}`}
                />
                <polygon
                  className="perspective-crop-border"
                  points={perspectiveCropPreview.quad
                    .map((point) => `${point.x},${point.y}`)
                    .join(' ')}
                />
                {perspectiveCropPreview.quad.map((point, index) => (
                  <circle
                    key={index}
                    className="perspective-crop-handle"
                    cx={point.x}
                    cy={point.y}
                    r="9"
                    aria-hidden="true"
                  />
                ))}
              </svg>
            )}
            {slicePreview && (
              <svg
                className="slice-preview-overlay"
                data-testid="slice-preview-overlay"
                viewBox={`0 0 ${slicePreview.frame.w} ${slicePreview.frame.h}`}
                preserveAspectRatio="none"
                aria-label={`Slice preview ${slicePreview.width} by ${slicePreview.height} pixels`}
              >
                <rect
                  x="0"
                  y="0"
                  width={slicePreview.frame.w}
                  height={slicePreview.y}
                />
                <rect
                  x="0"
                  y={slicePreview.y}
                  width={slicePreview.x}
                  height={slicePreview.height}
                />
                <rect
                  x={slicePreview.x + slicePreview.width}
                  y={slicePreview.y}
                  width={Math.max(
                    0,
                    slicePreview.frame.w - slicePreview.x - slicePreview.width,
                  )}
                  height={slicePreview.height}
                />
                <rect
                  x="0"
                  y={slicePreview.y + slicePreview.height}
                  width={slicePreview.frame.w}
                  height={Math.max(
                    0,
                    slicePreview.frame.h - slicePreview.y - slicePreview.height,
                  )}
                />
                <rect
                  className="slice-preview-border"
                  x={slicePreview.x}
                  y={slicePreview.y}
                  width={slicePreview.width}
                  height={slicePreview.height}
                />
                <text x={slicePreview.x + 8} y={slicePreview.y + 18}>
                  {sliceName || 'Unnamed slice'}
                </text>
              </svg>
            )}
            {frame?.artboards?.length ? (
              <svg
                className="artboard-overlay"
                data-testid="artboard-overlay"
                viewBox={`0 0 ${frame.w} ${frame.h}`}
                preserveAspectRatio="none"
                aria-label="Artboard viewports"
              >
                {frame.artboards.map((artboard) => (
                  <g
                    key={artboard.id}
                    className={artboard.id === frame.activeArtboardId ? 'artboard-active' : 'artboard-inactive'}
                  >
                    <rect
                      x={artboard.x}
                      y={artboard.y}
                      width={artboard.w}
                      height={artboard.h}
                      style={{ fill: artboard.background || '#ffffff' }}
                    />
                    <rect
                      className="artboard-border"
                      x={artboard.x}
                      y={artboard.y}
                      width={artboard.w}
                      height={artboard.h}
                    />
                    <text x={artboard.x + 8} y={Math.max(16, artboard.y - 7)}>
                      {artboard.name}
                    </text>
                  </g>
                ))}
              </svg>
            ) : null}
            {framePreview && (
              <svg
                className="frame-preview-overlay"
                data-testid="frame-preview-overlay"
                viewBox={`0 0 ${framePreview.frame.w} ${framePreview.frame.h}`}
                preserveAspectRatio="none"
                aria-label={`Frame preview ${framePreview.width} by ${framePreview.height} pixels`}
              >
                <rect
                  className="frame-preview-dim"
                  x="0"
                  y="0"
                  width={framePreview.frame.w}
                  height={framePreview.frame.h}
                />
                <rect
                  className="frame-preview-border"
                  x={framePreview.x}
                  y={framePreview.y}
                  width={framePreview.width}
                  height={framePreview.height}
                />
              </svg>
            )}
          </div>
          <div className="zoom">
            <button
              aria-label="Zoom out"
              onClick={() => setZoom(Math.max(20, zoom - 10))}
            >
              <ZoomOut />
            </button>
            <input
              aria-label="Zoom"
              type="range"
              min="20"
              max="140"
              value={zoom}
              onChange={(e) => setZoom(+e.target.value)}
            />
            <span>{zoom}%</span>
            <button
              aria-label="Zoom in"
              onClick={() => setZoom(Math.min(140, zoom + 10))}
            >
              <ZoomIn />
            </button>
          </div>
        </section>
        <aside className="inspector">
          {frame && (
            <LayersPanel
              frame={frame}
              select={select}
              selectAll={selectAllLayers}
              deselectLayers={deselectLayers}
              isolateLayers={isolateLayers}
              edit={editLayer}
              add={addPaint}
              addAdjustment={addAdjustmentLayer}
              addSmartObject={() => chooseSmartObjectFile(false)}
              replaceSmartObject={() => chooseSmartObjectFile(true)}
              duplicate={duplicate}
              remove={remove}
              reorder={reorder}
              arrange={arrangeLayers}
              groupActive={groupActiveLayer}
              ungroupActive={ungroupActiveLayer}
              editGroup={editGroup}
              align={alignActiveLayer}
              distribute={distributeGroupLayers}
              rasterize={() => void rasterize()}
              importImage={() => layerFile.current?.click()}
              createMask={createMaskFromSelection}
              invertMask={invertLayerMask}
              toggleMask={toggleLayerMask}
              clearMask={clearMask}
              createClipping={createClippingMask}
              releaseClipping={releaseClippingMask}
              clearSelection={() => setSelection(undefined)}
              invertSelection={invertSelection}
              selectionOperation={selectionOperation}
              setSelectionOperation={setSelectionOperation}
              setSelectionFeather={setSelectionFeather}
            />
          )}
          {frame && (
            <section
              className="panel saved-selections-panel"
              aria-label="Saved selections"
            >
              <Title icon={Bookmark} text="Saved selections" />
              <label className="layer-field">
                Selection name
                <input
                  aria-label="Saved selection name"
                  maxLength={160}
                  value={savedSelectionName}
                  onChange={(event) =>
                    setSavedSelectionName(event.target.value)
                  }
                />
              </label>
              <div className="layer-actions">
                <button
                  onClick={() => saveCurrentSelection()}
                  disabled={!frame.selection}
                >
                  Save selection
                </button>
                <button onClick={exportSelection} disabled={!frame.selection}>
                  Download selection file
                </button>
              </div>
              <div className="saved-selection-list">
                {(frame.savedSelections?.selections || []).map((entry) => (
                  <div className="saved-selection-row" key={entry.id}>
                    <span>{entry.name}</span>
                    <button onClick={() => loadSavedSelection(entry.id)}>
                      Load
                    </button>
                    <button onClick={() => renameSavedSelection(entry.id)}>
                      Rename
                    </button>
                    <button onClick={() => deleteSavedSelection(entry.id)}>
                      Delete
                    </button>
                  </div>
                ))}
                {!frame.savedSelections?.selections.length && (
                  <small>No saved selections yet.</small>
                )}
              </div>
            </section>
          )}
          {quickMasking && quickMask && (
            <section
              className="panel quick-mask-panel"
              aria-label="Quick Mask options"
            >
              <Title
                icon={Bookmark}
                text="Quick Mask mode"
                action="Exit"
                onClick={exitQuickMask}
              />
              <label>
                <input
                  type="checkbox"
                  checked={quickMaskReveal}
                  onChange={(event) => setQuickMaskReveal(event.target.checked)}
                />
                Reveal selection while painting
              </label>
              <p>
                Paint hides selected pixels in red. Hold Alt to reveal while
                painting.
              </p>
            </section>
          )}
          <section className="panel">
            <Title
              icon={WandSparkles}
              text="Adjust selected layer"
              action="Reset"
              onClick={() => {
                resetAdjustments();
                setNotice('Adjustments reset');
              }}
            />
            <Slider
              label="Brightness"
              value={brightness}
              min={20}
              max={180}
              set={setBrightness}
            />
            <Slider
              label="Contrast"
              value={contrast}
              min={20}
              max={180}
              set={setContrast}
            />
            <Slider
              label="Saturation"
              value={saturation}
              min={0}
              max={200}
              set={setSaturation}
            />
            <Slider
              label="Hue"
              value={hue}
              min={-180}
              max={180}
              set={setHue}
              suffix="°"
            />
            <Slider
              label="Blur"
              value={blur}
              min={0}
              max={12}
              set={setBlur}
              suffix="px"
            />
            {tool !== 'dodge' && tool !== 'burn' && tool !== 'sponge' && (
              <>
                <div className="adjustment-subtitle">Photo finishing</div>
                <Slider
                  label="Exposure"
                  value={photoAdjustments.exposure}
                  min={-5}
                  max={5}
                  step={0.1}
                  set={(value) => setPhotoAdjustments({ exposure: value })}
                  suffix=" EV"
                />
                <Slider
                  label="Vibrance"
                  value={photoAdjustments.vibrance}
                  min={-100}
                  max={100}
                  set={(value) => setPhotoAdjustments({ vibrance: value })}
                  suffix=""
                />
                <label className="check-row">
                  <input
                    aria-label="Black and White"
                    type="checkbox"
                    checked={photoAdjustments.blackAndWhite}
                    onChange={(event) =>
                      setPhotoAdjustments({ blackAndWhite: event.target.checked })
                    }
                  />
                  Black and White
                </label>
              </>
            )}
            <div className="adjustment-subtitle">Levels (nondestructive)</div>
            <Slider
              label="Levels black point"
              value={levelsBlack}
              min={0}
              max={254}
              set={(value) => setLevelsBlack(Math.min(value, levelsWhite - 1))}
              suffix=""
            />
            <Slider
              label="Levels white point"
              value={levelsWhite}
              min={1}
              max={255}
              set={(value) => setLevelsWhite(Math.max(value, levelsBlack + 1))}
              suffix=""
            />
            <Slider
              label="Levels gamma"
              value={levelsGamma}
              min={0.1}
              max={3}
              step={0.1}
              set={setLevelsGamma}
              suffix=""
            />
            <Slider
              label="Levels output black"
              value={levelsOutputBlack}
              min={0}
              max={254}
              set={(value) =>
                setLevelsOutputBlack(Math.min(value, levelsOutputWhite - 1))
              }
              suffix=""
            />
            <Slider
              label="Levels output white"
              value={levelsOutputWhite}
              min={1}
              max={255}
              set={(value) =>
                setLevelsOutputWhite(Math.max(value, levelsOutputBlack + 1))
              }
              suffix=""
            />
            <div className="adjustment-subtitle">Curves (nondestructive)</div>
            <CurveEditor
              label="RGB"
              points={curves.rgb}
              onChange={(points) => setCurve('rgb', points)}
            />
            <CurveEditor
              label="Red"
              points={curves.red}
              onChange={(points) => setCurve('red', points)}
            />
            <CurveEditor
              label="Green"
              points={curves.green}
              onChange={(points) => setCurve('green', points)}
            />
            <CurveEditor
              label="Blue"
              points={curves.blue}
              onChange={(points) => setCurve('blue', points)}
            />
            <div className="adjustment-subtitle">Color Balance</div>
            <Slider
              label="Shadows cyan/red"
              value={colorBalance.shadowsCyanRed}
              min={-100}
              max={100}
              set={(value) => setColorBalance({ shadowsCyanRed: value })}
              suffix=""
            />
            <Slider
              label="Shadows magenta/green"
              value={colorBalance.shadowsMagentaGreen}
              min={-100}
              max={100}
              set={(value) => setColorBalance({ shadowsMagentaGreen: value })}
              suffix=""
            />
            <Slider
              label="Shadows yellow/blue"
              value={colorBalance.shadowsYellowBlue}
              min={-100}
              max={100}
              set={(value) => setColorBalance({ shadowsYellowBlue: value })}
              suffix=""
            />
            <Slider
              label="Midtones cyan/red"
              value={colorBalance.midtonesCyanRed}
              min={-100}
              max={100}
              set={(value) => setColorBalance({ midtonesCyanRed: value })}
              suffix=""
            />
            <Slider
              label="Midtones magenta/green"
              value={colorBalance.midtonesMagentaGreen}
              min={-100}
              max={100}
              set={(value) => setColorBalance({ midtonesMagentaGreen: value })}
              suffix=""
            />
            <Slider
              label="Midtones yellow/blue"
              value={colorBalance.midtonesYellowBlue}
              min={-100}
              max={100}
              set={(value) => setColorBalance({ midtonesYellowBlue: value })}
              suffix=""
            />
            <Slider
              label="Highlights cyan/red"
              value={colorBalance.highlightsCyanRed}
              min={-100}
              max={100}
              set={(value) => setColorBalance({ highlightsCyanRed: value })}
              suffix=""
            />
            <Slider
              label="Highlights magenta/green"
              value={colorBalance.highlightsMagentaGreen}
              min={-100}
              max={100}
              set={(value) =>
                setColorBalance({ highlightsMagentaGreen: value })
              }
              suffix=""
            />
            <Slider
              label="Highlights yellow/blue"
              value={colorBalance.highlightsYellowBlue}
              min={-100}
              max={100}
              set={(value) => setColorBalance({ highlightsYellowBlue: value })}
              suffix=""
            />
            <label className="check-row">
              <input
                aria-label="Preserve luminosity"
                type="checkbox"
                checked={colorBalance.preserveLuminosity}
                onChange={(event) =>
                  setColorBalance({ preserveLuminosity: event.target.checked })
                }
              />
              Preserve luminosity
            </label>
            <div className="adjustment-subtitle">Sharpen and Noise</div>
            <Slider
              label="Sharpen amount"
              value={sharpenNoise.sharpen}
              min={0}
              max={100}
              set={(value) => setSharpenNoise({ sharpen: value })}
              suffix=""
            />
            <Slider
              label="Sharpen radius"
              value={sharpenNoise.radius}
              min={0}
              max={8}
              set={(value) => setSharpenNoise({ radius: value })}
              suffix=" px"
            />
            <Slider
              label="Sharpen threshold"
              value={sharpenNoise.threshold}
              min={0}
              max={255}
              set={(value) => setSharpenNoise({ threshold: value })}
              suffix=""
            />
            <Slider
              label="Noise amount"
              value={sharpenNoise.noise}
              min={0}
              max={100}
              set={(value) => setSharpenNoise({ noise: value })}
              suffix=""
            />
            <Slider
              label="Noise seed"
              value={sharpenNoise.seed % 10001}
              min={0}
              max={10000}
              set={(value) => setSharpenNoise({ seed: value })}
              suffix=""
            />
            <label className="check-row">
              <input
                aria-label="Monochromatic noise"
                type="checkbox"
                checked={sharpenNoise.monochromatic}
                onChange={(event) =>
                  setSharpenNoise({ monochromatic: event.target.checked })
                }
              />
              Monochromatic noise
            </label>
            <p className="adjust-note">
              Adjustments stay editable on the selected layer. Hue rotates
              colours, Levels remaps input black, white and midtone gamma, and
              Color Balance targets shadows, midtones and highlights. Sharpen
              uses a bounded unsharp mask and Noise is deterministic, all
              without changing source pixels.
            </p>
          </section>
          {tool === 'rotate-view' && (
            <section className="panel" data-testid="view-rotation-controls">
              <Title icon={RotateCw} text="Rotate View" />
              <output data-testid="view-rotation-value" aria-live="polite">
                {normalizeViewRotation(viewRotation)}°
              </output>
              <div className="transform">
                <button type="button" aria-label="Rotate view left 15 degrees" onClick={() => rotateViewBy(-15)}>
                  <RotateCcw />
                </button>
                <button type="button" aria-label="Rotate view right 15 degrees" onClick={() => rotateViewBy(15)}>
                  <RotateCw />
                </button>
                <button type="button" className="secondary" aria-label="Reset view rotation" onClick={resetViewRotation}>
                  Reset view
                </button>
              </div>
              <p className="adjust-note">Rotate View changes only the canvas viewport. Document pixels, layers and exports stay unchanged.</p>
            </section>
          )}
          <section className="panel">
            <Title icon={Crop} text="Transform" />
            <div className="transform">
              <button
                aria-label="Rotate left"
                onClick={() => transform('left')}
              >
                <RotateCcw />
              </button>
              <button
                aria-label="Rotate right"
                onClick={() => transform('right')}
              >
                <RotateCw />
              </button>
              <button
                aria-label="Flip horizontal"
                onClick={() => transform('h')}
              >
                <FlipHorizontal2 />
              </button>
              <button aria-label="Flip vertical" onClick={() => transform('v')}>
                <FlipVertical2 />
              </button>
            </div>
          </section>
          {(tool === 'brush' ||
            tool === 'pencil' ||
            tool === 'color-replace' ||
            tool === 'eraser' ||
            tool === 'background-eraser' ||
            tool === 'magic-eraser' ||
            tool === 'mask-brush' ||
            tool === 'mask-eraser' ||
            tool === 'adjustment-brush' ||
            tool === 'dodge' ||
            tool === 'burn' ||
            tool === 'sponge' ||
            tool === 'smudge' ||
            tool === 'clone' ||
            tool === 'heal' ||
            tool === 'spot-heal' ||
            tool === 'patch' ||
            tool === 'red-eye' ||
            tool === 'pattern-stamp' ||
            tool === 'mixer-brush' ||
            tool === 'history-brush' ||
            tool === 'selection-brush' ||
            tool === 'quick-selection' ||
            tool === 'rectangle' ||
            tool === 'ellipse' ||
            tool === 'line' ||
            tool === 'polygon') && (
            <section className="panel">
              <Title icon={Brush} text="Tool options" />
              {tool !== 'magic-eraser' && (
                <Slider
                  label="Size"
                  value={size}
                  min={2}
                  max={100}
                  set={setSize}
                  suffix="px"
                />
              )}
              {(tool === 'brush' ||
                tool === 'pencil' ||
                tool === 'color-replace' ||
                tool === 'eraser' ||
                tool === 'background-eraser' ||
                tool === 'magic-eraser' ||
                tool === 'mask-brush' ||
                tool === 'mask-eraser' ||
                tool === 'adjustment-brush' ||
                tool === 'dodge' ||
                tool === 'burn' ||
                tool === 'sponge' ||
                tool === 'smudge' ||
                tool === 'clone' ||
                tool === 'heal' ||
                tool === 'spot-heal' ||
                tool === 'patch' ||
                tool === 'red-eye' ||
                tool === 'pattern-stamp' ||
                tool === 'mixer-brush' ||
                tool === 'history-brush' ||
                tool === 'selection-brush' ||
                tool === 'quick-selection') && (
                <>
                  {(tool === 'brush' || tool === 'pencil') && (
                    <label className="select-row">
                      <span>Brush preset</span>
                      <select
                        aria-label="Brush preset"
                        value={brushPreset}
                        onChange={(event) =>
                          applyBrushPreset(event.target.value as BrushPresetId)
                        }
                      >
                        {BRUSH_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {tool !== 'pencil' &&
                    tool !== 'color-replace' &&
                    tool !== 'magic-eraser' &&
                    tool !== 'red-eye' && (
                      <Slider
                        label="Hardness"
                        value={hardness}
                        min={0}
                        max={100}
                        set={setHardness}
                        suffix="%"
                      />
                    )}
                  {tool === 'spot-heal' && (
                    <p className="adjust-note">
                      Samples a bounded local context ring and keeps the
                      source and alpha channel unchanged. Use Remove Background
                      for edge-connected backdrop removal.
                    </p>
                  )}
                  {tool === 'patch' && (
                    <p className="adjust-note">
                      Click a source area, then drag over a destination. Patch
                      copies a bounded local neighbourhood while keeping the
                      source asset and alpha channel unchanged.
                    </p>
                  )}
                  {(tool === 'mask-brush' ||
                    tool === 'mask-eraser' ||
                    tool === 'adjustment-brush') && (
                    <p className="adjust-note">
                      {tool === 'adjustment-brush'
                        ? 'Paints the selected adjustment layer mask in canvas space; the adjustment remains nondestructive and each stroke is undoable.'
                        : 'Refines the existing layer mask in canvas space. Mask Brush reveals masked pixels and Mask Eraser conceals them; the source raster remains untouched and each stroke is undoable.'}
                    </p>
                  )}
                  {tool !== 'magic-eraser' && tool !== 'red-eye' && (
                    <Slider
                      label={
                        tool === 'dodge' ||
                        tool === 'burn' ||
                        tool === 'sponge' ||
                        tool === 'smudge'
                          ? 'Flow'
                          : 'Opacity'
                      }
                      value={brushOpacity}
                      min={1}
                      max={100}
                      set={setBrushOpacity}
                      suffix="%"
                    />
                  )}
                  {(tool === 'brush' ||
                    tool === 'pencil' ||
                    tool === 'eraser' ||
                    tool === 'clone' ||
                    tool === 'heal' ||
                    tool === 'pattern-stamp') && (
                    <>
                      <Slider
                        label="Spacing"
                        value={brushSpacing}
                        min={1}
                        max={100}
                        set={setBrushSpacing}
                        suffix="%"
                      />
                      <Slider
                        label="Angle"
                        value={brushAngle}
                        min={-180}
                        max={180}
                        set={setBrushAngle}
                        suffix="°"
                      />
                      <Slider
                        label="Roundness"
                        value={brushRoundness}
                        min={1}
                        max={100}
                        set={setBrushRoundness}
                        suffix="%"
                      />
                      <label className="check-row">
                        <input
                          aria-label="Flip tip horizontal"
                          type="checkbox"
                          checked={brushFlipX}
                          onChange={(event) => setBrushFlipX(event.target.checked)}
                        />
                        Flip tip horizontal
                      </label>
                      <label className="check-row">
                        <input
                          aria-label="Flip tip vertical"
                          type="checkbox"
                          checked={brushFlipY}
                          onChange={(event) => setBrushFlipY(event.target.checked)}
                        />
                        Flip tip vertical
                      </label>
                      <p className="adjust-note">
                        Tip settings apply to future local dabs. Advanced
                        scattering, texture, dual-brush and wet-media dynamics
                        remain staged for a later bounded renderer increment.
                      </p>
                    </>
                  )}
                  {tool !== 'pencil' &&
                    tool !== 'color-replace' &&
                    tool !== 'magic-eraser' &&
                    tool !== 'dodge' &&
                    tool !== 'burn' &&
                    tool !== 'sponge' &&
                    tool !== 'smudge' &&
                    tool !== 'red-eye' &&
                    tool !== 'spot-heal' &&
                    tool !== 'patch' &&
                    tool !== 'mask-brush' &&
                    tool !== 'mask-eraser' &&
                    tool !== 'adjustment-brush' &&
                    tool !== 'quick-selection' && (
                      <>
                        <label className="check-row">
                          <input
                            aria-label="Pressure affects size"
                            type="checkbox"
                            checked={pressureSize}
                            onChange={(event) =>
                              setPressureSize(event.target.checked)
                            }
                          />
                          Pressure affects size
                        </label>
                        <label className="check-row">
                          <input
                            aria-label="Pressure affects opacity"
                            type="checkbox"
                            checked={pressureOpacity}
                            onChange={(event) =>
                              setPressureOpacity(event.target.checked)
                            }
                          />
                          Pressure affects opacity
                        </label>
                        <p className="adjust-note">
                          Pressure mapping is off by default. Pen and touch
                          inputs use full size and opacity until each option is
                          enabled.
                        </p>
                      </>
                    )}
                  {(tool === 'color-replace' ||
                    tool === 'background-eraser' ||
                    tool === 'magic-eraser' ||
                    tool === 'quick-selection') && (
                    <Slider
                      label="Color tolerance"
                      value={colorTolerance}
                      min={0}
                      max={255}
                      set={setColorTolerance}
                      suffix=""
                    />
                  )}
                  {(tool === 'dodge' || tool === 'burn') && (
                    <>
                      <Slider
                        label="Exposure"
                        value={tonalExposure}
                        min={1}
                        max={100}
                        set={setTonalExposure}
                        suffix="%"
                      />
                      <label className="select-row">
                        <span>Range</span>
                        <select
                          aria-label="Tonal range"
                          value={tonalRange}
                          onChange={(event) =>
                            setTonalRange(event.target.value as TonalRange)
                          }
                        >
                          <option value="shadows">Shadows</option>
                          <option value="midtones">Midtones</option>
                          <option value="highlights">Highlights</option>
                        </select>
                      </label>
                    </>
                  )}
                  {tool === 'sponge' && (
                    <>
                      <Slider
                        label="Vibrance"
                        value={spongeVibrance}
                        min={1}
                        max={100}
                        set={setSpongeVibrance}
                        suffix="%"
                      />
                      <label className="select-row">
                        <span>Mode</span>
                        <select
                          aria-label="Sponge mode"
                          value={spongeMode}
                          onChange={(event) =>
                            setSpongeMode(event.target.value as SpongeMode)
                          }
                        >
                          <option value="saturate">Saturate</option>
                          <option value="desaturate">Desaturate</option>
                        </select>
                      </label>
                    </>
                  )}
                  {tool === 'mixer-brush' && (
                    <>
                      <Slider label="Wet" value={mixerBrush.wet} min={0} max={100} set={(value) => setMixerBrush((current) => ({ ...current, wet: value }))} suffix="%" />
                      <Slider label="Load" value={mixerBrush.load} min={0} max={100} set={(value) => setMixerBrush((current) => ({ ...current, load: value }))} suffix="%" />
                      <Slider label="Mix" value={mixerBrush.mix} min={0} max={100} set={(value) => setMixerBrush((current) => ({ ...current, mix: value }))} suffix="%" />
                      <Slider label="Flow" value={mixerBrush.flow} min={1} max={100} set={(value) => setMixerBrush((current) => ({ ...current, flow: value }))} suffix="%" />
                      <p className="adjust-note">Mixer Brush blends an immutable source snapshot with the active raster. Wet-media buildup, bristle scattering and canvas rotation are intentionally bounded for predictable local drafts.</p>
                    </>
                  )}
                  {tool === 'history-brush' && (
                    <>
                      <Slider label="History opacity" value={historyBrush.opacity} min={1} max={100} set={(value) => setHistoryBrush((current) => ({ ...current, opacity: value }))} suffix="%" />
                      <Slider label="History flow" value={historyBrush.flow} min={1} max={100} set={(value) => setHistoryBrush((current) => ({ ...current, flow: value }))} suffix="%" />
                      <label className="select-row">
                        <span>History source</span>
                        <select aria-label="History source" value={String(historySourceIndex ?? index.current)} onChange={(event) => setHistorySourceIndex(Number(event.target.value))}>
                          {history.current.map((_, snapshot) => <option key={snapshot} value={snapshot}>Snapshot {snapshot + 1}</option>)}
                        </select>
                      </label>
                      <button type="button" className="secondary" onClick={() => { setHistorySourceIndex(index.current); setNotice(`History Brush source set to snapshot ${index.current + 1}`); }}>Set source to current snapshot</button>
                      <p className="adjust-note">Source snapshot: {typeof historySourceIndex === 'number' ? historySourceIndex + 1 : index.current + 1} of {history.current.length}. Restore is painted through the brush and remains undoable; discarded snapshots cannot be recovered.</p>
                    </>
                  )}
                  {tool === 'pattern-stamp' && (
                    <>
                      <label className="select-row">
                        <span>Pattern</span>
                        <select
                          aria-label="Pattern source"
                          value={patternId}
                          onChange={(event) =>
                            setPatternId(event.target.value as PatternId)
                          }
                        >
                          {PATTERN_IDS.map((id) => (
                            <option key={id} value={id}>
                              {id[0].toUpperCase() + id.slice(1)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Slider
                        label="Tile size"
                        value={patternTileSize}
                        min={4}
                        max={128}
                        set={setPatternTileSize}
                        suffix="px"
                      />
                      <p className="adjust-note">
                        Pattern Stamp generates a bounded local tile from the
                        foreground/background wells. No source image leaves this
                        device.
                      </p>
                    </>
                  )}
                  {(tool === 'clone' || tool === 'heal') && (
                    <p className="adjust-note">
                      Option/Alt-click the canvas to set or re-anchor the
                      source point. Drag to paint with a fixed source offset;
                      the source pixels stay unchanged until you commit the
                      stroke.
                    </p>
                  )}
                  {tool === 'selection-brush' && (
                    <p className="adjust-note">
                      Paint an editable alpha selection. Use Selection mode in
                      the Layers panel for replace, add, subtract or intersect;
                      the source pixels remain unchanged.
                    </p>
                  )}
                  {tool === 'quick-selection' && (
                    <p className="adjust-note">
                      Grows a local connected colour selection from brush samples.
                      Strong colour edges stop the flood; no semantic object model or upload is used.
                    </p>
                  )}
                  {tool === 'red-eye' && (
                    <>
                      <Slider
                        label="Red threshold"
                        value={redEyeThreshold}
                        min={0}
                        max={255}
                        set={setRedEyeThreshold}
                        suffix=""
                      />
                      <Slider
                        label="Correction amount"
                        value={redEyeAmount}
                        min={0}
                        max={100}
                        set={setRedEyeAmount}
                        suffix="%"
                      />
                      <p className="adjust-note">
                        Corrects conservative red-dominant pixels locally. It
                        preserves transparency and stays on this device.
                      </p>
                    </>
                  )}
                </>
              )}
            </section>
          )}
          {tool === 'text' && (
            <section className="panel">
              <Title icon={Type} text="Text" />
              <input
                aria-label="Text content"
                className="text-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <Slider
                label="Size"
                value={fontSize}
                min={16}
                max={160}
                set={setFontSize}
                suffix="px"
              />
            </section>
          )}
          <section className="panel">
            <Title icon={Sparkles} text="Quick filters" />
            <div className="filters">
              {FILTERS.map(([label, value, first, second]) => (
                <button
                  key={label}
                  className={filter === value ? 'selected' : ''}
                  onClick={() => chooseFilter(value, label)}
                  aria-label={`${label} filter`}
                >
                  <i
                    style={{
                      background: `linear-gradient(135deg,${first},${second})`,
                    }}
                  />
                  <small>{label}</small>
                </button>
              ))}
            </div>
          </section>
          <section className="panel" aria-label="Filter effects">
            <Title
              icon={Sparkles}
              text="Filter effects"
              action="Clear"
              onClick={() => chooseFilterEffect('none', 'Filter effect')}
            />
            <select
              className="text-input"
              aria-label="Filter effect"
              value={filterEffects.type}
              onChange={(event) =>
                chooseFilterEffect(
                  event.target.value as FilterEffectType,
                  event.target.options[event.target.selectedIndex]?.text ||
                    'Filter effect',
                )
              }
            >
              {FILTER_EFFECT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type === 'none'
                    ? 'None'
                    : type
                        .split('-')
                        .map((part) => part[0].toUpperCase() + part.slice(1))
                        .join(' ')}
                </option>
              ))}
            </select>
            {filterEffects.type === 'lens-blur' && (
              <p>Local circular aperture blur · 49 samples. No depth map or highlight reconstruction. Source alpha stays unchanged.</p>
            )}
            {filterEffects.type === 'iris-blur' && (
              <p>Local elliptical focal-plane blur. The centre stays sharp and blur ramps to the edge; no depth map is inferred.</p>
            )}
            {filterEffects.type === 'spin-blur' && (
              <p>Local fixed-sample polar Spin Blur approximation. The editable centre and angular sweep are bounded; path geometry, depth and bokeh reconstruction remain planned.</p>
            )}
            {filterEffects.type === 'path-blur' && (
              <p>Local Path Blur approximation. The editable motion path and per-point speed stay in project metadata; path strobe and flash controls remain planned.</p>
            )}
            {filterEffects.type === 'smart-blur' && (
              <p>Local edge-preserving bilateral approximation. Luminance boundaries are protected; semantic edges and depth are not inferred.</p>
            )}
            {filterEffects.type === 'surface-blur' && (
              <p>Local tonal-surface blur. Neighbours outside the luminance threshold are excluded; semantic edges and depth are not inferred.</p>
            )}
            {filterEffects.type === 'shape-blur' && (
              <p>Local diamond-aperture blur. The shape is deterministic and bounded; custom user-supplied kernels remain planned.</p>
            )}
            {filterEffects.type === 'shear' && (
              <p>Linear horizontal shear with clamped edges and unchanged alpha. Editable shear curves and wrap-around remain planned.</p>
            )}
            {filterEffects.type === 'polar-coordinates' && (
              <p>Bounded rectangular-to-polar remap with clamped seams and unchanged alpha. Polar-to-rectangular mode and canvas-aware seam controls remain planned.</p>
            )}
            {filterEffects.type === 'zigzag' && (
              <p>Bounded radial zigzag displacement with clamped edges and unchanged alpha. Editable amplitude profiles and geometric canvas expansion remain planned.</p>
            )}
            {filterEffects.type === 'displace' && (
              <p>Bounded procedural displacement field with clamped edges and unchanged alpha. User-supplied displacement maps and geometric expansion remain planned.</p>
            )}
            {filterEffects.type === 'pointillize' && (
              <p>Bounded stipple-cell approximation with unchanged alpha. Density, foreground/background color and full procedural controls remain planned.</p>
            )}
            {filterEffects.type === 'crystallize' && (
              <p>Bounded seeded Voronoi-cell approximation with unchanged alpha. Cell geometry is deterministic and editable; true polygon edge reconstruction remains planned.</p>
            )}
            {filterEffects.type === 'lens-correction' && (
              <p>Manual radial correction with inward or outward source sampling. Camera profiles and chromatic aberration correction remain planned.</p>
            )}
            {filterEffects.type !== 'none' && (
              <>
                {(filterEffects.type === 'path-blur' || filterEffects.type === 'spin-blur') && (
                  <BlurGalleryControls effect={filterEffects} change={setFilterEffects} />
                )}
                <Slider
                  label="Effect amount"
                  value={filterEffects.amount}
                  min={0}
                  max={100}
                  set={(value) => setFilterEffects({ amount: value })}
                />
                <Slider
                  label={
                    filterEffects.type === 'mosaic' ||
                    filterEffects.type === 'crystallize' ||
                    filterEffects.type === 'color-halftone' ||
                    filterEffects.type === 'pointillize'
                      ? 'Cell size'
                      : filterEffects.type === 'box-blur' ||
                          filterEffects.type === 'gaussian-blur' ||
                          filterEffects.type === 'lens-blur' ||
                          filterEffects.type === 'iris-blur' ||
                          filterEffects.type === 'smart-blur' ||
                          filterEffects.type === 'surface-blur' ||
                          filterEffects.type === 'shape-blur' ||
                          filterEffects.type === 'motion-blur' ||
                          filterEffects.type === 'path-blur'
                          ? 'Blur radius'
                      : filterEffects.type === 'radial-blur'
                          || filterEffects.type === 'spin-blur'
                          ? 'Angular sweep'
                      : filterEffects.type === 'pinch'
                          ? 'Pinch radius'
                      : filterEffects.type === 'spherize'
                          ? 'Spherize radius'
                      : filterEffects.type === 'wave'
                          ? 'Wave length'
                      : filterEffects.type === 'shear'
                          ? 'Shear displacement'
                      : filterEffects.type === 'polar-coordinates'
                          ? 'Polar radius'
                      : filterEffects.type === 'zigzag'
                          ? 'ZigZag wavelength'
                      : filterEffects.type === 'displace'
                          ? 'Displace wavelength'
                      : filterEffects.type === 'lens-correction'
                          ? 'Correction radius'
                      : 'Radius'
                  }
                  value={filterEffects.radius}
                  min={1}
                  max={64}
                  set={(value) => setFilterEffects({ radius: value })}
                  suffix={
                    filterEffects.type === 'radial-blur' || filterEffects.type === 'spin-blur'
                      ? '°'
                      : ' px'
                  }
                />
                {filterEffects.type === 'twirl' && (
                  <Slider
                    label="Twirl angle"
                    value={filterEffects.angle}
                    min={-180}
                    max={180}
                    set={(value) => setFilterEffects({ angle: value })}
                    suffix="°"
                  />
                )}
                {(filterEffects.type === 'wave' || filterEffects.type === 'shear' || filterEffects.type === 'displace' || filterEffects.type === 'path-blur') && (
                  <Slider
                    label={filterEffects.type === 'shear' ? 'Shear direction' : filterEffects.type === 'displace' ? 'Displace direction' : filterEffects.type === 'path-blur' ? 'Path direction' : 'Wave angle'}
                    value={filterEffects.angle}
                    min={-180}
                    max={180}
                    set={(value) => setFilterEffects({ angle: value })}
                    suffix="°"
                  />
                )}
                {filterEffects.type === 'pinch' && (
                  <>
                    <Slider
                      label="Pinch center X"
                      value={Math.round(filterEffects.centerX * 100)}
                      min={0}
                      max={100}
                      set={(value) => setFilterEffects({ centerX: value / 100 })}
                      suffix="%"
                    />
                    <Slider
                      label="Pinch center Y"
                      value={Math.round(filterEffects.centerY * 100)}
                      min={0}
                      max={100}
                      set={(value) => setFilterEffects({ centerY: value / 100 })}
                      suffix="%"
                    />
                  </>
                )}
                {filterEffects.type === 'ripple' && (
                  <>
                    <Slider
                      label="Ripple center X"
                      value={Math.round(filterEffects.centerX * 100)}
                      min={0}
                      max={100}
                      set={(value) => setFilterEffects({ centerX: value / 100 })}
                      suffix="%"
                    />
                    <Slider
                      label="Ripple center Y"
                      value={Math.round(filterEffects.centerY * 100)}
                      min={0}
                      max={100}
                      set={(value) => setFilterEffects({ centerY: value / 100 })}
                      suffix="%"
                    />
                  </>
                )}
                {filterEffects.type === 'spherize' && (
                  <>
                    <Slider
                      label="Spherize center X"
                      value={Math.round(filterEffects.centerX * 100)}
                      min={0}
                      max={100}
                      set={(value) => setFilterEffects({ centerX: value / 100 })}
                      suffix="%"
                    />
                    <Slider
                      label="Spherize center Y"
                      value={Math.round(filterEffects.centerY * 100)}
                      min={0}
                      max={100}
                      set={(value) => setFilterEffects({ centerY: value / 100 })}
                      suffix="%"
                    />
                  </>
                )}
                {filterEffects.type === 'lens-correction' && (
                  <>
                    <label>
                      Correction direction
                      <select
                        aria-label="Correction direction"
                        value={filterEffects.lensDirection ?? 'inward'}
                        onChange={(event) => setFilterEffects({ lensDirection: event.target.value === 'outward' ? 'outward' : 'inward' })}
                      >
                        <option value="inward">Sample inward</option>
                        <option value="outward">Sample outward</option>
                      </select>
                    </label>
                    <Slider
                      label="Correction centre X"
                      value={Math.round(filterEffects.centerX * 100)}
                      min={0}
                      max={100}
                      set={(value) => setFilterEffects({ centerX: value / 100 })}
                      suffix="%"
                    />
                    <Slider
                      label="Correction centre Y"
                      value={Math.round(filterEffects.centerY * 100)}
                      min={0}
                      max={100}
                      set={(value) => setFilterEffects({ centerY: value / 100 })}
                      suffix="%"
                    />
                  </>
                )}
                {filterEffects.type === 'motion-blur' && (
                  <Slider
                    label="Motion angle"
                    value={filterEffects.angle}
                    min={-180}
                    max={180}
                    set={(value) => setFilterEffects({ angle: value })}
                    suffix="°"
                  />
                )}
                {filterEffects.type === 'iris-blur' && (
                  <>
                    <Slider
                      label="Focal centre X"
                      value={Math.round(filterEffects.centerX * 100)}
                      min={0}
                      max={100}
                      set={(value) => setFilterEffects({ centerX: value / 100 })}
                      suffix="%"
                    />
                    <Slider
                      label="Focal centre Y"
                      value={Math.round(filterEffects.centerY * 100)}
                      min={0}
                      max={100}
                      set={(value) => setFilterEffects({ centerY: value / 100 })}
                      suffix="%"
                    />
                  </>
                )}
                {(filterEffects.type === 'radial-blur' || filterEffects.type === 'spin-blur') && (
                  <>
                    <Slider
                      label={filterEffects.type === 'spin-blur' ? 'Spin center X' : 'Blur center X'}
                      value={Math.round(filterEffects.centerX * 100)}
                      min={0}
                      max={100}
                      set={(value) => setFilterEffects({ centerX: value / 100 })}
                      suffix="%"
                    />
                    <Slider
                      label={filterEffects.type === 'spin-blur' ? 'Spin center Y' : 'Blur center Y'}
                      value={Math.round(filterEffects.centerY * 100)}
                      min={0}
                      max={100}
                      set={(value) => setFilterEffects({ centerY: value / 100 })}
                      suffix="%"
                    />
                  </>
                )}
                {filterEffects.type === 'path-blur' && (
                  <>
                    <Slider
                      label="Path center X"
                      value={Math.round(filterEffects.centerX * 100)}
                      min={0}
                      max={100}
                      set={(value) => setFilterEffects({ centerX: value / 100 })}
                      suffix="%"
                    />
                    <Slider
                      label="Path center Y"
                      value={Math.round(filterEffects.centerY * 100)}
                      min={0}
                      max={100}
                      set={(value) => setFilterEffects({ centerY: value / 100 })}
                      suffix="%"
                    />
                  </>
                )}
                {filterEffects.type === 'tilt-shift' && (
                  <Slider
                    label="Focus height"
                    value={Math.round(filterEffects.centerY * 100)}
                    min={0}
                    max={100}
                    set={(value) => setFilterEffects({ centerY: value / 100 })}
                    suffix="%"
                  />
                )}
                <p className="adjust-note">
                  This effect stays editable in the project and is applied to
                  the rendered layer. The original asset remains unchanged.
                </p>
              </>
            )}
          </section>
          <section className="panel cloud-panel">
            <h3>My projects</h3>
            {member ? (
              <>
                <p>Signed in as {member.name}</p>
                <button
                  className="apply"
                  disabled={cloudBusy}
                  onClick={() => void saveToCloud()}
                >
                  {cloud?.owner === member.id
                    ? 'Update cloud project'
                    : 'Save to my projects'}
                </button>
                {cloud?.owner === member.id && (
                  <button
                    className="apply"
                    disabled={cloudBusy}
                    onClick={() => void saveToCloud(true)}
                  >
                    Save as new cloud project
                  </button>
                )}
                {cloudConflict && cloud?.owner === member.id && (
                  <button
                    className="apply"
                    disabled={cloudBusy}
                    onClick={() => void reloadCloudCopy()}
                  >
                    Reload latest cloud copy
                  </button>
                )}
                <p>
                  Local changes autosave. Use Update to sync your cloud copy, or
                  save a new project to keep both versions.
                </p>
                <a href="/#projects-heading">View my projects</a>
              </>
            ) : (
              <>
                <p>
                  Editing is free. Optionally sign in to save private projects
                  across devices.
                </p>
                <a href={SIGN_IN}>Sign in with Cheaply</a>
              </>
            )}
            <p aria-live="polite">{cloudMessage}</p>
          </section>
        </aside>
      </div>
      <footer>
        <span>
          <i />
          {notice}
        </span>
        <span>{tool[0].toUpperCase() + tool.slice(1)} tool</span>
        <output
          aria-label="Render status"
          data-testid="render-status"
          data-render-completed={renderProgress?.completed ?? 0}
          data-render-total={renderProgress?.total ?? 0}
          data-tiled-effect={tiledTelemetry?.effect ?? 'none'}
          data-tiled-layer={tiledTelemetry?.layerId ?? ''}
          data-tiled-tile-count={tiledTelemetry?.tileCount ?? 0}
          data-tiled-peak-bytes={tiledTelemetry?.peakBytes ?? 0}
          data-tiled-working-bytes={tiledTelemetry?.peakWorkingBytes ?? 0}
          data-tiled-destination-bytes={tiledTelemetry?.destinationBytes ?? 0}
          data-tiled-completed={tiledProgress?.completed ?? 0}
          data-tiled-total={tiledProgress?.total ?? 0}
          aria-live="polite"
        >
          {doc.rendering
            ? `Rendering… ${renderProgress?.completed ?? 0}/${renderProgress?.total ?? 0} layers`
            : 'Render ready'}
        </output>
        <output
          aria-label="Draft save status"
          title="This bookmark restores the document in this browser. Clearing browser data removes local documents; export a backup."
        >
          {saveStatus}
        </output>
        <button onClick={() => download('jpeg')}>
          <Save /> Save JPEG
        </button>
      </footer>
    </main>
  );
}

function Title({
  icon: Icon,
  text,
  action,
  onClick,
}: {
  icon: typeof Brush;
  text: string;
  action?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div className="panel-title">
      <span>
        <Icon />
        {text}
      </span>
      {action && <button onClick={onClick}>{action}</button>}
    </div>
  );
}
function Slider({
  label,
  value,
  min,
  max,
  set,
  suffix = '%',
  step = 1,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  set: (n: number) => void;
  suffix?: string;
  step?: number;
}) {
  return (
    <label className="slider">
      <span>
        <b>{label}</b>
        <output>
          {value}
          {suffix}
        </output>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => set(+e.target.value)}
      />
    </label>
  );
}
