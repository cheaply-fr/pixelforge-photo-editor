# Audio Annotation contract

The **Audio Annotation** tool (`audio-note`, I family, right after Note) pins
a short voice or audio clip to a point on the canvas. It is a bounded,
local-first workspace aid inspired by Photoshop's Audio Annotation tool. It
does not claim Photoshop parity: there is no PDF/PSD annotation interchange,
no author/date metadata, no transcription, and clips are never mixed into
image output.

## Interaction

- Choose **Audio Annotation** from the Measure toolbar slot or with the I key
  (Eyedropper → Color Sampler → Ruler → Note → Audio Annotation → Count;
  Shift+I cycles backwards). The icon is Lucide `AudioLines`; the tool persists in draft settings.
- Click the canvas: a dashed pending marker appears and a small non-modal
  panel opens with **Record**, **Attach audio file…** and a close button.
  Escape or changing tool cancels; nothing is added to the document until a
  clip is captured.
- **Record** is the only action that calls `getUserMedia({ audio: true })`;
  the browser asks for microphone permission then, never earlier.
  `MediaRecorder` captures WebM/Opus (or Ogg/MP4 where that is what the
  browser supports). **Stop** finishes the clip; recording stops itself at
  2 minutes or about 4.75 MB.
- **Attach audio file…** accepts `audio/*` (WebM, Ogg, MP4/M4A, MP3, WAV, AAC,
  FLAC). It is the fallback when there is no microphone or permission is
  denied; the panel says so. The file is decoded locally once to read its
  length; files the browser cannot play are refused.
- Clicking a marker with the tool active plays or pauses it through one shared
  `HTMLAudioElement`. Dragging a marker (more than 4 px) moves it; arrow keys
  nudge a focused marker by 1 px (Shift: 10 px); Delete / Backspace removes it.
  Tool options lists every audio annotation of the current state with Play /
  Pause and Delete buttons, plus clip and byte usage.
- Under other tools markers stay visible but inert (`pointer-events: none`,
  not focusable), so they never block painting or selection.

## Limits

| Limit | Value |
| --- | --- |
| Clip length | 1 ms – 2 minutes |
| Clip size | 5 MiB encoded |
| Clips per document | 32 |
| Audio per document | 32 MiB |
| Marker label | 1–80 printable characters (file name or "Audio note N") |

`src/audioAnnotations.ts` enforces these limits before a clip is added and
again when untrusted data is adopted.

## Model and persistence

- A marker is a frame measurement
  `{ id, kind: 'audio', x, y, clip, durationMs, label }`, so add, move and
  delete are ordinary undoable history steps. Crop translates or drops it
  like a Note.
- Clip bytes live once per document in `Draft.audio`
  (`clipId → { url: 'data:<mime>;base64,…', mime, bytes, durationMs }`),
  shared by every history frame that references the clip, the way image assets
  are. Clips that no retained frame references are pruned on save.
- **Local drafts** (IndexedDB format 3/4): the manifest gains an optional
  `audioRefs` map (`clipId → { hash, mime, bytes, durationMs }`). Each clip's
  data URL is stored as an ordinary content-addressed asset record
  (`asset:<draftId>:<sha256>`), written once, verified by SHA-256 on read and
  collected when nothing references it. Drafts without audio keep the
  previous manifest shape.
- **Portable `.pixelforge` projects** carry `audio` inside `document.json`, so
  project save/open round-trips markers and clips.
- **Cloud saves strip all clips and audio markers**, like File Info: voice
  recordings never leave the device through the optional cloud library. The
  cloud save message says so when the document has audio annotations.
- Older builds that do not know `kind: 'audio'` reject such a draft instead
  of silently dropping data.

### Validation of untrusted data

`validateDraft` accepts a clip only when its MIME type is allow-listed, its
URL is a canonical base64 data URL of exactly that type, its decoded length
equals `bytes`, and `bytes` / `durationMs` are within limits; unknown fields
fail. Invalid, unreferenced or over-cap clips are dropped (first-reference
order wins under the caps), and markers pointing at a dropped clip are
removed. A structurally invalid marker (position outside the frame, bad id,
control characters in its label) fails the frame closed like any overlay.

## Exclusions

Markers are DOM over the canvas, not part of the frame's layers. PNG, JPEG,
WebP, PSD, PDF, batch and artboard exports, Flatten, merges and Copy Merged
never include them or their sound; the exported PNG bytes are identical with
and without audio annotations (`tests/browser/audio-annotation.spec.ts`).

## Hosting

`firebase.json` allows `microphone=(self)` in `Permissions-Policy` (other
origins and embeds stay blocked) and adds `media-src 'self' data: blob:` to
the CSP so stored clips and the local duration probe can play.

## Tests

- `tests/audio-annotations.test.mjs`: MIME normalization, data URL
  round-trips, clip and marker validation, per-clip and per-document limits,
  normalization of untrusted drafts, move/nudge/delete, crop, cloud stripping,
  manifest hashing/decoding, portable round-trip, toolbar family, icon and
  sidebar wiring.
- `tests/draft-asset-store.test.mjs`: IndexedDB round-trip with one shared
  clip record and garbage collection after deletion.
- `tests/browser/audio-annotation.spec.ts` (desktop and mobile): attach a
  generated WAV, play/pause through the audio element, export-byte
  exclusion, project file contents, reload, undo/redo of add, drag move and
  delete, keyboard nudge/delete, limits, Escape cancel, inert markers under
  other tools, denied-permission fallback.
- `tests/browser/audio-annotation-recording.spec.ts` (desktop and mobile):
  Chromium's fake microphone records a clip; permission is requested only on
  Record; the clip survives reload and plays.
