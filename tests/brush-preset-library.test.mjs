import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRUSH_PRESET_STORAGE_KEY,
  BUILT_IN_BRUSH_PRESETS,
  builtInBrushPresetById,
  deleteCustomBrushPreset,
  isEditableBrushPreset,
  mergeBrushPresetLibraries,
  parseBrushPresetLibrary,
  readStoredBrushPresets,
  renameCustomBrushPreset,
  serializeBrushPresetLibrary,
  writeStoredBrushPresets,
} from '../src/brushPresetLibrary.ts';
import { createCustomBrushPreset, validCustomBrushPreset } from '../src/customBrushPresets.ts';
import { DEFAULT_BRUSH_DYNAMICS, brushDabsAt, validBrushDynamics } from '../src/brushDynamics.ts';

const values = {
  size: 24,
  hardness: 70,
  spacing: 18,
  angle: 12,
  roundness: 92,
  flipX: false,
  flipY: true,
  pressureSize: true,
  pressureOpacity: false,
  pressureCurve: 'soft',
  brushSmoothing: 20,
  brushScatter: 4,
  brushTexture: 6,
  brushDual: 0,
  secondaryBrushPreset: 'none',
  brushBristle: 0,
  brushWetEdges: 0,
  brushBuildUp: 0,
  brushFlow: 90,
};
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const preset = (n, label = `Preset ${n}`, extra = {}) => createCustomBrushPreset(id(n), label, { ...values, ...extra });

class MemoryStorage {
  constructor() { this.items = new Map(); }
  getItem(key) { return this.items.has(key) ? this.items.get(key) : null; }
  setItem(key, value) { this.items.set(key, String(value)); }
}

test('built-in space presets are valid, distinct and match their intent', () => {
  const ids = BUILT_IN_BRUSH_PRESETS.map((item) => item.id);
  assert.deepEqual(BUILT_IN_BRUSH_PRESETS.map((item) => item.label), ['Star field', 'Soft glow', 'Dust / nebula', 'Smoke wisp', 'Silk smoke']);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of BUILT_IN_BRUSH_PRESETS) {
    assert.match(item.id, /^builtin-/);
    assert.ok(item.description.length > 10);
    const { description: _description, ...settings } = item;
    // Same captured shape as saved presets, so they apply identically.
    assert.equal(validCustomBrushPreset({ ...settings, id: id(99) }), true, item.label);
    assert.equal(validBrushDynamics(item.brushDynamics), true);
    assert.equal(builtInBrushPresetById(item.id), item);
  }
  assert.equal(builtInBrushPresetById('builtin-missing'), undefined);
  const star = builtInBrushPresetById('builtin-star-field');
  assert.ok(star.size <= 6 && star.hardness === 100 && star.brushScatter >= 500);
  assert.ok(star.brushDynamics.count > 1 && star.brushDynamics.sizeJitter > 0);
  assert.ok(star.brushDynamics.brightnessJitter > 0 && star.brushDynamics.hueJitter > 0);
  const glow = builtInBrushPresetById('builtin-soft-glow');
  assert.ok(glow.size >= 100 && glow.hardness === 0 && glow.brushOpacity <= 25);
  const dust = builtInBrushPresetById('builtin-dust-nebula');
  assert.ok(dust.hardness === 0 && dust.brushScatter > 0 && dust.brushDynamics.opacityJitter > 0);
  const smoke = builtInBrushPresetById('builtin-smoke-wisp');
  assert.ok(smoke.hardness === 0 && smoke.brushOpacity <= 25 && smoke.brushDynamics.sizeJitter > 0);
  // Star field produces several widely scattered dabs per step.
  const dabs = brushDabsAt({ x: 500, y: 500 }, star.size, star.brushScatter, star.brushDynamics);
  assert.ok(dabs.length > 1);
  assert.ok(dabs.some((dab) => Math.hypot(dab.x - 500, dab.y - 500) > star.size * 2));
  assert.ok(Object.isFrozen(BUILT_IN_BRUSH_PRESETS));
});

test('saved presets carry colour dynamics and opacity and reject bad values', () => {
  const colourful = preset(1, 'Nebula', {
    brushOpacity: 30,
    brushDynamics: { ...DEFAULT_BRUSH_DYNAMICS, hueJitter: 25, colorMixJitter: 50 },
  });
  assert.equal(validCustomBrushPreset(colourful), true);
  assert.deepEqual(mergeBrushPresetLibraries([colourful]), [colourful]);
  assert.equal(validCustomBrushPreset({ ...colourful, brushOpacity: 0 }), false);
  assert.equal(validCustomBrushPreset({ ...colourful, brushOpacity: 101 }), false);
  assert.equal(validCustomBrushPreset({ ...colourful, brushDynamics: { hueJitter: 200 } }), false);
  // Legacy presets without opacity or colour dynamics stay valid.
  const legacy = preset(2);
  assert.equal('brushOpacity' in legacy, false);
  assert.equal(validCustomBrushPreset({ ...legacy, brushDynamics: { count: 2, sizeJitter: 10 } }), true);
  const [migrated] = mergeBrushPresetLibraries([{ ...legacy, brushDynamics: { count: 2 } }]);
  assert.equal(migrated.brushDynamics.hueJitter, 0);
  assert.equal(migrated.brushDynamics.count, 2);
});

test('rename and delete edit only saved presets', () => {
  const list = [preset(1, 'One'), preset(2, 'Two')];
  const renamed = renameCustomBrushPreset(list, id(2), '  Galaxy core  ');
  assert.deepEqual(renamed.map((item) => item.label), ['One', 'Galaxy core']);
  assert.equal(list[1].label, 'Two', 'input is not mutated');
  assert.equal(renameCustomBrushPreset(list, id(1), 'x'.repeat(200))[0].label.length, 80);
  assert.throws(() => renameCustomBrushPreset(list, id(1), '   '), /empty/);
  assert.throws(() => renameCustomBrushPreset(list, id(3), 'Missing'), /not found/);
  assert.throws(() => renameCustomBrushPreset(list, 'builtin-star-field', 'Mine'), /not found/);
  assert.deepEqual(deleteCustomBrushPreset(list, id(1)).map((item) => item.label), ['Two']);
  assert.deepEqual(deleteCustomBrushPreset(list, 'builtin-star-field'), list);
  assert.equal(isEditableBrushPreset(list, id(1)), true);
  assert.equal(isEditableBrushPreset(list, 'builtin-soft-glow'), false);
});

test('merge keeps the first copy of each id, drops invalid entries and keeps the newest 32', () => {
  const device = [preset(1, 'Device copy'), preset(2)];
  const project = [preset(1, 'Project copy'), preset(3), { id: 'bad' }, null, 'x'];
  assert.deepEqual(mergeBrushPresetLibraries(device, project).map((item) => item.label), ['Device copy', 'Preset 2', 'Preset 3']);
  assert.deepEqual(mergeBrushPresetLibraries(undefined, 'nope', {}), []);
  const many = Array.from({ length: 40 }, (_, index) => preset(index + 1));
  const merged = mergeBrushPresetLibraries(many);
  assert.equal(merged.length, 32);
  assert.equal(merged[0].id, id(9));
});

test('the storage envelope round-trips and corrupt storage falls back to an empty library', () => {
  const list = [preset(1, 'Stars', { brushDynamics: { ...DEFAULT_BRUSH_DYNAMICS, brightnessJitter: 40 } }), preset(2)];
  const raw = serializeBrushPresetLibrary(list);
  assert.deepEqual(JSON.parse(raw).version, 1);
  assert.deepEqual(parseBrushPresetLibrary(raw), list);
  for (const corrupt of [undefined, null, '', '{', 'null', '[]', '42', '{"version":2,"presets":[]}', '{"version":1,"presets":"x"}'])
    assert.deepEqual(parseBrushPresetLibrary(corrupt), [], String(corrupt));
  // Invalid entries inside a valid envelope are dropped, valid ones kept.
  assert.deepEqual(parseBrushPresetLibrary(JSON.stringify({ version: 1, presets: [{ ...list[0], size: -1 }, list[1]] })), [list[1]]);

  const storage = new MemoryStorage();
  assert.deepEqual(readStoredBrushPresets(storage), []);
  assert.equal(writeStoredBrushPresets(storage, list), true);
  assert.deepEqual(readStoredBrushPresets(storage), list);
  storage.setItem(BRUSH_PRESET_STORAGE_KEY, 'not json');
  assert.deepEqual(readStoredBrushPresets(storage), []);
  const throwing = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
  assert.deepEqual(readStoredBrushPresets(throwing), []);
  assert.equal(writeStoredBrushPresets(throwing, list), false);
  assert.deepEqual(readStoredBrushPresets(undefined), []);
  assert.equal(writeStoredBrushPresets(null, list), false);
});
