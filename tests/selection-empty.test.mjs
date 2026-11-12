import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_SELECTION_NOTICE,
  emptyGestureResult,
  emptySelection,
  isExplicitEmptySelection,
  quickFillShortcut,
  selectionCoverageIsEmpty,
} from '../src/selectionEmpty.ts';
import { boundSelectionPolygon } from '../src/selectionPolygon.ts';
import { composeSelectionAlpha } from '../src/selectionComposition.ts';
import { commonLayer, validateFrame } from '../src/document.ts';
import { MARQUEE_FEATHER_MAX, normalizeMarqueeOptions } from '../src/marqueeOptions.ts';
import { MAX_SELECTION_FEATHER } from '../src/selectionFeather.ts';

/** Rasterise the part list the way renderSelection composes it (pure, pixel centres). */
function rasterize(selection, width, height) {
  const alpha = new Uint8ClampedArray(width * height);
  for (const part of selection.parts) {
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) {
        const inside = x + 0.5 >= part.x && x + 0.5 < part.x + part.w && y + 0.5 >= part.y && y + 0.5 < part.y + part.h;
        const index = y * width + x;
        if (part.operation === 'replace') alpha[index] = inside ? 255 : 0;
        else if (part.operation === 'add' && inside) alpha[index] = 255;
        else if (part.operation === 'subtract' && inside) alpha[index] = 0;
        else if (part.operation === 'intersect' && !inside) alpha[index] = 0;
      }
  }
  return selection.inverted ? alpha.map((value) => 255 - value) : alpha;
}

test('an explicit empty selection covers no pixels, validates and survives a draft roundtrip', () => {
  const selection = emptySelection(30, 20);
  assert.ok(isExplicitEmptySelection(selection));
  assert.ok(selectionCoverageIsEmpty(rasterize(selection, 30, 20), false));
  const asset = '11111111-1111-4111-8111-111111111111';
  const layer = { ...commonLayer('Base'), kind: 'raster', asset };
  const assets = {
    [asset]: {
      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=',
      w: 1,
      h: 1,
    },
  };
  const frame = { w: 30, h: 20, layers: [layer], active: layer.id, selection };
  assert.doesNotThrow(() => validateFrame(frame, assets), 'empty selection must be a valid stored selection');
  const restored = JSON.parse(JSON.stringify(selection));
  assert.ok(isExplicitEmptySelection(restored));
  // Inverting an empty selection selects the whole canvas (it is a real selection, not "none").
  const inverted = { ...selection, inverted: true };
  assert.equal(isExplicitEmptySelection(inverted), false);
  assert.ok(rasterize(inverted, 30, 20).every((value) => value === 255));
});

test('emptySelection clamps degenerate sizes to a valid 1 px frame', () => {
  const selection = emptySelection(0, Number.NaN);
  assert.equal(selection.w, 1);
  assert.equal(selection.h, 1);
  assert.ok(isExplicitEmptySelection(selection));
});

test('ordinary selections are never mistaken for the explicit empty encoding', () => {
  assert.equal(isExplicitEmptySelection(undefined), false);
  const rect = { shape: 'rectangle', x: 2, y: 2, w: 5, h: 5, feather: 0, inverted: false };
  assert.equal(isExplicitEmptySelection(rect), false);
  assert.equal(isExplicitEmptySelection({ ...rect, parts: [{ ...rect, operation: 'replace' }] }), false);
  // A subtract that leaves something behind is not the canonical encoding.
  assert.equal(
    isExplicitEmptySelection({
      ...rect,
      parts: [
        { shape: 'rectangle', x: 0, y: 0, w: 10, h: 10, operation: 'replace' },
        { shape: 'rectangle', x: 0, y: 0, w: 5, h: 10, operation: 'subtract' },
      ],
    }),
    false,
  );
  assert.equal(isExplicitEmptySelection({ ...emptySelection(10, 10), mask: 'm' }), false);
});

test('a lasso entirely off the canvas reports outside, and the gesture becomes an empty selection', () => {
  const outside = boundSelectionPolygon(
    [{ x: -50, y: -50 }, { x: -10, y: -40 }, { x: -20, y: -5 }],
    100,
    80,
  );
  assert.deepEqual(outside, { ok: false, reason: 'outside' });
  // Replace and Intersect leave nothing selected; with no current selection every mode does.
  assert.equal(emptyGestureResult('replace', true), 'empty');
  assert.equal(emptyGestureResult('intersect', true), 'empty');
  for (const operation of ['replace', 'add', 'subtract', 'intersect'])
    assert.equal(emptyGestureResult(operation, false), 'empty', operation);
  // Adding or subtracting nothing keeps the current selection.
  assert.equal(emptyGestureResult('add', true), 'keep');
  assert.equal(emptyGestureResult('subtract', true), 'keep');
});

test('intersect and subtract that remove everything compose to an all-zero mask (empty, not "no selection")', () => {
  const current = new Uint8ClampedArray([0, 255, 255, 0]);
  const disjoint = new Uint8ClampedArray([255, 0, 0, 0]);
  const intersect = composeSelectionAlpha(current, disjoint, 'intersect');
  assert.ok(selectionCoverageIsEmpty(intersect.mask, false));
  const subtract = composeSelectionAlpha(current, new Uint8ClampedArray([0, 255, 255, 255]), 'subtract');
  assert.ok(selectionCoverageIsEmpty(subtract.mask, false));
  assert.equal(selectionCoverageIsEmpty(current, false), false);
});

test('selectionCoverageIsEmpty reads only alpha for RGBA data and treats any coverage as non-empty', () => {
  assert.ok(selectionCoverageIsEmpty(new Uint8ClampedArray([255, 255, 255, 0, 9, 9, 9, 0])));
  assert.equal(selectionCoverageIsEmpty(new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 1])), false);
  assert.ok(selectionCoverageIsEmpty(new Uint8ClampedArray(0)));
  assert.equal(EMPTY_SELECTION_NOTICE, 'No pixels are selected');
});

test('quick fill shortcuts: Alt/Option+Backspace = foreground, Ctrl/Cmd+Backspace = background', () => {
  const key = (overrides) => ({ key: 'Backspace', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...overrides });
  assert.equal(quickFillShortcut(key({ altKey: true })), 'foreground');
  assert.equal(quickFillShortcut(key({ altKey: true, key: 'Delete' })), 'foreground');
  assert.equal(quickFillShortcut(key({ ctrlKey: true })), 'background');
  assert.equal(quickFillShortcut(key({ metaKey: true })), 'background');
  // Plain Backspace clears; other combinations and keys are not fills.
  assert.equal(quickFillShortcut(key({})), null);
  assert.equal(quickFillShortcut(key({ altKey: true, ctrlKey: true })), null);
  assert.equal(quickFillShortcut(key({ altKey: true, shiftKey: true })), null);
  assert.equal(quickFillShortcut(key({ key: 'b', altKey: true })), null);
});

test('options-bar feather matches Select > Feather at 1000 px', () => {
  assert.equal(MARQUEE_FEATHER_MAX, MAX_SELECTION_FEATHER);
  assert.equal(MARQUEE_FEATHER_MAX, 1000);
  assert.equal(normalizeMarqueeOptions({ feather: 640 }).feather, 640);
  assert.equal(normalizeMarqueeOptions({ feather: 5000 }).feather, 1000);
  assert.equal(normalizeMarqueeOptions({ feather: -3 }).feather, 0);
});
