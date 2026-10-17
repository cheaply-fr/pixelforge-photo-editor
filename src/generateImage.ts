/**
 * Bounded offline Generate Image approximation.
 *
 * This renderer creates abstract deterministic pixels from a small allow-list
 * of styles and colours. It never calls a model or provider and does not claim
 * semantic prompt-following image generation.
 */

export const GENERATE_IMAGE_VERSION = 1 as const;
export const GENERATE_IMAGE_MAX_PROMPT = 240;
export const GENERATE_IMAGE_MIN_WIDTH = 32;
export const GENERATE_IMAGE_MAX_WIDTH = 1024;
export const GENERATE_IMAGE_MIN_HEIGHT = 32;
export const GENERATE_IMAGE_MAX_HEIGHT = 1024;
export const GENERATE_IMAGE_MAX_PIXELS = 1_048_576;

export type GenerateImageStyle = 'gradient' | 'stripes' | 'dots' | 'noise';

export type GenerateImageRequest = {
  prompt: string;
  width: number;
  height: number;
  seed: number;
};

export type NormalizedGenerateImageRequest = GenerateImageRequest & {
  version: typeof GENERATE_IMAGE_VERSION;
  style: GenerateImageStyle;
  colors: [[number, number, number], [number, number, number]];
};

export type GenerateImageResult =
  | { ok: true; request: NormalizedGenerateImageRequest }
  | { ok: false; reason: string };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const COLORS: Record<string, [number, number, number]> = {
  black: [12, 16, 24],
  white: [245, 248, 255],
  red: [230, 64, 72],
  orange: [245, 130, 44],
  yellow: [244, 207, 64],
  green: [58, 184, 112],
  teal: [38, 182, 190],
  blue: [55, 119, 235],
  purple: [137, 83, 221],
  pink: [231, 94, 172],
};

function hash32(value: number): number {
  let x = value | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16;
  return x >>> 0;
}

function colorFor(prompt: string, fallback: [number, number, number]): [number, number, number] {
  const match = Object.keys(COLORS).find((name) => new RegExp(`\\b${name}\\b`).test(prompt));
  return match ? [...COLORS[match]] as [number, number, number] : [...fallback] as [number, number, number];
}

function styleFor(prompt: string): GenerateImageStyle {
  if (/\b(stripes?|bands?|lines?)\b/.test(prompt)) return 'stripes';
  if (/\b(dots?|bubbles?|polka)\b/.test(prompt)) return 'dots';
  if (/\b(noise|grain|speckle|texture)\b/.test(prompt)) return 'noise';
  return 'gradient';
}

export function normalizeGenerateImageRequest(value: unknown): GenerateImageResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reason: 'Generate Image request is invalid' };
  const candidate = value as Partial<GenerateImageRequest>;
  const prompt = typeof candidate.prompt === 'string' ? candidate.prompt.trim().replace(/\s+/g, ' ') : '';
  if (!prompt) return { ok: false, reason: 'Describe an abstract local image first' };
  if (prompt.length > GENERATE_IMAGE_MAX_PROMPT) return { ok: false, reason: `Prompt must be ${GENERATE_IMAGE_MAX_PROMPT} characters or fewer` };
  if (!finite(candidate.width) || !finite(candidate.height) || !Number.isInteger(candidate.width) || !Number.isInteger(candidate.height))
    return { ok: false, reason: 'Image dimensions must be whole numbers' };
  if (candidate.width < GENERATE_IMAGE_MIN_WIDTH || candidate.width > GENERATE_IMAGE_MAX_WIDTH || candidate.height < GENERATE_IMAGE_MIN_HEIGHT || candidate.height > GENERATE_IMAGE_MAX_HEIGHT)
    return { ok: false, reason: `Image dimensions must be between ${GENERATE_IMAGE_MIN_WIDTH} and ${GENERATE_IMAGE_MAX_WIDTH} pixels` };
  const width = candidate.width;
  const height = candidate.height;
  if (width * height > GENERATE_IMAGE_MAX_PIXELS) return { ok: false, reason: 'Generated image exceeds the local pixel budget' };
  const seed = finite(candidate.seed) ? Math.trunc(candidate.seed) >>> 0 : 1;
  const first = colorFor(prompt.toLocaleLowerCase(), [48, 88, 180]);
  const second = colorFor(prompt.toLocaleLowerCase().replace(new RegExp(Object.keys(COLORS).join('|')), ''), [226, 92, 164]);
  return { ok: true, request: { version: GENERATE_IMAGE_VERSION, prompt, width, height, seed, style: styleFor(prompt.toLocaleLowerCase()), colors: [first, second] } };
}

export function renderGeneratedImage(request: NormalizedGenerateImageRequest): Uint8ClampedArray {
  const output = new Uint8ClampedArray(request.width * request.height * 4);
  const [first, second] = request.colors;
  const blend = (amount: number, channel: number) => Math.round(first[channel] + (second[channel] - first[channel]) * clamp(amount, 0, 1));
  const seeded = (x: number, y: number) => (hash32(request.seed ^ Math.imul(x + 1, 0x1f123bb5) ^ Math.imul(y + 1, 0x5f356495)) / 0xffffffff);
  for (let y = 0; y < request.height; y += 1) {
    for (let x = 0; x < request.width; x += 1) {
      const u = x / Math.max(1, request.width - 1);
      const v = y / Math.max(1, request.height - 1);
      let amount = (u + v) / 2;
      if (request.style === 'stripes') amount = Math.sin((u * 18 + v * 4) * Math.PI) > 0 ? 0.2 : 0.82;
      if (request.style === 'dots') {
        const cellX = (x / Math.max(8, request.width / 10)) % 1;
        const cellY = (y / Math.max(8, request.height / 10)) % 1;
        amount = Math.hypot(cellX - 0.5, cellY - 0.5) < 0.3 ? 0.15 : 0.85;
      }
      if (request.style === 'noise') amount = seeded(x, y);
      const offset = (y * request.width + x) * 4;
      output[offset] = blend(amount, 0);
      output[offset + 1] = blend(amount, 1);
      output[offset + 2] = blend(amount, 2);
      output[offset + 3] = 255;
    }
  }
  return output;
}

export function validGeneratedImageRequest(value: unknown): value is NormalizedGenerateImageRequest {
  const result = normalizeGenerateImageRequest(value);
  return result.ok && result.request.version === GENERATE_IMAGE_VERSION;
}
