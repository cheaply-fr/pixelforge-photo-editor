/**
 * Audio Annotation tool: bounded, local-first voice/audio notes pinned to a
 * point on the canvas (docs/audio-annotation-contract.md).
 *
 * A marker is a `kind: 'audio'` measurement annotation on the Frame, so it
 * follows the same undo/redo, crop and draft rules as Notes and is never
 * rendered into exported pixels. The audio itself is a draft-level clip
 * (`Draft.audio`, clip id → base64 data URL plus metadata) shared by every
 * history frame that references it, the way image assets are. Local drafts
 * store each clip once in the content-addressed draft asset store; portable
 * projects carry clips inside `document.json`; cloud saves strip them (like
 * File Info) so a recording never leaves the device through the cloud path.
 *
 * Everything here is pure and DOM-free so limits, normalization of untrusted
 * draft data and serialization are covered by Node tests.
 */

/** Longest clip, in milliseconds (2 minutes). */
export const AUDIO_NOTE_MAX_DURATION_MS = 120_000;
/** Largest encoded clip, in bytes (5 MiB). */
export const AUDIO_NOTE_MAX_BYTES = 5 * 1024 * 1024;
/** Most audio clips one document may reference. */
export const AUDIO_NOTE_MAX_CLIPS = 32;
/** Total encoded audio bytes one document may reference (32 MiB). */
export const AUDIO_NOTE_MAX_TOTAL_BYTES = 32 * 1024 * 1024;
/** Longest marker label (file name or "Audio note N"). */
export const AUDIO_NOTE_MAX_LABEL = 80;

/** Container types the editor stores. Codec parameters are dropped. */
export const AUDIO_NOTE_MIME_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/aac',
  'audio/flac',
] as const;
export type AudioNoteMime = (typeof AUDIO_NOTE_MIME_TYPES)[number];

export type AudioClip = {
  /** `data:<mime>;base64,<bytes>` of the unmodified recording or file. */
  url: string;
  mime: AudioNoteMime;
  /** Decoded byte length of `url`. */
  bytes: number;
  durationMs: number;
};
export type AudioClips = Record<string, AudioClip>;

export type AudioNoteAnnotation = {
  id: string;
  kind: 'audio';
  x: number;
  y: number;
  /** Key of the clip in `Draft.audio`. */
  clip: string;
  durationMs: number;
  label: string;
};

/** Minimal frame shape: anything carrying measurement annotations. */
type AnnotatedFrame = { w: number; h: number; measurements?: readonly { kind: string }[] };

const MIME_ALIASES: Readonly<Record<string, AudioNoteMime>> = {
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/x-pn-wav': 'audio/wav',
  'audio/mp3': 'audio/mpeg',
  'audio/x-mp3': 'audio/mpeg',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-aac': 'audio/aac',
  'audio/x-flac': 'audio/flac',
  'audio/opus': 'audio/ogg',
};

const EXTENSION_MIME: Readonly<Record<string, AudioNoteMime>> = {
  webm: 'audio/webm',
  weba: 'audio/webm',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
  flac: 'audio/flac',
};

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,96}$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** Normalize a MIME type (with optional codec parameters) to a stored container type. */
export function normalizeAudioMime(type: unknown): AudioNoteMime | undefined {
  if (typeof type !== 'string' || type.length > 160) return undefined;
  const base = type.split(';')[0].trim().toLowerCase();
  // MediaRecorder in some browsers labels audio-only WebM as video/webm.
  if (base === 'video/webm') return 'audio/webm';
  if ((AUDIO_NOTE_MIME_TYPES as readonly string[]).includes(base)) return base as AudioNoteMime;
  return MIME_ALIASES[base];
}

/** Stored type for a picked file: its declared type, else its extension. */
export function audioMimeForFile(name: string, type: string): AudioNoteMime | undefined {
  const declared = normalizeAudioMime(type);
  if (declared) return declared;
  if (type && type !== 'application/octet-stream') return undefined;
  const extension = /\.([a-z0-9]{2,5})$/i.exec(name)?.[1]?.toLowerCase();
  return extension ? EXTENSION_MIME[extension] : undefined;
}

/** Decoded byte length of a base64 body, or -1 when it is not canonical base64. */
export function base64ByteLength(body: string): number {
  if (body.length === 0 || body.length % 4 !== 0 || !BASE64_PATTERN.test(body)) return -1;
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  return (body.length / 4) * 3 - padding;
}

function encodeBase64(bytes: Uint8Array): string {
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64;
  if (typeof native === 'function') return native.call(bytes);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  return btoa(binary);
}

/** Encode clip bytes as the stored data URL. */
export function audioDataUrl(bytes: Uint8Array, mime: AudioNoteMime): string {
  return `data:${mime};base64,${encodeBase64(bytes)}`;
}

/** Decode a stored clip URL back to its type and bytes (tests and interchange). */
export function decodeAudioDataUrl(url: string): { mime: AudioNoteMime; bytes: Uint8Array } {
  const match = /^data:([a-z0-9/.+-]+);base64,/.exec(url);
  const mime = match ? normalizeAudioMime(match[1]) : undefined;
  if (!match || !mime || mime !== match[1]) throw new Error('Audio clip is not a stored audio data URL');
  const body = url.slice(match[0].length);
  if (base64ByteLength(body) < 1) throw new Error('Audio clip is not valid base64');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { mime, bytes };
}

const verifiedClips = new WeakSet<object>();

/** Strict structural check of one stored clip (memoized per clip object). */
export function validAudioClip(value: unknown): value is AudioClip {
  if (!isRecord(value)) return false;
  if (verifiedClips.has(value)) return true;
  const mime = value.mime;
  if (
    typeof mime !== 'string' ||
    !(AUDIO_NOTE_MIME_TYPES as readonly string[]).includes(mime) ||
    !Number.isInteger(value.bytes) ||
    !finite(value.bytes, 1, AUDIO_NOTE_MAX_BYTES) ||
    !Number.isInteger(value.durationMs) ||
    !finite(value.durationMs, 1, AUDIO_NOTE_MAX_DURATION_MS) ||
    typeof value.url !== 'string'
  )
    return false;
  const prefix = `data:${mime};base64,`;
  if (!value.url.startsWith(prefix)) return false;
  // Bound the string before scanning it.
  if (value.url.length > prefix.length + Math.ceil(AUDIO_NOTE_MAX_BYTES / 3) * 4) return false;
  if (base64ByteLength(value.url.slice(prefix.length)) !== value.bytes) return false;
  if (Object.keys(value).some((key) => !['url', 'mime', 'bytes', 'durationMs'].includes(key))) return false;
  verifiedClips.add(value);
  return true;
}

const safeLabel = (value: string): boolean =>
  !Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });

/** Sanitize a file name or caption into a marker label. */
export function audioNoteLabel(value: string, fallback: string): string {
  const cleaned = Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join('')
    .trim()
    .slice(0, AUDIO_NOTE_MAX_LABEL);
  return cleaned || fallback;
}

/** Structural check of one audio marker within a frame of `w` × `h`. */
export function validAudioAnnotation(value: unknown, w: number, h: number): value is AudioNoteAnnotation {
  if (!isRecord(value) || value.kind !== 'audio') return false;
  return (
    typeof value.id === 'string' &&
    ID_PATTERN.test(value.id) &&
    finite(value.x, 0, w) &&
    finite(value.y, 0, h) &&
    typeof value.clip === 'string' &&
    ID_PATTERN.test(value.clip) &&
    Number.isInteger(value.durationMs) &&
    finite(value.durationMs, 1, AUDIO_NOTE_MAX_DURATION_MS) &&
    typeof value.label === 'string' &&
    value.label.length >= 1 &&
    value.label.length <= AUDIO_NOTE_MAX_LABEL &&
    safeLabel(value.label)
  );
}

export function isAudioAnnotation(value: { kind: string }): value is AudioNoteAnnotation {
  return value.kind === 'audio';
}

/** Audio markers of one frame. */
export function audioAnnotations(frame: { measurements?: readonly { kind: string }[] } | null | undefined): AudioNoteAnnotation[] {
  return (frame?.measurements || []).filter(isAudioAnnotation);
}

/** Clip ids referenced anywhere in the history, in first-reference order. */
export function referencedAudioClipIds(history: readonly AnnotatedFrame[]): string[] {
  const ids = new Set<string>();
  for (const frame of history) for (const item of audioAnnotations(frame)) ids.add(item.clip);
  return [...ids];
}

export function audioClipBytes(clips: AudioClips): number {
  return Object.values(clips).reduce((total, clip) => total + clip.bytes, 0);
}

/**
 * Clips the history still references (the in-memory map can hold clips only
 * reachable from discarded redo branches).
 */
export function referencedAudioClips(history: readonly AnnotatedFrame[], clips: AudioClips | undefined): AudioClips {
  const used: AudioClips = {};
  if (!clips) return used;
  for (const id of referencedAudioClipIds(history)) if (Object.hasOwn(clips, id)) used[id] = clips[id];
  return used;
}

export type AudioClipCandidate = { bytes: number; durationMs: number; mime: string | undefined };

/** Why a new clip cannot be added, or undefined when it fits every limit. */
export function audioClipLimitError(candidate: AudioClipCandidate, existing: AudioClips): string | undefined {
  if (!candidate.mime || !normalizeAudioMime(candidate.mime))
    return 'Unsupported audio type. Use WebM, Ogg, MP4/M4A, MP3, WAV, AAC or FLAC.';
  if (!Number.isFinite(candidate.bytes) || candidate.bytes < 1) return 'The audio clip is empty.';
  if (candidate.bytes > AUDIO_NOTE_MAX_BYTES)
    return `Audio clips are limited to ${AUDIO_NOTE_MAX_BYTES / 1024 / 1024} MB.`;
  if (!Number.isFinite(candidate.durationMs) || candidate.durationMs < 1)
    return 'The audio clip length could not be read.';
  if (candidate.durationMs > AUDIO_NOTE_MAX_DURATION_MS)
    return `Audio clips are limited to ${AUDIO_NOTE_MAX_DURATION_MS / 60000} minutes.`;
  const count = Object.keys(existing).length;
  if (count >= AUDIO_NOTE_MAX_CLIPS)
    return `This document already has ${AUDIO_NOTE_MAX_CLIPS} audio annotations, the maximum.`;
  if (audioClipBytes(existing) + candidate.bytes > AUDIO_NOTE_MAX_TOTAL_BYTES)
    return `Audio annotations are limited to ${AUDIO_NOTE_MAX_TOTAL_BYTES / 1024 / 1024} MB per document.`;
  return undefined;
}

/**
 * Normalize untrusted draft audio against a validated history: keep only
 * valid clips that some frame references, within the per-document count and
 * byte caps (in first-reference order), then drop markers whose clip did not
 * survive. Unchanged frames keep their identity.
 */
export function normalizeAudioClips<F extends AnnotatedFrame>(
  input: unknown,
  history: readonly F[],
): { audio: AudioClips; history: F[] } {
  const audio: AudioClips = {};
  const source = isRecord(input) ? input : {};
  let total = 0;
  let count = 0;
  for (const id of referencedAudioClipIds(history)) {
    if (!Object.hasOwn(source, id)) continue;
    const clip = source[id];
    if (!validAudioClip(clip)) continue;
    if (count >= AUDIO_NOTE_MAX_CLIPS || total + clip.bytes > AUDIO_NOTE_MAX_TOTAL_BYTES) continue;
    audio[id] = clip;
    total += clip.bytes;
    count += 1;
  }
  const normalized = history.map((frame) => {
    const items = frame.measurements;
    if (!items?.some((item) => isAudioAnnotation(item) && !Object.hasOwn(audio, item.clip))) return frame;
    return {
      ...frame,
      measurements: items.filter((item) => !isAudioAnnotation(item) || Object.hasOwn(audio, item.clip)),
    };
  });
  return { audio, history: normalized };
}

/** Remove every audio clip and marker (cloud payloads keep recordings on the device). */
export function stripAudioAnnotations<D extends { history: AnnotatedFrame[]; audio?: AudioClips }>(draft: D): D {
  const { audio: _audio, ...rest } = draft;
  return {
    ...rest,
    history: draft.history.map((frame) =>
      frame.measurements?.some(isAudioAnnotation)
        ? { ...frame, measurements: frame.measurements.filter((item) => !isAudioAnnotation(item)) }
        : frame,
    ),
  } as D;
}

/** Default label for the next marker: "Audio note N". */
export function nextAudioNoteLabel(measurements: readonly { kind: string }[] | undefined): string {
  return `Audio note ${(measurements || []).filter(isAudioAnnotation).length + 1}`;
}

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));

/** Move one marker, clamped inside the frame. Returns undefined when nothing changes. */
export function moveAudioAnnotation<T extends { kind: string; id?: string }>(
  measurements: readonly T[],
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
): T[] | undefined {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  const nx = clamp(x, w),
    ny = clamp(y, h);
  let changed = false;
  const next = measurements.map((item) => {
    if (!isAudioAnnotation(item) || item.id !== id) return item;
    if (item.x === nx && item.y === ny) return item;
    changed = true;
    return { ...item, x: nx, y: ny };
  });
  return changed ? next : undefined;
}

/** Remove one marker. Returns undefined when it does not exist. */
export function removeAudioAnnotation<T extends { kind: string; id?: string }>(
  measurements: readonly T[],
  id: string,
): T[] | undefined {
  const next = measurements.filter((item) => !(isAudioAnnotation(item) && item.id === id));
  return next.length === measurements.length ? undefined : next;
}

/** Arrow-key nudge for a focused marker: one pixel, ten with Shift. */
export function nudgeAudioAnnotation(
  item: Pick<AudioNoteAnnotation, 'x' | 'y'>,
  key: string,
  shift: boolean,
): { x: number; y: number } | undefined {
  const step = shift ? 10 : 1;
  if (key === 'ArrowLeft') return { x: item.x - step, y: item.y };
  if (key === 'ArrowRight') return { x: item.x + step, y: item.y };
  if (key === 'ArrowUp') return { x: item.x, y: item.y - step };
  if (key === 'ArrowDown') return { x: item.x, y: item.y + step };
  return undefined;
}

/** "m:ss" for a clip length. */
export function formatAudioDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Recording length clamped to the clip limit (the recorder auto-stops there). */
export function recordedDurationMs(startedAt: number, stoppedAt: number): number {
  const elapsed = Math.round(stoppedAt - startedAt);
  return Math.max(1, Math.min(AUDIO_NOTE_MAX_DURATION_MS, Number.isFinite(elapsed) ? elapsed : 1));
}

export function newAudioClipId(): string {
  return `a-${crypto.randomUUID()}`;
}

/** Preferred MediaRecorder type supported by this browser, if any. */
export function preferredRecorderMime(isTypeSupported: (type: string) => boolean): string | undefined {
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'])
    try {
      if (isTypeSupported(type)) return type;
    } catch {
      /* Unsupported query. */
    }
  return undefined;
}
