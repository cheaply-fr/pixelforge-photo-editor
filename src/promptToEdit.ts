/**
 * Bounded, offline Prompt to Edit planning.
 *
 * This is an allow-listed command parser over existing nondestructive
 * adjustment metadata. It deliberately does not claim semantic generation,
 * model inference or provider-backed image editing.
 */

export const PROMPT_TO_EDIT_VERSION = 1 as const;
export const PROMPT_TO_EDIT_MAX_PROMPT = 240;
export const PROMPT_TO_EDIT_MAX_OPERATIONS = 4;

export type PromptAdjustmentPatch = {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  hue?: number;
  blur?: number;
  photoAdjustments?: {
    exposure?: number;
    vibrance?: number;
    blackAndWhite?: boolean;
    temperature?: number;
    tint?: number;
    clarity?: number;
  };
  sharpenNoise?: {
    sharpen?: number;
    radius?: number;
    threshold?: number;
  };
};

export type PromptEditPlan = {
  version: typeof PROMPT_TO_EDIT_VERSION;
  prompt: string;
  summary: string;
  reset: boolean;
  operations: string[];
  patch: PromptAdjustmentPatch;
};

export type PromptEditResult =
  | { ok: true; plan: PromptEditPlan }
  | { ok: false; reason: string };

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const strengthFrom = (prompt: string): number => {
  const match = prompt.match(/(?:\b(?:by|to|at|of)\s*)?(-?\d{1,3})(?:\s*%|\b)/);
  const raw = match ? Number(match[1]) : 20;
  const base = finite(raw) ? Math.abs(raw) : 20;
  const multiplier = /\bvery\b/.test(prompt) ? 1.5 : /\bslight(?:ly)?\b/.test(prompt) ? 0.5 : 1;
  return clamp(Math.round(base * multiplier), 5, 80);
};

const signedNumber = (prompt: string): number | undefined => {
  const match = prompt.match(/\bhue(?:\s+rotate)?\s*(-?\d{1,3})/);
  if (!match) return undefined;
  return clamp(Number(match[1]), -180, 180);
};

/** Parse a private, allow-listed request into one bounded adjustment plan. */
export function parsePromptToEdit(value: unknown): PromptEditResult {
  if (typeof value !== 'string') return { ok: false, reason: 'Prompt must be text' };
  const prompt = value.trim().replace(/\s+/g, ' ');
  if (!prompt) return { ok: false, reason: 'Describe a local adjustment first' };
  if (prompt.length > PROMPT_TO_EDIT_MAX_PROMPT)
    return { ok: false, reason: `Prompt must be ${PROMPT_TO_EDIT_MAX_PROMPT} characters or fewer` };
  const normalized = prompt.toLocaleLowerCase();
  if (/\b(reset|clear|remove)\s+(all\s+)?adjustments?\b/.test(normalized)) {
    if (normalized.replace(/\b(reset|clear|remove|all|adjustments?)\b/g, '').trim())
      return { ok: false, reason: 'Reset requests cannot be combined with another edit' };
    return {
      ok: true,
      plan: {
        version: PROMPT_TO_EDIT_VERSION,
        prompt,
        summary: 'reset adjustments',
        reset: true,
        operations: ['reset'],
        patch: {},
      },
    };
  }

  const strength = strengthFrom(normalized);
  const operations: string[] = [];
  const patch: PromptAdjustmentPatch = {};
  const photo: NonNullable<PromptAdjustmentPatch['photoAdjustments']> = {};
  const sharpen: NonNullable<PromptAdjustmentPatch['sharpenNoise']> = {};

  const brighter = /\b(brighten|brighter|lighten|lighter|lift(?:\s+the)?\s+exposure)\b/.test(normalized);
  const darker = /\b(darken|darker|dim(?:mer)?|lower(?:\s+the)?\s+exposure)\b/.test(normalized);
  if (brighter || darker) {
    patch.brightness = clamp(100 + (brighter ? strength : -strength), 20, 200);
    operations.push(brighter ? 'brighten' : 'darken');
  }

  const contrastUp = /\b(increase|boost|more|higher)\s+contrast\b|\bcontrast\s*(?:up|stronger)\b/.test(normalized);
  const contrastDown = /\b(decrease|reduce|lower|less)\s+contrast\b|\bcontrast\s*(?:down|softer)\b/.test(normalized);
  if (contrastUp || contrastDown || /\bcontrast\b/.test(normalized)) {
    const up = contrastDown ? false : contrastUp || !contrastDown;
    patch.contrast = clamp(100 + (up ? strength : -strength), 20, 200);
    operations.push(up ? 'increase contrast' : 'decrease contrast');
  }

  const saturated = /\b(saturate|saturated|vibrant|colourful|colorful)\b/.test(normalized);
  const desaturated = /\b(desaturate|desaturated|muted|dull|black\s*and\s*white|grayscale|greyscale)\b/.test(normalized);
  if (saturated || desaturated) {
    patch.saturation = desaturated ? (/\bblack\s*and\s*white|grayscale|greyscale\b/.test(normalized) ? 0 : clamp(100 - strength, 0, 200)) : clamp(100 + strength, 0, 200);
    if (desaturated && /\bblack\s*and\s*white|grayscale|greyscale\b/.test(normalized)) photo.blackAndWhite = true;
    operations.push(desaturated ? 'desaturate' : 'saturate');
  }

  const warm = /\b(warm|warmer|golden)\b/.test(normalized);
  const cool = /\b(cool|cooler|icy)\b/.test(normalized);
  if (warm || cool) {
    photo.temperature = warm ? strength : -strength;
    operations.push(warm ? 'warm' : 'cool');
  }

  const green = /\b(green|greener)\b/.test(normalized);
  const magenta = /\b(magenta|pink|purpler)\b/.test(normalized);
  if (green || magenta) {
    photo.tint = green ? strength : -strength;
    operations.push(green ? 'green tint' : 'magenta tint');
  }

  const hue = signedNumber(normalized);
  if (hue !== undefined) {
    patch.hue = hue;
    operations.push(`hue ${hue}°`);
  }

  const sharpenRequested = /\b(sharpen|sharper|crisper|more\s+detail)\b/.test(normalized);
  const softenRequested = /\b(soften|softer|smooth|smoother)\b/.test(normalized);
  if (sharpenRequested || softenRequested) {
    if (sharpenRequested) {
      sharpen.sharpen = strength;
      sharpen.radius = 2;
      sharpen.threshold = 0;
    } else {
      patch.blur = clamp(Math.round(strength / 8), 1, 20);
    }
    operations.push(sharpenRequested ? 'sharpen' : 'soften');
  }

  if (Object.keys(photo).length) patch.photoAdjustments = photo;
  if (Object.keys(sharpen).length) patch.sharpenNoise = sharpen;
  if (operations.length === 0)
    return { ok: false, reason: 'No supported local adjustment was found. Try “make it warmer and brighter”.' };
  if (operations.length > PROMPT_TO_EDIT_MAX_OPERATIONS)
    return { ok: false, reason: `Use at most ${PROMPT_TO_EDIT_MAX_OPERATIONS} local adjustments per request` };

  return {
    ok: true,
    plan: {
      version: PROMPT_TO_EDIT_VERSION,
      prompt,
      summary: operations.join(', '),
      reset: false,
      operations,
      patch,
    },
  };
}

export function validPromptEditPlan(value: unknown): value is PromptEditPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<PromptEditPlan>;
  return (
    candidate.version === PROMPT_TO_EDIT_VERSION &&
    typeof candidate.prompt === 'string' &&
    candidate.prompt.length <= PROMPT_TO_EDIT_MAX_PROMPT &&
    typeof candidate.summary === 'string' &&
    Array.isArray(candidate.operations) &&
    candidate.operations.length >= 1 &&
    candidate.operations.length <= PROMPT_TO_EDIT_MAX_OPERATIONS &&
    typeof candidate.reset === 'boolean' &&
    !!candidate.patch &&
    typeof candidate.patch === 'object'
  );
}
