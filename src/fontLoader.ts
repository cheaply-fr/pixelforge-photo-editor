/**
 * On-demand FontFace loading for the self-hosted font library. Nothing is
 * registered or fetched at page load: a family's faces are registered with
 * the document (or worker) FontFaceSet the first time something needs it,
 * and only the faces whose unicode-range matches the requested text load.
 * The scheduler dedupes requests, bounds concurrency and lets explicit
 * choices overtake picker previews. See docs/font-library-contract.md.
 */
import { fontFaceRegistrations, fontShorthand, libraryFont, type FontFamilyKind, fontFamilyKind } from './fontLibrary.ts';

export type FontLoadState = 'idle' | 'queued' | 'loading' | 'loaded' | 'failed' | 'system' | 'unknown';
export type FontLoadPriority = 'high' | 'low';

type FontFaceLike = { load?: () => Promise<unknown> };
type FontFaceCtor = new (family: string, source: string, descriptors?: Record<string, string>) => FontFaceLike;
type FontSetLike = {
  add: (face: FontFaceLike) => unknown;
  load: (font: string, text?: string) => Promise<unknown[]>;
};

export type FontLoaderOptions = {
  fontSet?: FontSetLike;
  FontFace?: FontFaceCtor;
  base?: string;
  concurrency?: number;
  timeoutMs?: number;
};

export type EnsureOptions = {
  weight?: number | string;
  style?: 'normal' | 'italic';
  /** Text the font must cover; selects which unicode-range subsets load. */
  text?: string;
  priority?: FontLoadPriority;
};

type Job = { key: string; family: string; options: EnsureOptions; resolve: (state: FontLoadState) => void; priority: FontLoadPriority };

export type FontLoader = {
  ensure: (family: string, options?: EnsureOptions) => Promise<FontLoadState>;
  state: (family: string) => FontLoadState;
  subscribe: (listener: (family: string, state: FontLoadState) => void) => () => void;
  /** Increments whenever any family finishes loading (render cache token). */
  revision: () => number;
  /** Faces registered so far (diagnostics/tests). */
  registeredFamilies: () => string[];
};

function sampleText(text: string | undefined): string {
  if (!text) return ' ';
  // Bound the text passed to FontFaceSet.load: one occurrence of each
  // distinct character is enough to select the needed subsets.
  const unique = [...new Set(Array.from(text))].slice(0, 512).join('');
  return unique || ' ';
}

export function createFontLoader(options: FontLoaderOptions = {}): FontLoader {
  const fontSet = options.fontSet;
  const FontFaceImpl = options.FontFace;
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const timeoutMs = options.timeoutMs ?? 10000;
  const states = new Map<string, FontLoadState>();
  const registered = new Set<string>();
  const pending = new Map<string, Promise<FontLoadState>>();
  const completed = new Set<string>();
  const queue: Job[] = [];
  const listeners = new Set<(family: string, state: FontLoadState) => void>();
  let active = 0;
  let revision = 0;

  const setState = (family: string, state: FontLoadState) => {
    if (states.get(family) === state) return;
    states.set(family, state);
    if (state === 'loaded') revision += 1;
    for (const listener of listeners) {
      try {
        listener(family, state);
      } catch {
        /* listeners are advisory */
      }
    }
  };

  const register = (family: string): boolean => {
    if (registered.has(family)) return true;
    const font = libraryFont(family);
    if (!font || !fontSet || !FontFaceImpl) return false;
    for (const face of fontFaceRegistrations(font, options.base)) {
      const descriptors: Record<string, string> = { weight: face.descriptors.weight, style: face.descriptors.style, display: face.descriptors.display };
      if (face.descriptors.unicodeRange) descriptors.unicodeRange = face.descriptors.unicodeRange;
      fontSet.add(new FontFaceImpl(font.family, face.source, descriptors));
    }
    registered.add(family);
    return true;
  };

  const run = async (job: Job) => {
    active += 1;
    if (states.get(job.family) !== 'loaded') setState(job.family, 'loading');
    let result: FontLoadState = 'failed';
    try {
      if (register(job.family) && fontSet) {
        const shorthand = fontShorthand(job.family, 16, job.options.weight ?? 400, job.options.style ?? 'normal');
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<'timeout'>((resolve) => {
          timer = setTimeout(() => resolve('timeout'), timeoutMs);
        });
        const loading = fontSet.load(shorthand, sampleText(job.options.text));
        const loaded = await Promise.race([loading, timeout]);
        if (timer) clearTimeout(timer);
        if (loaded === 'timeout') {
          result = 'failed';
          // A slow network may still deliver the face: report it so callers
          // that rendered with the fallback can redraw.
          loading.then(
            () => {
              completed.add(job.key);
              setState(job.family, 'loaded');
            },
            () => undefined,
          );
        } else result = Array.isArray(loaded) ? 'loaded' : 'failed';
      }
    } catch {
      result = 'failed';
    }
    // A family stays "loaded" once any face loaded, even if a later subset fails.
    if (!(result === 'failed' && states.get(job.family) === 'loaded')) setState(job.family, result);
    active -= 1;
    pending.delete(job.key);
    if (result === 'loaded') completed.add(job.key);
    job.resolve(states.get(job.family) ?? result);
    pump();
  };

  const pump = () => {
    while (active < concurrency && queue.length) {
      const index = queue.findIndex((job) => job.priority === 'high');
      const [job] = queue.splice(index >= 0 ? index : 0, 1);
      void run(job);
    }
  };

  return {
    ensure(family, ensureOptions = {}) {
      const kind: FontFamilyKind = fontFamilyKind(family);
      if (kind === 'system') return Promise.resolve('system');
      if (kind === 'unknown') return Promise.resolve('unknown');
      const font = libraryFont(family)!;
      const key = `${font.family}|${ensureOptions.weight ?? 400}|${ensureOptions.style ?? 'normal'}|${sampleText(ensureOptions.text)}`;
      if (completed.has(key)) return Promise.resolve('loaded');
      const existing = pending.get(key);
      if (existing) {
        if (ensureOptions.priority === 'high') {
          const queued = queue.find((job) => job.key === key);
          if (queued) queued.priority = 'high';
        }
        return existing;
      }
      if (!fontSet || !FontFaceImpl) {
        setState(font.family, 'failed');
        return Promise.resolve('failed');
      }
      const promise = new Promise<FontLoadState>((resolve) => {
        queue.push({ key, family: font.family, options: ensureOptions, resolve, priority: ensureOptions.priority ?? 'high' });
      });
      pending.set(key, promise);
      if (states.get(font.family) !== 'loaded') setState(font.family, 'queued');
      pump();
      return promise;
    },
    state(family) {
      const kind = fontFamilyKind(family);
      if (kind !== 'library') return kind;
      return states.get(libraryFont(family)!.family) ?? 'idle';
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    revision: () => revision,
    registeredFamilies: () => [...registered],
  };
}

let shared: FontLoader | undefined;

/** The page/worker-wide loader bound to the ambient FontFaceSet. */
export function sharedFontLoader(): FontLoader {
  if (shared) return shared;
  const scope = globalThis as typeof globalThis & { fonts?: FontSetLike; document?: { fonts?: FontSetLike }; FontFace?: FontFaceCtor };
  const fontSet = scope.document?.fonts ?? scope.fonts;
  shared = createFontLoader({ fontSet, FontFace: scope.FontFace });
  return shared;
}

export type TextLayerFontRequest = { fontFamily: string; bold?: boolean; text?: string };

/**
 * Ensure every library family used by the given text layers is loaded before
 * Canvas measures or draws them. Resolves to true when nothing is pending
 * (system, unknown and loaded families), false when a load failed or timed out.
 */
export async function ensureTextLayerFonts(layers: Iterable<TextLayerFontRequest>, loader: FontLoader = sharedFontLoader()): Promise<boolean> {
  const requests = new Map<string, EnsureOptions & { family: string }>();
  for (const layer of layers) {
    if (fontFamilyKind(layer.fontFamily) !== 'library') continue;
    const weight = layer.bold ? 700 : 400;
    const key = `${layer.fontFamily}|${weight}`;
    const previous = requests.get(key);
    requests.set(key, { family: layer.fontFamily, weight, text: `${previous?.text ?? ''}${layer.text ?? ''}`.slice(0, 20000), priority: 'high' });
  }
  if (!requests.size) return true;
  const results = await Promise.all([...requests.values()].map(({ family, ...rest }) => loader.ensure(family, rest)));
  return results.every((state) => state === 'loaded');
}

type FrameLike = { layers: readonly { kind: string; fontFamily?: unknown; bold?: unknown; text?: unknown }[] };

/** Text layers of a frame as font requests. */
export function frameFontRequests(frame: FrameLike): TextLayerFontRequest[] {
  return frame.layers
    .filter((layer) => layer.kind === 'text' && typeof layer.fontFamily === 'string')
    .map((layer) => ({ fontFamily: layer.fontFamily as string, bold: layer.bold === true, text: typeof layer.text === 'string' ? layer.text : '' }));
}
