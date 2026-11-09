import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addToolPreset,
  allToolDefaultSettings,
  createToolPreset,
  defaultToolSettingValues,
  deleteToolPreset,
  duplicateToolPreset,
  exportToolPresets,
  filterToolPresets,
  isPresetTool,
  mergeImportedToolPresets,
  modifiedToolSettings,
  moveToolPreset,
  moveToolPresetTo,
  normalizeToolPresets,
  parseToolPreset,
  parseToolPresetImport,
  parseToolPresetLibrary,
  PRESET_TOOL_LABELS,
  PRESET_TOOLS,
  readStoredToolPresets,
  renameToolPreset,
  resolveToolPresetSettings,
  serializeToolPresetLibrary,
  stableStringify,
  toolDefaultSettings,
  toolHasCategory,
  toolPresetFields,
  toolPresetMatches,
  TOOL_PRESET_FIELDS,
  TOOL_PRESET_IMPORT_MAX_BYTES,
  TOOL_PRESET_LIMIT,
  TOOL_PRESET_STORAGE_KEY,
  TOOL_PRESET_STORAGE_MAX_BYTES,
  TOOL_SETTING_FIELDS,
  TOOL_SETTING_KEYS,
  updateToolPreset,
  validToolPreset,
  writeStoredToolPresets,
} from '../src/toolPresets.ts';

const ALL = { includeColor: true, includeSize: true };
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** A full option set where every value differs from its default. */
function changedValues() {
  const values = defaultToolSettingValues();
  return {
    ...values,
    color: '#123456',
    backgroundColor: '#abcdef',
    size: 42,
    hardness: 35,
    brushOpacity: 60,
    brushBlendMode: 'screen',
    brushPreset: 'round-soft',
    spacing: 80,
    brushSmoothing: 25,
    brushScatter: 300,
    brushDynamics: { ...values.brushDynamics, count: 3, sizeJitter: 40, hueJitter: 10 },
    brushTexture: 5,
    brushDual: 6,
    brushBristle: 7,
    brushWetEdges: 8,
    brushBuildUp: 9,
    brushFlow: 70,
    angle: 30,
    roundness: 50,
    flipX: true,
    flipY: true,
    pressureSize: true,
    pressureOpacity: true,
    pressureCurve: 'soft',
    secondaryBrushPreset: 'round-soft',
    paintSymmetry: { ...values.paintSymmetry, mode: 'radial', segments: 6 },
    patternId: 'stripes',
    patternTileSize: 64,
    redEyeThreshold: 50,
    redEyeAmount: 80,
    colorTolerance: 60,
    tonalExposure: 70,
    tonalRange: 'shadows',
    spongeMode: 'desaturate',
    spongeVibrance: 20,
    mixerBrush: { ...values.mixerBrush, wet: 90, mix: 10 },
    historyBrush: { ...values.historyBrush, opacity: 40 },
    artHistoryBrush: { ...values.artHistoryBrush, style: 9, fidelity: 30 },
    gradientMode: 'radial',
    gradientEnd: 'background',
    gradientMidpoint: '#00ff00',
    gradientMidpointPosition: 30,
    gradientReverse: true,
    gradientDither: 40,
    gradientNoise: 20,
    gradientBlend: 'multiply',
    gradientOpacity: 70,
    gradientStops: [{ position: 25, color: '#ff0000' }],
    polygonVariant: 'star',
    polygonSides: 7,
    polygonInnerRadius: 0.4,
    text: 'Hello',
    fontFamily: 'Georgia',
    fontSize: 90,
    fontPreviewSize: 'large',
    selectionOperation: 'add',
  };
}

test('every option has a valid default and a parser that accepts it', () => {
  const defaults = defaultToolSettingValues();
  for (const key of TOOL_SETTING_KEYS) {
    const field = TOOL_SETTING_FIELDS[key];
    assert.ok(field.label, key);
    assert.deepEqual(field.parse(defaults[key]), defaults[key], key);
    assert.equal(field.parse(Symbol('bad')), undefined, key);
  }
  // Defaults are fresh copies, never shared mutable objects.
  defaults.brushDynamics.count = 9;
  assert.notEqual(defaultToolSettingValues().brushDynamics.count, 9);
});

test('the changed fixture is valid for every option and differs from defaults', () => {
  const changed = changedValues(), defaults = defaultToolSettingValues();
  for (const key of TOOL_SETTING_KEYS) {
    assert.notEqual(TOOL_SETTING_FIELDS[key].parse(changed[key]), undefined, key);
    assert.notEqual(stableStringify(changed[key]), stableStringify(defaults[key]), key);
  }
});

test('the preset table covers the painting, retouch, gradient, text, shape and selection tools', () => {
  for (const tool of ['brush', 'pencil', 'eraser', 'smudge', 'blur', 'sharpen', 'dodge', 'burn', 'sponge', 'clone', 'heal', 'mixer-brush', 'history-brush', 'gradient', 'text', 'rectangle', 'polygon', 'select', 'lasso', 'magic-wand'])
    assert.equal(isPresetTool(tool), true, tool);
  for (const tool of ['move', 'hand', 'zoom', 'crop', 'pen', 'not-a-tool', 42]) assert.equal(isPresetTool(tool), false, String(tool));
  for (const tool of PRESET_TOOLS) {
    assert.ok(PRESET_TOOL_LABELS[tool], tool);
    const fields = toolPresetFields(tool);
    assert.ok(fields.length > 0, tool);
    assert.equal(new Set(fields).size, fields.length, `${tool} has duplicate fields`);
    for (const key of fields) assert.ok(TOOL_SETTING_FIELDS[key], `${tool}.${key}`);
  }
  assert.equal(toolHasCategory('brush', 'color'), true);
  assert.equal(toolHasCategory('eraser', 'color'), false);
  assert.equal(toolHasCategory('text', 'size'), true);
  assert.equal(toolHasCategory('select', 'size'), false);
});

test('snapshot → apply round-trips every tool’s options exactly', () => {
  const changed = changedValues();
  for (const tool of PRESET_TOOLS) {
    const preset = createToolPreset(id(1), `${tool} preset`, tool, changed, ALL);
    assert.equal(validToolPreset(preset), true, tool);
    assert.deepEqual(Object.keys(preset.settings).sort(), [...toolPresetFields(tool)].sort(), tool);
    const applied = { ...defaultToolSettingValues(), ...resolveToolPresetSettings(preset) };
    for (const key of toolPresetFields(tool)) assert.deepEqual(applied[key], changed[key], `${tool}.${key}`);
    assert.equal(toolPresetMatches(preset, applied), true, tool);
    assert.equal(toolPresetMatches(preset, defaultToolSettingValues()), false, tool);
    // Re-parsing the stored JSON yields the same preset.
    assert.deepEqual(parseToolPreset(JSON.parse(JSON.stringify(preset))), preset, tool);
  }
});

test('captured values are detached from the editor state', () => {
  const changed = changedValues();
  const preset = createToolPreset(id(1), 'Detached', 'brush', changed, ALL);
  changed.brushDynamics.count = 16;
  assert.equal(preset.settings.brushDynamics.count, 3);
  const resolved = resolveToolPresetSettings(preset);
  resolved.brushDynamics.count = 12;
  assert.equal(preset.settings.brushDynamics.count, 3);
});

test('include colour / include size flags decide which values are stored and applied', () => {
  const changed = changedValues();
  const plain = createToolPreset(id(1), 'No colour', 'brush', changed, { includeColor: false, includeSize: false });
  assert.equal('color' in plain.settings, false);
  assert.equal('backgroundColor' in plain.settings, false);
  assert.equal('size' in plain.settings, false);
  const resolved = resolveToolPresetSettings(plain);
  assert.equal('color' in resolved, false);
  assert.equal('size' in resolved, false);
  // Current colour and size do not make an excluded preset "modified".
  assert.equal(toolPresetMatches(plain, { ...changed, color: '#000000', size: 5 }), true);
  const text = createToolPreset(id(2), 'Heading', 'text', changed, { includeColor: true, includeSize: false });
  assert.equal(text.settings.color, '#123456');
  assert.equal('fontSize' in text.settings, false);
  // A stored colour without the include flag is rejected rather than silently applied.
  assert.equal(parseToolPreset({ ...plain, settings: { ...plain.settings, color: '#ffffff' } }), undefined);
  assert.equal(parseToolPreset({ ...plain, settings: { ...plain.settings, size: 10 } }), undefined);
});

test('options a preset predates apply as defaults (forward-compatible table)', () => {
  const changed = changedValues();
  const preset = createToolPreset(id(1), 'Old', 'brush', changed, ALL);
  const legacy = { ...preset, settings: { ...preset.settings } };
  delete legacy.settings.brushBlendMode;
  delete legacy.settings.paintSymmetry;
  const parsed = parseToolPreset(legacy);
  assert.ok(parsed);
  const resolved = resolveToolPresetSettings(parsed);
  assert.equal(resolved.brushBlendMode, TOOL_SETTING_FIELDS.brushBlendMode.default);
  assert.deepEqual(resolved.paintSymmetry, TOOL_SETTING_FIELDS.paintSymmetry.default);
  assert.equal(resolved.hardness, 35);
});

test('validation rejects unknown fields, wrong tools and invalid values', () => {
  const good = createToolPreset(id(1), 'Good', 'brush', changedValues(), ALL);
  const cases = [
    null,
    [],
    'preset',
    { ...good, extra: true },
    { ...good, id: '' },
    { ...good, id: '../etc/passwd' },
    { ...good, label: '   ' },
    { ...good, label: 'x'.repeat(500) },
    { ...good, tool: 'move' },
    { ...good, tool: 'nope' },
    { ...good, includeColor: 'yes' },
    { ...good, settings: [] },
    { ...good, settings: { ...good.settings, mystery: 1 } },
    { ...good, settings: { ...good.settings, tonalExposure: 50 } }, // a Dodge option on a Brush preset
    { ...good, settings: { ...good.settings, hardness: 101 } },
    { ...good, settings: { ...good.settings, hardness: Number.NaN } },
    { ...good, settings: { ...good.settings, brushOpacity: 0 } },
    { ...good, settings: { ...good.settings, size: 0 } },
    { ...good, settings: { ...good.settings, color: 'red' } },
    { ...good, settings: { ...good.settings, color: '#12345' } },
    { ...good, settings: { ...good.settings, brushBlendMode: 'not-a-mode' } },
    { ...good, settings: { ...good.settings, pressureCurve: 'wobbly' } },
    { ...good, settings: { ...good.settings, flipX: 'true' } },
    { ...good, settings: { ...good.settings, brushDynamics: { count: 99 } } },
    { ...good, settings: { ...good.settings, paintSymmetry: { mode: 'spiral' } } },
    { ...good, settings: { ...good.settings, secondaryBrushPreset: 'unknown-tip' } },
  ];
  for (const [index, value] of cases.entries()) assert.equal(parseToolPreset(value), undefined, `case ${index}`);
  const text = createToolPreset(id(2), 'Text', 'text', changedValues(), ALL);
  assert.equal(parseToolPreset({ ...text, settings: { ...text.settings, text: 'x'.repeat(1001) } }), undefined);
  assert.equal(parseToolPreset({ ...text, settings: { ...text.settings, fontFamily: 'Comic Sans' } }), undefined);
  const gradient = createToolPreset(id(3), 'Gradient', 'gradient', changedValues(), ALL);
  assert.equal(parseToolPreset({ ...gradient, settings: { ...gradient.settings, gradientStops: [{ position: 50, color: '#fff' }] } }), undefined);
  assert.throws(() => createToolPreset(id(4), '   ', 'brush', changedValues(), ALL), /empty/);
  assert.throws(() => createToolPreset('bad id!', 'Name', 'brush', changedValues(), ALL), /invalid/);
  assert.throws(() => createToolPreset(id(5), 'Bad', 'brush', { ...changedValues(), hardness: 400 }, ALL), /invalid/);
});

test('labels are trimmed and capped', () => {
  const preset = createToolPreset(id(1), `  ${'a'.repeat(120)}  `, 'brush', changedValues(), ALL);
  assert.equal(preset.label.length, 80);
  assert.equal(createToolPreset(id(2), '  Ink  ', 'brush', changedValues(), ALL).label, 'Ink');
});

test('modified detection compares only the preset’s tool options', () => {
  const values = changedValues();
  const preset = createToolPreset(id(1), 'Ink', 'brush', values, ALL);
  assert.equal(toolPresetMatches(preset, values), true);
  assert.equal(toolPresetMatches(preset, { ...values, hardness: 36 }), false);
  assert.equal(toolPresetMatches(preset, { ...values, brushDynamics: { ...values.brushDynamics, sizeJitter: 41 } }), false);
  // Options other tools use do not count.
  assert.equal(toolPresetMatches(preset, { ...values, tonalExposure: 1, gradientNoise: 99 }), true);
  // Key order inside objects is irrelevant.
  const reordered = Object.fromEntries(Object.entries(values.brushDynamics).reverse());
  assert.equal(toolPresetMatches(preset, { ...values, brushDynamics: reordered }), true);
  assert.deepEqual(modifiedToolSettings('dodge', defaultToolSettingValues()), []);
  assert.deepEqual(modifiedToolSettings('dodge', { ...defaultToolSettingValues(), tonalExposure: 80, color: '#000000' }), ['tonalExposure']);
});

test('Reset Tool restores the tool’s option defaults and leaves colours alone', () => {
  for (const tool of PRESET_TOOLS) {
    const reset = toolDefaultSettings(tool);
    assert.equal('color' in reset, false, tool);
    assert.equal('backgroundColor' in reset, false, tool);
    const after = { ...changedValues(), ...reset };
    for (const key of toolPresetFields(tool))
      if (TOOL_SETTING_FIELDS[key].category !== 'color') assert.deepEqual(after[key], TOOL_SETTING_FIELDS[key].default, `${tool}.${key}`);
    assert.deepEqual(modifiedToolSettings(tool, after), [], tool);
  }
  const dodge = toolDefaultSettings('dodge');
  assert.equal('gradientNoise' in dodge, false);
});

test('Reset All Tools restores every tool option but keeps colours', () => {
  const after = { ...changedValues(), ...allToolDefaultSettings() };
  for (const key of TOOL_SETTING_KEYS) {
    if (TOOL_SETTING_FIELDS[key].category === 'color') assert.notDeepEqual(after[key], TOOL_SETTING_FIELDS[key].default, key);
    else assert.deepEqual(after[key], TOOL_SETTING_FIELDS[key].default, key);
  }
  for (const tool of PRESET_TOOLS) assert.deepEqual(modifiedToolSettings(tool, after), [], tool);
});

test('library edits: add, rename, duplicate, update, delete', () => {
  const values = changedValues();
  let presets = addToolPreset([], createToolPreset(id(1), 'Ink', 'brush', values, ALL));
  presets = addToolPreset(presets, createToolPreset(id(2), 'Dodge it', 'dodge', values, ALL));
  assert.throws(() => addToolPreset(presets, presets[0]), /exists/);
  presets = renameToolPreset(presets, id(1), '  Wet ink ');
  assert.equal(presets[0].label, 'Wet ink');
  assert.throws(() => renameToolPreset(presets, id(1), '  '), /empty/);
  assert.throws(() => renameToolPreset(presets, id(9), 'x'), /not found/);
  presets = duplicateToolPreset(presets, id(1), id(3));
  assert.deepEqual(presets.map((preset) => preset.id), [id(1), id(3), id(2)]);
  assert.equal(presets[1].label, 'Wet ink copy');
  assert.deepEqual(presets[1].settings, presets[0].settings);
  presets = updateToolPreset(presets, id(3), { ...values, hardness: 12 });
  assert.equal(presets[1].settings.hardness, 12);
  assert.equal(presets[0].settings.hardness, 35);
  assert.equal(presets[1].label, 'Wet ink copy');
  presets = deleteToolPreset(presets, id(1));
  assert.deepEqual(presets.map((preset) => preset.id), [id(3), id(2)]);
  assert.deepEqual(deleteToolPreset(presets, id(99)), presets);
});

test('library edits respect the preset limit', () => {
  const values = changedValues();
  const full = Array.from({ length: TOOL_PRESET_LIMIT }, (_, index) => createToolPreset(id(index + 1), `P${index}`, 'smudge', values, ALL));
  assert.throws(() => addToolPreset(full, createToolPreset(id(999), 'One more', 'smudge', values, ALL)), /limit/);
  assert.throws(() => duplicateToolPreset(full, id(1), id(1000)), /limit/);
  assert.equal(normalizeToolPresets([...full, createToolPreset(id(1001), 'Extra', 'smudge', values, ALL)]).length, TOOL_PRESET_LIMIT);
});

test('reordering by index (drag) and by visible neighbour (buttons / Alt+Arrow)', () => {
  const values = changedValues();
  const presets = [
    createToolPreset(id(1), 'A', 'brush', values, ALL),
    createToolPreset(id(2), 'B', 'dodge', values, ALL),
    createToolPreset(id(3), 'C', 'brush', values, ALL),
    createToolPreset(id(4), 'D', 'brush', values, ALL),
  ];
  const order = (list) => list.map((preset) => preset.label).join('');
  assert.equal(order(moveToolPresetTo(presets, id(4), 0)), 'DABC');
  assert.equal(order(moveToolPresetTo(presets, id(1), 99)), 'BCDA');
  assert.equal(order(moveToolPresetTo(presets, id(9), 0)), 'ABCD');
  assert.equal(order(moveToolPreset(presets, id(3), -1)), 'ACBD');
  assert.equal(order(moveToolPreset(presets, id(1), -1)), 'ABCD');
  assert.equal(order(moveToolPreset(presets, id(4), 1)), 'ABCD');
  // Within the Brush-only view, C moves above A, skipping the hidden Dodge preset.
  const brushIds = filterToolPresets(presets, { tool: 'brush' }).map((preset) => preset.id);
  assert.equal(order(moveToolPreset(presets, id(3), -1, brushIds)), 'CABD');
});

test('filtering by tool and by search text', () => {
  const values = changedValues();
  const presets = [
    createToolPreset(id(1), 'Soft ink', 'brush', values, ALL),
    createToolPreset(id(2), 'Shadow lift', 'dodge', values, ALL),
    createToolPreset(id(3), 'Hard ink', 'brush', values, ALL),
  ];
  assert.deepEqual(filterToolPresets(presets, { tool: 'brush' }).map((preset) => preset.label), ['Soft ink', 'Hard ink']);
  assert.deepEqual(filterToolPresets(presets, { tool: null }).length, 3);
  assert.deepEqual(filterToolPresets(presets, { tool: null, query: '  INK ' }).map((preset) => preset.label), ['Soft ink', 'Hard ink']);
  assert.deepEqual(filterToolPresets(presets, { tool: null, query: 'dodge' }).map((preset) => preset.label), ['Shadow lift']);
  assert.deepEqual(filterToolPresets(presets, { tool: 'dodge', query: 'ink' }), []);
});

test('device storage: versioned envelope, corrupt data, failures and size bound', () => {
  const values = changedValues();
  const presets = [createToolPreset(id(1), 'Ink', 'brush', values, ALL), createToolPreset(id(2), 'Fade', 'eraser', values, ALL)];
  const memory = new Map();
  const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  assert.equal(TOOL_PRESET_STORAGE_KEY, 'pixelforge.tool-presets.v1');
  assert.equal(writeStoredToolPresets(storage, presets), true);
  assert.equal(JSON.parse(memory.get(TOOL_PRESET_STORAGE_KEY)).version, 1);
  assert.deepEqual(readStoredToolPresets(storage), presets);
  assert.deepEqual(parseToolPresetLibrary(serializeToolPresetLibrary(presets)), presets);
  for (const raw of [undefined, '', '{', '[]', '{"version":2,"presets":[]}', JSON.stringify({ version: 1, presets: 'x' }), 'x'.repeat(TOOL_PRESET_STORAGE_MAX_BYTES + 1)])
    assert.deepEqual(parseToolPresetLibrary(raw), [], String(raw).slice(0, 20));
  // Invalid and duplicate entries are dropped, valid ones kept.
  const mixed = JSON.stringify({ version: 1, presets: [presets[0], { ...presets[1], tool: 'move' }, presets[0], presets[1]] });
  assert.deepEqual(parseToolPresetLibrary(mixed), presets);
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.deepEqual(readStoredToolPresets(throwing), []);
  assert.equal(writeStoredToolPresets(throwing, presets), false);
  assert.deepEqual(readStoredToolPresets(undefined), []);
  assert.equal(writeStoredToolPresets(null, presets), false);
  // The library is bounded in bytes as well as count.
  const longText = Array.from({ length: TOOL_PRESET_LIMIT }, (_, index) =>
    createToolPreset(id(index + 10), `Text ${index}`, 'text', { ...values, text: 'x'.repeat(1000) }, ALL));
  const roomy = longText.slice(0, 50);
  assert.ok(serializeToolPresetLibrary(roomy).length < TOOL_PRESET_STORAGE_MAX_BYTES);
  assert.ok(serializeToolPresetLibrary(longText).length < TOOL_PRESET_STORAGE_MAX_BYTES);
  // Control characters expand when escaped, so a full library can still exceed the byte bound.
  const huge = longText.map((preset) => ({ ...preset, settings: { ...preset.settings, text: ''.repeat(1000) } }));
  assert.throws(() => serializeToolPresetLibrary(huge), /limit/);
  assert.equal(writeStoredToolPresets(storage, huge), false);
  assert.deepEqual(readStoredToolPresets(storage), presets);
});

test('export/import round trip, rejection counts and file bounds', () => {
  const values = changedValues();
  const presets = [createToolPreset(id(1), 'Ink', 'brush', values, ALL), createToolPreset(id(2), 'Lift', 'dodge', values, ALL)];
  const file = exportToolPresets(presets);
  const parsed = JSON.parse(file);
  assert.equal(parsed.format, 'pixelforge-tool-presets');
  assert.equal(parsed.version, 1);
  assert.deepEqual(parseToolPresetImport(file), { presets, rejected: 0 });
  // A device-library envelope is accepted too.
  assert.deepEqual(parseToolPresetImport(serializeToolPresetLibrary(presets)).presets, presets);
  const withBad = JSON.stringify({ ...parsed, presets: [...parsed.presets, { ...parsed.presets[0], settings: { hardness: 900 } }, 'junk'] });
  assert.deepEqual(parseToolPresetImport(withBad), { presets, rejected: 2 });
  assert.throws(() => parseToolPresetImport(''), /empty/);
  assert.throws(() => parseToolPresetImport('not json'), /JSON/);
  assert.throws(() => parseToolPresetImport('{"version":1}'), /not a PixelForge/);
  assert.throws(() => parseToolPresetImport(JSON.stringify({ format: 'other', version: 1, presets: [] })), /not a PixelForge/);
  assert.throws(() => parseToolPresetImport(JSON.stringify({ version: 1, presets: [], pad: 'x'.repeat(TOOL_PRESET_IMPORT_MAX_BYTES) })), /too large/);
  assert.throws(() => parseToolPresetImport(42), /empty/);
});

test('merging imports never overwrites device presets and honours the limit', () => {
  const values = changedValues();
  const existing = [createToolPreset(id(1), 'Ink', 'brush', values, ALL)];
  const incoming = [createToolPreset(id(1), 'Imported ink', 'brush', values, ALL), createToolPreset(id(2), 'Lift', 'dodge', values, ALL)];
  let next = 100;
  const merged = mergeImportedToolPresets(existing, incoming, () => id(next++));
  assert.equal(merged.added, 2);
  assert.equal(merged.skipped, 0);
  assert.deepEqual(merged.presets.map((preset) => [preset.id, preset.label]), [[id(1), 'Ink'], [id(100), 'Imported ink'], [id(2), 'Lift']]);
  const full = Array.from({ length: TOOL_PRESET_LIMIT - 1 }, (_, index) => createToolPreset(id(index + 200), `P${index}`, 'blur', values, ALL));
  const capped = mergeImportedToolPresets(full, incoming, () => id(next++));
  assert.equal(capped.added, 1);
  assert.equal(capped.skipped, 1);
  assert.equal(capped.presets.length, TOOL_PRESET_LIMIT);
});

test('the field table is the single extension point', () => {
  // Every tool list only names known fields, so adding an option means adding
  // one TOOL_SETTING_FIELDS entry and appending its key to the tool lists.
  const known = new Set(TOOL_SETTING_KEYS);
  for (const [tool, fields] of Object.entries(TOOL_PRESET_FIELDS))
    for (const key of fields) assert.ok(known.has(key), `${tool}.${key}`);
  // Smudge currently captures the shared Size/Hardness/Strength(Opacity) options.
  assert.deepEqual([...TOOL_PRESET_FIELDS.smudge], ['size', 'hardness', 'brushOpacity']);
});
