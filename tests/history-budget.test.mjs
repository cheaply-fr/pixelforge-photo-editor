import test from 'node:test';
import assert from 'node:assert/strict';

const {
  DOCUMENT_MAX_ASSET_BYTES,
  DRAFT_HISTORY_MAX_ASSETS,
  DRAFT_HISTORY_MAX_BYTES,
  DRAFT_HISTORY_MAX_STEPS,
  HISTORY_DESKTOP_BYTES,
  HISTORY_LOW_MEMORY_BYTES,
  HISTORY_MAX_STEPS,
  HISTORY_STANDARD_BYTES,
  MIB,
  assetBytes,
  historyAssetBytes,
  historyBudgetForDevice,
  persistableHistoryDraft,
  selectPersistedHistory,
  persistedHistoryNote,
  trimHistoryToBudget,
} = await import('../src/historyBudget.ts');

// Each step references its own raster asset of `size` bytes (string length).
const asset = (size) => ({ url: 'x'.repeat(size), w: 1, h: 1 });
const frame = (assetId, name = assetId) => ({
  w: 4,
  h: 4,
  layers: [{ id: `${name}-layer`, name, kind: 'raster', visible: true, locked: false, opacity: 100, blend: 'normal', matrix: [1, 0, 0, 1, 0, 0], adjustments: {}, asset: assetId }],
  active: `${name}-layer`,
});
function stack(count, size) {
  const assets = {};
  const history = [];
  for (let i = 0; i < count; i += 1) {
    assets[`a${i}`] = asset(size);
    history.push(frame(`a${i}`, `s${i}`));
  }
  return { assets, history };
}

test('history capacity is 10x the previous 24 steps / 32 MB budget on desktop', () => {
  assert.equal(HISTORY_MAX_STEPS, 240);
  assert.equal(HISTORY_DESKTOP_BYTES, 320 * MIB);
  assert.equal(HISTORY_STANDARD_BYTES, 128 * MIB);
  assert.equal(HISTORY_LOW_MEMORY_BYTES, 96 * MIB);
  assert.equal(DOCUMENT_MAX_ASSET_BYTES, 1024 * MIB);
  assert.equal(DRAFT_HISTORY_MAX_STEPS, 24);
  assert.equal(DRAFT_HISTORY_MAX_BYTES, 64 * MIB);
  assert.equal(DRAFT_HISTORY_MAX_ASSETS, 4096);
});

test('device tier selection lowers the budget for mobile and low-memory hints', () => {
  assert.deepEqual(historyBudgetForDevice(), { tier: 'desktop', maxSteps: 240, maxBytes: HISTORY_DESKTOP_BYTES });
  assert.equal(historyBudgetForDevice({ deviceMemory: 8 }).maxBytes, HISTORY_DESKTOP_BYTES);
  assert.equal(historyBudgetForDevice({ deviceMemory: 16 }).tier, 'desktop');
  assert.equal(historyBudgetForDevice({ deviceMemory: 4 }).maxBytes, HISTORY_STANDARD_BYTES);
  assert.equal(historyBudgetForDevice({ deviceMemory: 8, mobile: true }).maxBytes, HISTORY_STANDARD_BYTES);
  assert.equal(historyBudgetForDevice({ mobile: true }).tier, 'standard');
  assert.equal(historyBudgetForDevice({ deviceMemory: 2 }).maxBytes, HISTORY_LOW_MEMORY_BYTES);
  assert.equal(historyBudgetForDevice({ deviceMemory: 1, mobile: true }).tier, 'low-memory');
  // Invalid hints fall back to the desktop tier (Safari/Firefox omit them).
  assert.equal(historyBudgetForDevice({ deviceMemory: Number.NaN }).tier, 'desktop');
  assert.equal(historyBudgetForDevice({ deviceMemory: -1 }).tier, 'desktop');
  for (const hints of [{}, { mobile: true }, { deviceMemory: 1 }])
    assert.equal(historyBudgetForDevice(hints).maxSteps, HISTORY_MAX_STEPS);
});

test('asset bytes count each distinct referenced asset once', () => {
  assert.equal(assetBytes(asset(10)), 10);
  assert.equal(assetBytes(undefined), 0);
  const assets = { a: asset(100), b: asset(50) };
  assert.equal(historyAssetBytes([frame('a', 'one'), frame('a', 'two'), frame('b')], assets), 150);
});

test('trimming by step count drops the oldest undo states and keeps the current frame', () => {
  const { assets, history } = stack(250, 10);
  const result = trimHistoryToBudget(history, 249, assets, { maxSteps: 240, maxBytes: Infinity });
  assert.equal(result.history.length, 240);
  assert.equal(result.history[0], history[10]);
  assert.equal(result.history.at(-1), history[249]);
  assert.equal(result.index, 239);
  assert.equal(result.droppedUndo, 10);
  assert.equal(result.droppedRedo, 0);
  assert.equal(result.bytes, 2400);
});

test('trimming by byte budget keeps as many recent steps as fit', () => {
  // A 2646x4096 poster produces ~10-25 MB per raster step; 12 x 20 MB = 240 MB.
  const { assets, history } = stack(30, 20 * MIB);
  const desktop = trimHistoryToBudget(history, 29, assets, historyBudgetForDevice({ deviceMemory: 8 }));
  assert.equal(desktop.history.length, 16); // 16 x 20 MB = 320 MB
  assert.equal(desktop.history.at(-1), history[29]);
  assert.ok(desktop.bytes <= HISTORY_DESKTOP_BYTES);
  const phone = trimHistoryToBudget(history, 29, assets, historyBudgetForDevice({ mobile: true }));
  assert.equal(phone.history.length, 6); // 6 x 20 MB = 120 MB <= 128 MB
  assert.equal(phone.history.at(-1), history[29]);
  // The previous 32 MB budget kept a single step of this document.
  const old = trimHistoryToBudget(history, 29, assets, { maxSteps: 24, maxBytes: 32 * MIB });
  assert.equal(old.history.length, 1);
});

test('the current frame is kept even when it alone exceeds the budget', () => {
  const { assets, history } = stack(3, 100);
  const result = trimHistoryToBudget(history, 2, assets, { maxSteps: 240, maxBytes: 10 });
  assert.deepEqual(result.history, [history[2]]);
  assert.equal(result.index, 0);
  assert.equal(result.currentBytes, 100);
});

test('shared assets are not double counted while trimming', () => {
  const assets = { big: asset(100), s1: asset(1), s2: asset(1) };
  const history = [frame('big', 'one'), frame('s1'), { ...frame('s2'), layers: [...frame('s2').layers, { ...frame('big', 'two').layers[0] }] }];
  const result = trimHistoryToBudget(history, 2, assets, { maxSteps: 240, maxBytes: 102 });
  assert.equal(result.history.length, 3);
  assert.equal(result.bytes, 102);
});

test('redo states survive trimming; oldest undo states go first', () => {
  const { assets, history } = stack(10, 10);
  // Current state in the middle: 5 undo, 4 redo.
  const fitsAll = trimHistoryToBudget(history, 5, assets, { maxSteps: 240, maxBytes: 100 });
  assert.equal(fitsAll.history.length, 10);
  assert.equal(fitsAll.droppedRedo, 0);
  const tight = trimHistoryToBudget(history, 5, assets, { maxSteps: 240, maxBytes: 70 });
  assert.equal(tight.droppedUndo, 3);
  assert.equal(tight.droppedRedo, 0);
  assert.equal(tight.history[tight.index], history[5]);
  assert.equal(tight.history.at(-1), history[9]);
  // Redo states are only dropped (farthest first) after every undo state.
  const tighter = trimHistoryToBudget(history, 5, assets, { maxSteps: 3, maxBytes: Infinity });
  assert.equal(tighter.droppedUndo, 5);
  assert.equal(tighter.droppedRedo, 2);
  assert.deepEqual(tighter.history, [history[5], history[6], history[7]]);
  assert.equal(tighter.index, 0);
});

test('trimming rejects invalid positions', () => {
  assert.throws(() => trimHistoryToBudget([], 0, {}, { maxSteps: 1, maxBytes: 1 }));
  const { assets, history } = stack(2, 1);
  assert.throws(() => trimHistoryToBudget(history, 2, assets, { maxSteps: 1, maxBytes: 1 }));
  assert.throws(() => trimHistoryToBudget(history, 0.5, assets, { maxSteps: 1, maxBytes: 1 }));
});

test('draft persistence keeps the current frame and the nearest steps that fit', () => {
  const { assets, history } = stack(40, 10 * MIB);
  const window = selectPersistedHistory(history, 39, assets);
  assert.equal(window.end, 39);
  assert.ok(window.bytes <= DRAFT_HISTORY_MAX_BYTES);
  assert.equal(window.end - window.start + 1, 6); // 6 x 10 MB <= 64 MB referenced-asset cap
  assert.equal(window.omittedUndo, 34);
  assert.equal(window.omittedRedo, 0);
  // The step limit applies even to tiny steps.
  const small = stack(100, 10);
  const capped = selectPersistedHistory(small.history, 99, small.assets);
  assert.equal(capped.end - capped.start + 1, DRAFT_HISTORY_MAX_STEPS);
  assert.equal(capped.end, 99);
});

test('draft persistence alternates undo and redo neighbours around the current frame', () => {
  const { assets, history } = stack(20, 10);
  const window = selectPersistedHistory(history, 10, assets, { maxSteps: 5, maxBytes: Infinity });
  assert.deepEqual([window.start, window.end], [8, 12]);
  // When one side is exhausted the other side keeps growing.
  const edge = selectPersistedHistory(history, 1, assets, { maxSteps: 5, maxBytes: Infinity });
  assert.deepEqual([edge.start, edge.end], [0, 4]);
});

test('draft persistence respects the distinct-asset limit', () => {
  // Each frame references 3 distinct assets; a 7-asset limit allows 2 frames.
  const assets = {};
  const history = [];
  for (let i = 0; i < 5; i += 1) {
    const f = frame(`a${i}`, `s${i}`);
    for (const extra of ['m', 'n']) {
      assets[`${extra}${i}`] = asset(1);
      f.layers.push({ ...f.layers[0], id: `${extra}${i}-layer`, asset: `${extra}${i}` });
    }
    assets[`a${i}`] = asset(1);
    history.push(f);
  }
  const window = selectPersistedHistory(history, 4, assets, { maxAssets: 7 });
  assert.deepEqual([window.start, window.end], [3, 4]);
});

test('draft persistence keeps an oversized current frame alone', () => {
  const { assets, history } = stack(3, 60 * MIB);
  const window = selectPersistedHistory(history, 1, assets);
  assert.deepEqual([window.start, window.end], [1, 1]);
  assert.equal(window.omittedUndo, 1);
  assert.equal(window.omittedRedo, 1);
});

test('persistable drafts re-base index, assets and the History Brush source', () => {
  const { assets, history } = stack(30, 10);
  const draft = { version: 2, history, index: 29, assets, name: 'x', settings: { historySourceIndex: 25 } };
  const { draft: saved, window } = persistableHistoryDraft(draft);
  assert.equal(saved.history.length, 24);
  assert.equal(saved.index, 23);
  assert.equal(saved.history[saved.index], history[29]);
  assert.equal(window.start, 6);
  assert.equal(saved.settings.historySourceIndex, 19);
  assert.deepEqual(Object.keys(saved.assets).sort((x, y) => x.localeCompare(y)), history.slice(6).map((f) => f.layers[0].asset).sort((x, y) => x.localeCompare(y)));
  assert.equal(draft.history.length, 30, 'input is not mutated');
  // A source outside the persisted window falls back to the current frame.
  const dropped = persistableHistoryDraft({ ...draft, settings: { historySourceIndex: 2 } });
  assert.equal('historySourceIndex' in dropped.draft.settings, false);
  // Fitting histories pass through untouched.
  const fits = { ...draft, history: history.slice(0, 3), index: 2, settings: {} };
  assert.equal(persistableHistoryDraft(fits).draft, fits);
});

test('History panel explains memory-only steps', () => {
  assert.equal(persistedHistoryNote(3, { start: 0, end: 2, bytes: 1, omittedUndo: 0, omittedRedo: 0 }), undefined);
  assert.equal(persistedHistoryNote(3, null), undefined);
  assert.match(
    persistedHistoryNote(12, { start: 8, end: 11, bytes: 1, omittedUndo: 8, omittedRedo: 0 }),
    /Steps 9–12 are saved on this device; 8 older steps stay in memory only/,
  );
  assert.match(
    persistedHistoryNote(12, { start: 2, end: 5, bytes: 1, omittedUndo: 2, omittedRedo: 6 }),
    /2 older steps and 6 redo steps/,
  );
});
