/**
 * Content and animation timing for the public landing page.
 *
 * Every number shown on the page is derived from the editor's own registries
 * (tool palette, blend modes, filter effects) so the marketing copy cannot
 * drift from what the editor ships. The hero timeline is a pure function of
 * time so it can be tested without a browser and frozen for reduced motion.
 */
import { TOOL_CATEGORIES, TOOL_FLYOUTS, type PaletteToolId } from './toolPalette.ts';
import { LAYER_BLEND_MODES } from './blendModes.ts';
import { FILTER_EFFECT_TYPES } from './filterEffects.ts';

export type LandingStats = {
  /** Distinct tools reachable from the toolbar. */
  tools: number;
  /** Toolbar slots: one per flyout family plus each stand-alone tool. */
  railSlots: number;
  /** Filter effects, excluding the neutral "none" entry. */
  filters: number;
  blendModes: number;
  /** Bounded in-memory undo depth (see README "undo/redo history"). */
  undoStates: number;
  /** Edge length of the Blob-backed layer tiles. */
  tileSize: number;
};

export const UNDO_STATE_LIMIT = 240;
export const LAYER_TILE_SIZE = 256;

export function paletteTools(): Set<PaletteToolId> {
  return new Set(TOOL_CATEGORIES.flatMap((category) => category.tools));
}

/** Count toolbar slots the way the rail renders them. */
export function railSlotCount(): number {
  const tools = paletteTools();
  const inFlyout = new Set(Object.values(TOOL_FLYOUTS).flat());
  const standalone = [...tools].filter((tool) => !inFlyout.has(tool)).length;
  return Object.keys(TOOL_FLYOUTS).length + standalone;
}

export function landingStats(): LandingStats {
  return {
    tools: paletteTools().size,
    railSlots: railSlotCount(),
    filters: FILTER_EFFECT_TYPES.filter((type) => type !== 'none').length,
    blendModes: LAYER_BLEND_MODES.length,
    undoStates: UNDO_STATE_LIMIT,
    tileSize: LAYER_TILE_SIZE,
  };
}

/** "gaussian-blur" -> "Gaussian Blur"; keeps short acronyms upper case. */
export function humanizeId(id: string): string {
  const acronyms = new Set(['ai', 'ntsc', 'rgb']);
  return id
    .split('-')
    .filter(Boolean)
    .map((word) => (acronyms.has(word) ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)))
    .join(' ');
}

/**
 * Filter names for the scrolling ribbon. Network/model-backed entries are left
 * out so the ribbon only advertises local pixel filters.
 */
export function filterRibbon(): string[] {
  const excluded = new Set(['none', 'ai-denoise', 'ai-sharpen', 'neural-enhance', 'reflection-removal']);
  return FILTER_EFFECT_TYPES.filter((type) => !excluded.has(type)).map(humanizeId);
}

export type ToolFamilyCard = { id: string; label: string; count: number; blurb: string };

const FAMILY_BLURBS: Record<string, string> = {
  navigation: 'Move, pan, zoom and rotate the view without touching pixels.',
  measure: 'Sample colors, measure distances, count and annotate.',
  marquee: 'Rectangular, elliptical and single row or column selections.',
  lasso: 'Freehand, polygonal and edge-snapping lassos.',
  selection: 'Brush-on, quick and color-based selections.',
  crop: 'Crop, perspective crop, slices and frames.',
  retouch: 'Clone, heal, patch, smudge, dodge, burn and history brushes.',
  paint: 'Brushes with dynamics and symmetry, gradients, fills and erasers.',
  mask: 'Paint masks in and out, or brush on local adjustments.',
  draw: 'Pens, anchor editing, editable type and vector shapes.',
};

export function toolFamilyCards(): ToolFamilyCard[] {
  return TOOL_CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    count: category.tools.length,
    blurb: FAMILY_BLURBS[category.id] ?? '',
  }));
}

/** Ease-out count-up used by the stats band. */
export function countUpValue(target: number, progress: number): number {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 1));
  return Math.round(target * (1 - (1 - p) ** 3));
}

// ---------------------------------------------------------------------------
// Hero demo timeline

export type HeroPhase = 'paint' | 'adjust' | 'filter' | 'type';

export const HERO_PHASES: readonly { id: HeroPhase; label: string; tool: string; start: number; end: number }[] = [
  { id: 'paint', label: 'Brush · 48 px · flow 80%', tool: 'Brush', start: 0, end: 3600 },
  { id: 'adjust', label: 'Curves adjustment layer', tool: 'Adjust', start: 3600, end: 7600 },
  { id: 'filter', label: 'Color Balance and Hue/Saturation looks', tool: 'Filters', start: 7600, end: 11800 },
  { id: 'type', label: 'Horizontal Type · editable', tool: 'Type', start: 11800, end: 16000 },
];

export const HERO_LOOP_MS = 16000;
/** Number of graded looks the hero cycles through. */
export const HERO_LOOKS = ['Curves', 'Color Balance', 'Hue/Saturation'] as const;
const FADE_OUT_MS = 900;

export type HeroFrame = {
  phase: HeroPhase;
  /** 0..1 progress within the current phase. */
  phaseProgress: number;
  /** 0..1 portion of the brush stroke that is painted. */
  stroke: number;
  /** Fraction of the width (from the left) showing the original image. */
  split: number;
  /** Index into HERO_LOOKS, with a 0..1 crossfade to the next look. */
  look: number;
  lookBlend: number;
  /** 0..1 opacity of the type layer. */
  text: number;
  /** 0..1 opacity applied to stroke and type while the loop resets. */
  fade: number;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const v = clamp01(value);
  return v * v * (3 - 2 * v);
};

/** The still frame shown when motion is reduced or before the first paint. */
export const HERO_POSTER_FRAME: HeroFrame = Object.freeze({
  phase: 'type',
  phaseProgress: 1,
  stroke: 1,
  split: 0.5,
  look: 0,
  lookBlend: 0,
  text: 1,
  fade: 1,
});

export function heroFrame(timeMs: number): HeroFrame {
  const t = ((Number.isFinite(timeMs) ? timeMs : 0) % HERO_LOOP_MS + HERO_LOOP_MS) % HERO_LOOP_MS;
  const phaseEntry = HERO_PHASES.find((phase) => t >= phase.start && t < phase.end) ?? HERO_PHASES[HERO_PHASES.length - 1];
  const phaseProgress = clamp01((t - phaseEntry.start) / (phaseEntry.end - phaseEntry.start));
  const paint = HERO_PHASES[0];
  const adjust = HERO_PHASES[1];
  const filter = HERO_PHASES[2];
  const type = HERO_PHASES[3];

  const stroke = smooth((t - paint.start - 300) / (paint.end - paint.start - 600));

  let split = 1;
  if (t >= adjust.start && t < adjust.end) {
    const p = (t - adjust.start) / (adjust.end - adjust.start);
    // Sweep the comparison right-to-left, then settle in the middle.
    split = p < 0.55 ? 1 - 0.85 * smooth(p / 0.55) : 0.15 + 0.35 * smooth((p - 0.55) / 0.45);
  } else if (t >= filter.start && t < type.start) {
    split = 0.5;
  } else if (t >= type.start) {
    const p = (t - type.start) / (type.end - type.start);
    split = 0.5 - 0.5 * smooth(p / 0.4);
    // Return to the original as the loop resets.
    if (t > HERO_LOOP_MS - FADE_OUT_MS) split = smooth((t - (HERO_LOOP_MS - FADE_OUT_MS)) / FADE_OUT_MS);
  }

  let look = 0;
  let lookBlend = 0;
  if (t >= filter.start && t < type.start) {
    const slot = (filter.end - filter.start) / HERO_LOOKS.length;
    const position = (t - filter.start) / slot;
    look = Math.min(HERO_LOOKS.length - 1, Math.floor(position));
    // Crossfade over the last 30% of each slot (except the final one).
    lookBlend = look < HERO_LOOKS.length - 1 ? smooth(((position - look) - 0.7) / 0.3) : 0;
  } else if (t >= type.start) {
    look = HERO_LOOKS.length - 1;
    // Fade back to the first look while the type layer is on screen.
    lookBlend = 0;
  }

  const text = t >= type.start ? smooth((t - type.start - 600) / 900) : 0;
  const fade = t > HERO_LOOP_MS - FADE_OUT_MS ? 1 - smooth((t - (HERO_LOOP_MS - FADE_OUT_MS)) / FADE_OUT_MS) : 1;

  return { phase: phaseEntry.id, phaseProgress, stroke, split, look, lookBlend, text, fade };
}

// ---------------------------------------------------------------------------
// Colour looks applied to the hero scene (pure pixel functions)

export type HeroLook = 0 | 1 | 2;

/**
 * Grade RGBA pixels in place. Alpha is preserved. Look 0 is a warm S-curve,
 * look 1 a teal/orange colour balance split and look 2 a desaturated,
 * high-contrast hue/saturation pass.
 */
export function applyHeroLook(data: Uint8ClampedArray, look: HeroLook): Uint8ClampedArray {
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (look === 0) {
      const curve = (v: number) => v + 0.3 * v * (1 - v) * (2 * v - 1) + 0.14 * v * (1 - v);
      r = curve(r) * 1.1;
      g = curve(g) * 1.02;
      b = curve(b) * 0.82;
      const l2 = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = l2 + (r - l2) * 1.3;
      g = l2 + (g - l2) * 1.3;
      b = l2 + (b - l2) * 1.3;
    } else if (look === 1) {
      const shadow = 1 - luma;
      r = r + 0.16 * luma - 0.1 * shadow;
      g = g + 0.03 * luma + 0.06 * shadow;
      b = b - 0.14 * luma + 0.16 * shadow;
    } else {
      const contrast = (v: number) => (v - 0.5) * 1.35 + 0.5;
      const mono = contrast(luma);
      r = mono + (r - luma) * 0.15 + 0.02;
      g = mono + (g - luma) * 0.15;
      b = mono + (b - luma) * 0.15 + 0.05;
    }
    data[i] = Math.round(clamp01(r) * 255);
    data[i + 1] = Math.round(clamp01(g) * 255);
    data[i + 2] = Math.round(clamp01(b) * 255);
  }
  return data;
}

/** Catmull-Rom points for the hero brush stroke in 0..1 scene coordinates. */
export const HERO_STROKE_POINTS: readonly (readonly [number, number])[] = [
  [0.1, 0.78], [0.22, 0.7], [0.34, 0.76], [0.46, 0.66], [0.58, 0.72], [0.7, 0.62], [0.82, 0.68], [0.9, 0.6],
];

export function catmullRom(points: readonly (readonly [number, number])[], samplesPerSegment = 12): [number, number][] {
  if (points.length < 2) return points.map(([x, y]) => [x, y]);
  const out: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const at = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([at(p0[0], p1[0], p2[0], p3[0]), at(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push([points[points.length - 1][0], points[points.length - 1][1]]);
  return out;
}

/** Leading part of a polyline covering `progress` of its point count. */
export function partialStroke(points: readonly [number, number][], progress: number): [number, number][] {
  const p = clamp01(Number.isFinite(progress) ? progress : 0);
  if (p === 0 || points.length === 0) return [];
  const count = Math.max(1, Math.ceil(points.length * p));
  return points.slice(0, count);
}
