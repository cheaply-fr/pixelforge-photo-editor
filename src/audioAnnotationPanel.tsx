/**
 * Audio Annotation UI: the on-canvas record/attach panel, the canvas
 * markers and the Tool options list (docs/audio-annotation-contract.md).
 * Limits and data rules live in the pure `audioAnnotations.ts` module.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { AudioLines, Mic, Paperclip, Pause, Play, Square, Trash2, X } from 'lucide-react';
import {
  AUDIO_NOTE_MAX_BYTES,
  AUDIO_NOTE_MAX_CLIPS,
  AUDIO_NOTE_MAX_DURATION_MS,
  AUDIO_NOTE_MAX_TOTAL_BYTES,
  audioClipLimitError,
  audioDataUrl,
  audioMimeForFile,
  audioNoteLabel,
  formatAudioDuration,
  normalizeAudioMime,
  nudgeAudioAnnotation,
  preferredRecorderMime,
  recordedDurationMs,
  type AudioClip,
  type AudioClips,
  type AudioNoteAnnotation,
} from './audioAnnotations';

type Point = { x: number; y: number };

/**
 * Length of an audio Blob as reported by the browser's decoder. Recorder
 * WebM files often report Infinity until the end is sought, so seek past the
 * end once to make the browser compute it. Rejects when the browser cannot
 * decode the file.
 */
export function probeAudioDuration(blob: Blob, timeoutMs = 8000): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const element = new Audio();
    let settled = false;
    const finish = (error?: Error, duration?: number) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else resolve(duration!);
    };
    const timer = window.setTimeout(() => finish(new Error('The audio file could not be read in time.')), timeoutMs);
    const check = () => {
      const duration = element.duration;
      if (Number.isFinite(duration) && duration > 0) finish(undefined, Math.round(duration * 1000));
      else if (duration === Infinity) element.currentTime = 1e7;
    };
    element.preload = 'metadata';
    element.addEventListener('loadedmetadata', check);
    element.addEventListener('durationchange', check);
    element.addEventListener('error', () => finish(new Error('This browser cannot play that audio file.')));
    element.src = url;
  });
}

type PanelProps = {
  /** Clips the document already references (for the per-document caps). */
  existing: AudioClips;
  defaultLabel: string;
  onCommit: (clip: AudioClip, label: string) => void;
  onCancel: () => void;
};

type RecorderSession = {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  bytes: number;
  startedAt: number;
  interval: number;
  timeout: number;
  discard: boolean;
};

/** Small accessible record / attach panel for a pending audio annotation. */
export function AudioRecordPanel({ existing, defaultLabel, onCommit, onCancel }: PanelProps) {
  const [status, setStatus] = useState<'idle' | 'requesting' | 'recording' | 'processing'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const session = useRef<RecorderSession | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recordButton = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const capReached = audioClipLimitError({ bytes: 1, durationMs: 1, mime: 'audio/webm' }, existing);

  const release = useCallback((discard: boolean) => {
    const active = session.current;
    if (!active) return;
    active.discard ||= discard;
    window.clearInterval(active.interval);
    window.clearTimeout(active.timeout);
    if (active.recorder.state !== 'inactive') active.recorder.stop();
    active.stream.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    mounted.current = true;
    // The panel opens from a canvas pointerdown; focus after that press's
    // default mousedown handling, which would otherwise blur the button.
    const focus = window.setTimeout(() => recordButton.current?.focus(), 0);
    return () => {
      window.clearTimeout(focus);
      mounted.current = false;
      release(true);
    };
  }, [release]);
  // Escape cancels the pending annotation (and discards a recording in progress).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const finish = async (blob: Blob, durationMs: number, mimeHint: string | undefined, label: string) => {
    const mime = normalizeAudioMime(mimeHint) ?? normalizeAudioMime(blob.type);
    const problem = audioClipLimitError({ bytes: blob.size, durationMs, mime }, existing);
    if (problem || !mime) {
      setError(problem ?? 'Unsupported audio type.');
      setStatus('idle');
      return;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!mounted.current) return;
    onCommit({ url: audioDataUrl(bytes, mime), mime, bytes: bytes.byteLength, durationMs }, label);
  };

  const record = async () => {
    setError('');
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Recording is not available in this browser. Attach an audio file instead.');
      return;
    }
    setStatus('requesting');
    let stream: MediaStream;
    try {
      // Permission is requested only here, after an explicit Record click.
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (reason) {
      const name = (reason as { name?: string } | null)?.name;
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Microphone permission was denied. Attach an audio file instead.'
          : 'No microphone is available. Attach an audio file instead.',
      );
      setStatus('idle');
      return;
    }
    if (!mounted.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    const preferred = preferredRecorderMime((type) => MediaRecorder.isTypeSupported(type));
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setError('Recording is not available in this browser. Attach an audio file instead.');
      setStatus('idle');
      return;
    }
    const active: RecorderSession = {
      recorder,
      stream,
      chunks: [],
      bytes: 0,
      startedAt: performance.now(),
      interval: 0,
      timeout: 0,
      discard: false,
    };
    session.current = active;
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      active.chunks.push(event.data);
      active.bytes += event.data.size;
      // Leave headroom for the final chunk under the per-clip byte limit.
      if (active.bytes >= AUDIO_NOTE_MAX_BYTES * 0.95) release(false);
    };
    recorder.onstop = () => {
      const stoppedAt = performance.now();
      if (session.current === active) session.current = null;
      if (active.discard || !mounted.current) return;
      setStatus('processing');
      const type = recorder.mimeType || preferred || 'audio/webm';
      void finish(
        new Blob(active.chunks, { type }),
        recordedDurationMs(active.startedAt, stoppedAt),
        type,
        defaultLabel,
      );
    };
    active.interval = window.setInterval(() => setElapsed(performance.now() - active.startedAt), 250);
    active.timeout = window.setTimeout(() => release(false), AUDIO_NOTE_MAX_DURATION_MS);
    recorder.start(250);
    setElapsed(0);
    setStatus('recording');
  };

  const attach = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    const mime = audioMimeForFile(file.name, file.type);
    const early = audioClipLimitError({ bytes: file.size, durationMs: 1, mime }, existing);
    if (early) {
      setError(early);
      return;
    }
    setStatus('processing');
    let durationMs: number;
    try {
      durationMs = await probeAudioDuration(file);
    } catch (reason) {
      if (!mounted.current) return;
      setError(reason instanceof Error ? reason.message : 'This browser cannot play that audio file.');
      setStatus('idle');
      return;
    }
    if (!mounted.current) return;
    await finish(file, durationMs, mime, audioNoteLabel(file.name, defaultLabel));
  };

  const recording = status === 'recording';
  const busy = status === 'requesting' || status === 'processing';
  return (
    <dialog
      open
      className="audio-note-panel"
      aria-labelledby="audio-note-panel-title"
      data-testid="audio-note-panel"
      data-status={status}
    >
      <div className="audio-note-panel-head">
        <AudioLines aria-hidden="true" />
        <h3 id="audio-note-panel-title">Audio annotation</h3>
        <button type="button" className="audio-note-close" aria-label="Cancel audio annotation" onClick={onCancel}>
          <X aria-hidden="true" />
        </button>
      </div>
      <p className="audio-note-hint">
        Up to {AUDIO_NOTE_MAX_DURATION_MS / 60000} minutes or {AUDIO_NOTE_MAX_BYTES / 1024 / 1024} MB per clip,{' '}
        {AUDIO_NOTE_MAX_CLIPS} clips per document. Stored on this device; never exported into images.
      </p>
      <div className="audio-note-actions">
        {recording ? (
          <button type="button" className="audio-note-stop" onClick={() => release(false)}>
            <Square aria-hidden="true" />
            Stop
          </button>
        ) : (
          <button
            type="button"
            ref={recordButton}
            className="audio-note-record"
            disabled={busy || !!capReached}
            onClick={() => void record()}
          >
            <Mic aria-hidden="true" />
            Record
          </button>
        )}
        <button
          type="button"
          disabled={recording || busy || !!capReached}
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip aria-hidden="true" />
          Attach audio file…
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="audio/*"
          hidden
          aria-label="Audio file for annotation"
          data-testid="audio-note-file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            void attach(file);
          }}
        />
      </div>
      <output className="audio-note-status" aria-live="polite">
        {recording
          ? `Recording ${formatAudioDuration(elapsed)} of ${formatAudioDuration(AUDIO_NOTE_MAX_DURATION_MS)}`
          : status === 'requesting'
            ? 'Waiting for microphone permission…'
            : status === 'processing'
              ? 'Saving audio…'
              : capReached
                ? ''
                : 'Record from the microphone or attach an audio file.'}
      </output>
      {(error || capReached) && (
        <p className="audio-note-error" role="alert">
          {error || capReached}
        </p>
      )}
    </dialog>
  );
}

/** One shared player: click toggles play/pause of a marker's clip. */
export function useAudioAnnotationPlayer(onError: (message: string) => void) {
  const player = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const toggle = useCallback(
    (id: string, clip: AudioClip | undefined) => {
      const element = player.current;
      if (!element) return;
      if (!clip) {
        onError('The audio for this annotation is missing.');
        return;
      }
      if (loaded === id && !element.paused) {
        element.pause();
        return;
      }
      if (loaded !== id || element.ended) {
        if (loaded !== id) element.src = clip.url;
        element.currentTime = 0;
        setLoaded(id);
      }
      element.play().then(
        () => setPlaying(id),
        () => {
          setPlaying(null);
          onError('The audio annotation could not be played.');
        },
      );
    },
    [loaded, onError],
  );
  const stop = useCallback(() => {
    player.current?.pause();
  }, []);
  const element = (
    // User recordings have no caption source; the marker label names each clip.
    // oxlint-disable-next-line jsx-a11y/media-has-caption
    <audio
      ref={player}
      className="audio-annotation-player"
      data-testid="audio-annotation-player"
      data-annotation-id={loaded ?? ''}
      preload="auto"
      onPause={() => setPlaying(null)}
      onEnded={() => setPlaying(null)}
      onPlay={() => setPlaying(loaded)}
    />
  );
  return { playing, toggle, stop, element };
}

type MarkersProps = {
  frame: { w: number; h: number };
  items: readonly AudioNoteAnnotation[];
  pending: Point | null;
  interactive: boolean;
  playing: string | null;
  toFrame: (event: Pick<ReactPointerEvent, 'clientX' | 'clientY'>) => Point;
  onToggle: (item: AudioNoteAnnotation) => void;
  onMove: (item: AudioNoteAnnotation, to: Point) => void;
  onDelete: (item: AudioNoteAnnotation) => void;
};

const DRAG_THRESHOLD_PX = 4;

/** Canvas markers. Workspace-only DOM: never part of rendered or exported pixels. */
export function AudioAnnotationMarkers({
  frame,
  items,
  pending,
  interactive,
  playing,
  toFrame,
  onToggle,
  onMove,
  onDelete,
}: MarkersProps) {
  const drag = useRef<{ id: string; clientX: number; clientY: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [dragAt, setDragAt] = useState<{ id: string; at: Point } | null>(null);
  if (!items.length && !pending) return null;
  const place = (at: Point) => ({ left: `${(at.x / frame.w) * 100}%`, top: `${(at.y / frame.h) * 100}%` });
  return (
    <div
      className="audio-annotation-layer"
      data-testid="audio-annotation-layer"
      data-interactive={interactive ? 'true' : 'false'}
    >
      {items.map((item) => {
        const at = dragAt?.id === item.id ? dragAt.at : item;
        const isPlaying = playing === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className="audio-annotation-marker"
            data-testid="audio-annotation-marker"
            data-annotation-id={item.id}
            data-x={Math.round(item.x)}
            data-y={Math.round(item.y)}
            data-playing={isPlaying ? 'true' : 'false'}
            aria-pressed={isPlaying}
            aria-hidden={interactive ? undefined : true}
            tabIndex={interactive ? 0 : -1}
            title={`${item.label} (${formatAudioDuration(item.durationMs)})`}
            aria-label={`${item.label}, ${formatAudioDuration(item.durationMs)}. ${isPlaying ? 'Pause' : 'Play'}. Drag or use arrow keys to move, Delete to remove.`}
            style={place(at)}
            onPointerDown={(event) => {
              if (!interactive || event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture?.(event.pointerId);
              drag.current = { id: item.id, clientX: event.clientX, clientY: event.clientY, moved: false };
            }}
            onPointerMove={(event) => {
              const active = drag.current;
              if (!active || active.id !== item.id) return;
              if (
                !active.moved &&
                Math.hypot(event.clientX - active.clientX, event.clientY - active.clientY) < DRAG_THRESHOLD_PX
              )
                return;
              active.moved = true;
              setDragAt({ id: item.id, at: toFrame(event) });
            }}
            onPointerUp={(event) => {
              const active = drag.current;
              drag.current = null;
              if (!active || active.id !== item.id || !active.moved) return;
              suppressClick.current = true;
              setDragAt(null);
              onMove(item, toFrame(event));
            }}
            onPointerCancel={() => {
              drag.current = null;
              setDragAt(null);
            }}
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              if (interactive) onToggle(item);
            }}
            onKeyDown={(event) => {
              if (!interactive) return;
              if (event.key === 'Delete' || event.key === 'Backspace') {
                event.preventDefault();
                event.stopPropagation();
                onDelete(item);
                return;
              }
              const next = nudgeAudioAnnotation(item, event.key, event.shiftKey);
              if (!next) return;
              event.preventDefault();
              event.stopPropagation();
              onMove(item, next);
            }}
          >
            {isPlaying ? <Pause aria-hidden="true" /> : <AudioLines aria-hidden="true" />}
          </button>
        );
      })}
      {pending && (
        <span
          className="audio-annotation-marker audio-annotation-pending"
          data-testid="audio-annotation-pending"
          aria-hidden="true"
          style={place(pending)}
        >
          <Mic aria-hidden="true" />
        </span>
      )}
    </div>
  );
}

type ListProps = {
  items: readonly AudioNoteAnnotation[];
  usedBytes: number;
  playing: string | null;
  onToggle: (item: AudioNoteAnnotation) => void;
  onDelete: (item: AudioNoteAnnotation) => void;
};

/** Tool options: the document's audio annotations, operable without the canvas. */
export function AudioAnnotationList({ items, usedBytes, playing, onToggle, onDelete }: ListProps) {
  return (
    <div className="audio-note-options" data-testid="audio-note-options">
      <p className="audio-note-hint">
        Click the canvas to place an audio annotation, then record or attach a clip. Click a marker to play or
        pause it; drag it to move. {items.length}/{AUDIO_NOTE_MAX_CLIPS} clips ·{' '}
        {(usedBytes / 1024 / 1024).toFixed(1)} of {AUDIO_NOTE_MAX_TOTAL_BYTES / 1024 / 1024} MB used.
      </p>
      {items.length ? (
        <ul className="audio-note-list" aria-label="Audio annotations">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-label={`${playing === item.id ? 'Pause' : 'Play'} ${item.label}`}
                aria-pressed={playing === item.id}
                onClick={() => onToggle(item)}
              >
                {playing === item.id ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              </button>
              <span className="audio-note-label">{item.label}</span>
              <span className="audio-note-length">{formatAudioDuration(item.durationMs)}</span>
              <button type="button" aria-label={`Delete ${item.label}`} onClick={() => onDelete(item)}>
                <Trash2 aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="audio-note-empty">No audio annotations in this document yet.</p>
      )}
    </div>
  );
}
