import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIO_NOTE_MAX_BYTES,
  AUDIO_NOTE_MAX_CLIPS,
  AUDIO_NOTE_MAX_DURATION_MS,
  AUDIO_NOTE_MAX_LABEL,
  AUDIO_NOTE_MAX_TOTAL_BYTES,
  audioAnnotations,
  audioClipLimitError,
  audioDataUrl,
  audioMimeForFile,
  audioNoteLabel,
  base64ByteLength,
  decodeAudioDataUrl,
  formatAudioDuration,
  moveAudioAnnotation,
  normalizeAudioClips,
  normalizeAudioMime,
  nextAudioNoteLabel,
  nudgeAudioAnnotation,
  preferredRecorderMime,
  recordedDurationMs,
  referencedAudioClipIds,
  referencedAudioClips,
  removeAudioAnnotation,
  stripAudioAnnotations,
  validAudioAnnotation,
  validAudioClip,
} from '../src/audioAnnotations.ts';
import { validMeasurements } from '../src/measurements.ts';
import { cropMeasurements } from '../src/cropTools.ts';
import { CURRENT_DRAFT_VERSION, estimatedPendingDraftBytes, stripPrivateMetadata, validateDraft } from '../src/drafts.ts';
import { createDraftManifest, decodeDraftManifest, hashDraftAsset, isDraftManifest, manifestAssetHashes } from '../src/draftAssetStore.ts';
import { readPortableBundle, writePortableBundle } from '../src/portableBundle.ts';
import { TOOL_CATEGORIES, TOOL_FAMILIES, TOOL_ICONS, cycleFamilyTool } from '../src/toolPalette.ts';
import { TOOL_SECTIONS } from '../src/sidebarSections.ts';
import { neutral } from '../src/document.ts';

/** A tiny, valid 8 kHz mono 16-bit PCM WAV generated in memory (no media files committed). */
function wav(samples = 800, frequency = 440) {
  const rate = 8000;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i += 1)
    view.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * frequency * i) / rate) * 12000), true);
  return bytes;
}

const clipOf = (bytes = wav(), durationMs = 100) => ({
  url: audioDataUrl(bytes, 'audio/wav'),
  mime: 'audio/wav',
  bytes: bytes.byteLength,
  durationMs,
});
const marker = (id, clip, extra = {}) => ({
  id,
  kind: 'audio',
  x: 10,
  y: 20,
  clip,
  durationMs: 100,
  label: 'Audio note 1',
  ...extra,
});

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';
const assetId = '11111111-1111-4111-8111-111111111111';
const layerId = '22222222-2222-4222-8222-222222222222';
const settings = { tool: 'audio-note', zoom: 72, color: '#000000', size: 18, text: '', fontSize: 56, ...neutral };
const frame = (measurements) => ({
  w: 64,
  h: 48,
  active: layerId,
  measurements,
  layers: [{ id: layerId, name: 'Background', visible: true, locked: false, opacity: 1, blend: 'source-over', matrix: [1, 0, 0, 1, 0, 0], adjustments: { ...neutral }, kind: 'raster', asset: assetId }],
});
const draft = (history, audio, extra = {}) => ({
  version: CURRENT_DRAFT_VERSION,
  name: 'Audio fixture',
  index: history.length - 1,
  settings,
  assets: { [assetId]: { url: `data:image/png;base64,${png}`, w: 1, h: 1 } },
  history,
  ...(audio ? { audio } : {}),
  ...extra,
});

test('MIME normalization keeps a small container allowlist and drops codec parameters', () => {
  assert.equal(normalizeAudioMime('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(normalizeAudioMime('video/webm;codecs=opus'), 'audio/webm');
  assert.equal(normalizeAudioMime('AUDIO/X-WAV'), 'audio/wav');
  assert.equal(normalizeAudioMime('audio/mp3'), 'audio/mpeg');
  assert.equal(normalizeAudioMime('audio/x-m4a'), 'audio/mp4');
  assert.equal(normalizeAudioMime('audio/midi'), undefined);
  assert.equal(normalizeAudioMime('image/png'), undefined);
  assert.equal(normalizeAudioMime(42), undefined);
  assert.equal(normalizeAudioMime('a'.repeat(200)), undefined);
  assert.equal(audioMimeForFile('memo.m4a', ''), 'audio/mp4');
  assert.equal(audioMimeForFile('memo.WAV', 'application/octet-stream'), 'audio/wav');
  assert.equal(audioMimeForFile('memo.wav', 'text/plain'), undefined, 'a declared non-audio type wins');
  assert.equal(audioMimeForFile('memo.txt', ''), undefined);
  assert.equal(audioMimeForFile('take.ogg', 'audio/ogg'), 'audio/ogg');
});

test('data URLs round-trip exact bytes and canonical base64 lengths', () => {
  const bytes = wav(37);
  const url = audioDataUrl(bytes, 'audio/wav');
  assert.ok(url.startsWith('data:audio/wav;base64,'));
  const decoded = decodeAudioDataUrl(url);
  assert.equal(decoded.mime, 'audio/wav');
  assert.deepEqual([...decoded.bytes], [...bytes]);
  for (const length of [1, 2, 3, 4, 5, 1000])
    assert.equal(base64ByteLength(btoa('x'.repeat(length))), length);
  assert.equal(base64ByteLength('abc'), -1);
  assert.equal(base64ByteLength('ab=c'), -1);
  assert.equal(base64ByteLength(''), -1);
  assert.throws(() => decodeAudioDataUrl('data:image/png;base64,AAAA'));
  assert.throws(() => decodeAudioDataUrl('data:audio/x-wav;base64,AAAA'), /stored audio/);
});

test('clip validation rejects forged sizes, types, durations and extra fields', () => {
  const clip = clipOf();
  assert.ok(validAudioClip(clip));
  assert.equal(validAudioClip({ ...clip, bytes: clip.bytes + 1 }), false);
  assert.equal(validAudioClip({ ...clip, mime: 'audio/webm' }), false, 'URL type must match');
  assert.equal(validAudioClip({ ...clip, url: clip.url.replace('base64,', 'base64,!') }), false);
  assert.equal(validAudioClip({ ...clip, durationMs: 0 }), false);
  assert.equal(validAudioClip({ ...clip, durationMs: AUDIO_NOTE_MAX_DURATION_MS + 1 }), false);
  assert.equal(validAudioClip({ ...clip, durationMs: 1.5 }), false);
  assert.equal(validAudioClip({ ...clip, owner: 'x' }), false);
  assert.equal(validAudioClip({ ...clip, url: 'data:text/html;base64,AAAA', mime: 'text/html' }), false);
  assert.equal(validAudioClip(null), false);
  assert.equal(validAudioClip([]), false);
  // A string longer than the byte limit allows is rejected before scanning.
  const huge = { url: `data:audio/wav;base64,${'A'.repeat(Math.ceil(AUDIO_NOTE_MAX_BYTES / 3) * 4 + 4)}`, mime: 'audio/wav', bytes: AUDIO_NOTE_MAX_BYTES, durationMs: 10 };
  assert.equal(validAudioClip(huge), false);
});

test('marker validation bounds position, clip id, duration and label text', () => {
  const ok = marker('m-1', 'a-1');
  assert.ok(validAudioAnnotation(ok, 64, 48));
  assert.ok(validMeasurements([ok], 64, 48));
  assert.equal(validMeasurements([{ ...ok, x: 65 }], 64, 48), false);
  assert.equal(validMeasurements([{ ...ok, clip: '../x' }], 64, 48), false);
  assert.equal(validMeasurements([{ ...ok, label: '' }], 64, 48), false);
  assert.equal(validMeasurements([{ ...ok, label: 'x'.repeat(AUDIO_NOTE_MAX_LABEL + 1) }], 64, 48), false);
  assert.equal(validMeasurements([{ ...ok, label: 'bad\u0007bell' }], 64, 48), false);
  assert.equal(validMeasurements([{ ...ok, durationMs: AUDIO_NOTE_MAX_DURATION_MS + 1 }], 64, 48), false);
  assert.equal(validMeasurements([{ ...ok, id: 'bad id' }], 64, 48), false);
  assert.equal(audioNoteLabel('  take\u0000 one.wav ', 'Audio note 1'), 'take one.wav');
  assert.equal(audioNoteLabel('\u0001\u0002', 'Audio note 3'), 'Audio note 3');
  assert.equal(audioNoteLabel('x'.repeat(200), 'f').length, AUDIO_NOTE_MAX_LABEL);
});

test('limits: per-clip duration and bytes, per-document count and total bytes', () => {
  const ok = { bytes: 1000, durationMs: 5000, mime: 'audio/webm' };
  assert.equal(audioClipLimitError(ok, {}), undefined);
  assert.match(audioClipLimitError({ ...ok, mime: 'audio/midi' }, {}), /Unsupported/);
  assert.match(audioClipLimitError({ ...ok, mime: undefined }, {}), /Unsupported/);
  assert.match(audioClipLimitError({ ...ok, bytes: 0 }, {}), /empty/);
  assert.match(audioClipLimitError({ ...ok, bytes: AUDIO_NOTE_MAX_BYTES + 1 }, {}), /5 MB/);
  assert.equal(audioClipLimitError({ ...ok, bytes: AUDIO_NOTE_MAX_BYTES }, {}), undefined);
  assert.match(audioClipLimitError({ ...ok, durationMs: AUDIO_NOTE_MAX_DURATION_MS + 1 }, {}), /2 minutes/);
  assert.equal(audioClipLimitError({ ...ok, durationMs: AUDIO_NOTE_MAX_DURATION_MS }, {}), undefined);
  assert.match(audioClipLimitError({ ...ok, durationMs: Number.NaN }, {}), /length/);
  const full = Object.fromEntries(
    Array.from({ length: AUDIO_NOTE_MAX_CLIPS }, (_, i) => [`a-${i}`, { bytes: 10, durationMs: 1 }]),
  );
  assert.match(audioClipLimitError(ok, full), /maximum/);
  const heavy = Object.fromEntries(
    Array.from({ length: 6 }, (_, i) => [`a-${i}`, { bytes: AUDIO_NOTE_MAX_BYTES, durationMs: 1 }]),
  );
  assert.equal(audioClipLimitError({ ...ok, bytes: AUDIO_NOTE_MAX_TOTAL_BYTES - 6 * AUDIO_NOTE_MAX_BYTES }, heavy), undefined);
  assert.match(audioClipLimitError({ ...ok, bytes: AUDIO_NOTE_MAX_TOTAL_BYTES - 6 * AUDIO_NOTE_MAX_BYTES + 1 }, heavy), /32 MB per document/);
  assert.equal(recordedDurationMs(100, 5100), 5000);
  assert.equal(recordedDurationMs(0, AUDIO_NOTE_MAX_DURATION_MS + 900), AUDIO_NOTE_MAX_DURATION_MS);
  assert.equal(recordedDurationMs(10, 10), 1);
  assert.equal(recordedDurationMs(0, Number.NaN), 1);
});

test('normalization keeps referenced valid clips and drops dangling markers', () => {
  const good = clipOf(wav(10));
  const history = [
    frame([marker('m-1', 'a-good')]),
    frame([marker('m-1', 'a-good'), marker('m-2', 'a-missing'), marker('m-3', 'a-bad'), { id: 'n', kind: 'note', x: 1, y: 1, text: 'keep' }]),
  ];
  const { audio, history: normalized } = normalizeAudioClips(
    { 'a-good': good, 'a-bad': { ...good, bytes: 3 }, 'a-orphan': clipOf(wav(11)), __proto__: { 'a-missing': good } },
    history,
  );
  assert.deepEqual(Object.keys(audio), ['a-good']);
  assert.equal(normalized[0], history[0], 'unchanged frames keep identity');
  assert.deepEqual(normalized[1].measurements.map((item) => item.id), ['m-1', 'n']);
  assert.deepEqual(normalizeAudioClips('nonsense', history).audio, {});
  assert.equal(normalizeAudioClips(undefined, [frame(undefined)]).history.length, 1);
});

test('normalization enforces the per-document clip count in first-reference order', () => {
  const markers = Array.from({ length: AUDIO_NOTE_MAX_CLIPS + 3 }, (_, i) => marker(`m-${i}`, `a-${i}`));
  const clips = Object.fromEntries(markers.map((item, i) => [item.clip, clipOf(wav(5 + i))]));
  const { audio, history } = normalizeAudioClips(clips, [frame(markers)]);
  assert.equal(Object.keys(audio).length, AUDIO_NOTE_MAX_CLIPS);
  assert.equal(audioAnnotations(history[0]).length, AUDIO_NOTE_MAX_CLIPS);
  assert.ok(!Object.hasOwn(audio, `a-${AUDIO_NOTE_MAX_CLIPS}`));
  assert.deepEqual(referencedAudioClipIds(history).slice(0, 2), ['a-0', 'a-1']);
});

test('move, nudge, delete and labels are immutable edits clamped to the frame', () => {
  const items = [{ id: 'n', kind: 'note', x: 1, y: 1, text: 't' }, marker('m-1', 'a-1')];
  const moved = moveAudioAnnotation(items, 'm-1', 100, -5, 64, 48);
  assert.deepEqual(moved[1], { ...items[1], x: 64, y: 0 });
  assert.equal(moved[0], items[0]);
  assert.equal(items[1].x, 10, 'source untouched');
  assert.equal(moveAudioAnnotation(items, 'm-1', 10, 20, 64, 48), undefined, 'no-op returns undefined');
  assert.equal(moveAudioAnnotation(items, 'missing', 1, 1, 64, 48), undefined);
  assert.equal(moveAudioAnnotation(items, 'n', 5, 5, 64, 48), undefined, 'notes are not audio markers');
  assert.equal(moveAudioAnnotation(items, 'm-1', Number.NaN, 1, 64, 48), undefined);
  assert.deepEqual(removeAudioAnnotation(items, 'm-1'), [items[0]]);
  assert.equal(removeAudioAnnotation(items, 'n'), undefined);
  assert.deepEqual(nudgeAudioAnnotation({ x: 5, y: 5 }, 'ArrowLeft', false), { x: 4, y: 5 });
  assert.deepEqual(nudgeAudioAnnotation({ x: 5, y: 5 }, 'ArrowDown', true), { x: 5, y: 15 });
  assert.equal(nudgeAudioAnnotation({ x: 5, y: 5 }, 'Enter', false), undefined);
  assert.equal(nextAudioNoteLabel(items), 'Audio note 2');
  assert.equal(nextAudioNoteLabel(undefined), 'Audio note 1');
  assert.equal(formatAudioDuration(65_400), '1:05');
  assert.equal(formatAudioDuration(120_000), '2:00');
  assert.equal(preferredRecorderMime((type) => type === 'audio/ogg;codecs=opus'), 'audio/ogg;codecs=opus');
  assert.equal(preferredRecorderMime(() => { throw new Error('nope'); }), undefined);
});

test('crop keeps audio markers inside the retained canvas and translates them', () => {
  const kept = cropMeasurements([marker('in', 'a-1', { x: 30, y: 30 }), marker('out', 'a-2', { x: 2, y: 2 })], { left: 10, top: 10, width: 40, height: 30 });
  assert.deepEqual(kept.map((item) => [item.id, item.x, item.y]), [['in', 20, 20]]);
});

test('validateDraft normalizes untrusted audio and prunes clips no frame references', () => {
  const clip = clipOf();
  const result = validateDraft(
    draft([frame([marker('m-1', 'a-1'), marker('m-2', 'a-gone')])], { 'a-1': clip, 'a-unused': clipOf(wav(3)) }),
  );
  assert.deepEqual(Object.keys(result.audio), ['a-1']);
  assert.deepEqual(result.history[0].measurements.map((item) => item.id), ['m-1']);
  // Drafts without audio keep no audio field at all.
  assert.equal('audio' in validateDraft(draft([frame(undefined)])), false);
  // A structurally invalid marker still fails the frame closed, like any overlay.
  assert.throws(() => validateDraft(draft([frame([{ ...marker('m', 'a-1'), x: 999 }])], { 'a-1': clip })));
  // Clips referenced only by an undo/redo frame survive.
  const undoable = validateDraft({ ...draft([frame([marker('m-1', 'a-1')]), frame([])], { 'a-1': clip }), index: 1 });
  assert.deepEqual(Object.keys(undoable.audio), ['a-1']);
});

test('cloud payloads strip recordings and markers; the source draft is untouched', () => {
  const source = validateDraft(draft([frame([marker('m-1', 'a-1'), { id: 'n', kind: 'note', x: 1, y: 1, text: 'kept' }])], { 'a-1': clipOf() }));
  const cloud = stripPrivateMetadata(source);
  assert.equal(cloud.audio, undefined);
  assert.deepEqual(cloud.history[0].measurements.map((item) => item.kind), ['note']);
  assert.ok(!JSON.stringify(cloud).includes('data:audio'));
  assert.ok(source.audio['a-1']);
  assert.equal(source.history[0].measurements.length, 2);
  assert.deepEqual(stripAudioAnnotations({ history: [frame(undefined)] }).history[0].measurements, undefined);
});

test('draft manifests store each clip once by content hash and decode verified bytes', async () => {
  const clip = clipOf(wav(64));
  const safe = validateDraft(draft([frame([marker('m-1', 'a-1')]), frame([marker('m-1', 'a-1'), marker('m-2', 'a-1')])], { 'a-1': clip }));
  const assetHash = await hashDraftAsset(safe.assets[assetId].url);
  const audioHash = await hashDraftAsset(clip.url);
  const manifest = createDraftManifest(safe, 3, new Map([[assetId, assetHash]]), 'now', new Map(), new Map([['a-1', audioHash]]));
  assert.ok(isDraftManifest(manifest));
  assert.deepEqual(manifest.audioRefs, { 'a-1': { hash: audioHash, mime: 'audio/wav', bytes: clip.bytes, durationMs: 100 } });
  assert.ok(!JSON.stringify(manifest).includes('data:audio'), 'the pointer carries hashes only');
  assert.deepEqual(manifestAssetHashes(manifest).sort(), [assetHash, audioHash].sort());
  const record = (url, hash) => ({ kind: 'pixelforge-draft-asset', hash, bytes: new TextEncoder().encode(url).buffer });
  const records = new Map([[assetHash, record(safe.assets[assetId].url, assetHash)], [audioHash, record(clip.url, audioHash)]]);
  const decoded = validateDraft({ ...(await decodeDraftManifest(manifest, records)), localRevision: 3 });
  assert.deepEqual(decoded.audio, safe.audio);
  // A tampered clip record fails closed.
  const tampered = new Map(records);
  tampered.set(audioHash, record(clip.url.replace(/.$/, 'B'), audioHash));
  await assert.rejects(() => decodeDraftManifest(manifest, tampered), /checksum/);
  // Missing clip hashes are refused while writing.
  assert.throws(() => createDraftManifest(safe, 3, new Map([[assetId, assetHash]])), /not hashed/);
  // Forged audio refs fail manifest validation.
  assert.equal(isDraftManifest({ ...manifest, audioRefs: { 'a-1': { ...manifest.audioRefs['a-1'], mime: 'text/html' } } }), false);
  assert.equal(isDraftManifest({ ...manifest, audioRefs: { 'a-1': { ...manifest.audioRefs['a-1'], bytes: AUDIO_NOTE_MAX_BYTES + 1 } } }), false);
  assert.equal(isDraftManifest({ ...manifest, audioRefs: { '../x': manifest.audioRefs['a-1'] } }), false);
  // Without audio the manifest keeps its previous shape.
  const plain = createDraftManifest(validateDraft(draft([frame(undefined)])), 1, new Map([[assetId, assetHash]]), 'now');
  assert.equal('audioRefs' in plain, false);
});

test('portable projects carry audio clips and markers through save and open', async () => {
  const clip = clipOf(wav(400), 50);
  const source = draft([frame([marker('m-1', 'a-1', { label: 'Client feedback' })])], { 'a-1': clip });
  const reopened = await readPortableBundle(await writePortableBundle(source));
  assert.deepEqual(reopened.audio, { 'a-1': clip });
  assert.deepEqual(audioAnnotations(reopened.history[0]).map((item) => item.label), ['Client feedback']);
  assert.deepEqual([...decodeAudioDataUrl(reopened.audio['a-1'].url).bytes], [...wav(400)]);
});

test('write-ahead estimates include audio and referenced clips are tracked per history', () => {
  const clip = clipOf(wav(500));
  const withAudio = validateDraft(draft([frame([marker('m-1', 'a-1')])], { 'a-1': clip }));
  const without = validateDraft(draft([frame(undefined)]));
  assert.equal(estimatedPendingDraftBytes(withAudio) - estimatedPendingDraftBytes(without), clip.url.length);
  assert.deepEqual(Object.keys(referencedAudioClips(withAudio.history, { 'a-1': clip, 'a-2': clip })), ['a-1']);
  assert.deepEqual(referencedAudioClips(withAudio.history, undefined), {});
});

test('the tool sits after Note in the I family with its own icon and Tool options section', () => {
  assert.deepEqual(TOOL_FAMILIES.i, ['eyedropper', 'color-sampler', 'ruler', 'note', 'audio-note', 'count']);
  const measure = TOOL_CATEGORIES.find((category) => category.id === 'measure');
  assert.equal(measure.tools.indexOf('audio-note'), measure.tools.indexOf('note') + 1);
  assert.equal(TOOL_ICONS['audio-note'], 'AudioLines');
  assert.equal(cycleFamilyTool('note', 'i'), 'audio-note');
  assert.equal(cycleFamilyTool('audio-note', 'i'), 'count');
  assert.equal(cycleFamilyTool('audio-note', 'i', true), 'note');
  assert.equal(TOOL_SECTIONS['audio-note'], 'tool-options');
  assert.ok(validateDraft(draft([frame(undefined)])).settings.tool === 'audio-note', 'the tool persists in draft settings');
});
