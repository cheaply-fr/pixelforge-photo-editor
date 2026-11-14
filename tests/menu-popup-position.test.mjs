import test from 'node:test';
import assert from 'node:assert/strict';
import { menuPopupPlacement } from '../src/menuPopupPosition.ts';

test('desktop menus sit 8 px under their trigger at 220 px wide', () => {
  const placed = menuPopupPlacement({ left: 300, right: 350, bottom: 46 }, { width: 1280, height: 720 }, { alignRight: false, gap: 8, phone: false });
  assert.deepEqual(placed, { top: 54, left: 300, width: 220, maxHeight: 540 });
  // The last menus open towards the left from their trigger's right edge.
  const right = menuPopupPlacement({ left: 600, right: 650, bottom: 46 }, { width: 1280, height: 720 }, { alignRight: true, gap: 8, phone: false });
  assert.equal(right.left, 430);
});

test('phone menus stay inside the viewport and scroll within the room below', () => {
  const viewport = { width: 412, height: 839 };
  const first = menuPopupPlacement({ left: 10, right: 66, bottom: 118 }, viewport, { alignRight: false, gap: 4, phone: true });
  assert.equal(first.top, 122);
  assert.equal(first.left, 10);
  assert.equal(first.width, 220);
  assert.ok(first.top + first.maxHeight <= viewport.height - 8);
  // A right-aligned menu near the left edge is clamped to the 8 px margin.
  const clamped = menuPopupPlacement({ left: 170, right: 226, bottom: 118 }, viewport, { alignRight: true, gap: 4, phone: true });
  assert.equal(clamped.left, 8);
  // A narrow phone gets 88% of the width, never past either edge.
  const narrow = menuPopupPlacement({ left: 300, right: 340, bottom: 118 }, { width: 240, height: 500 }, { alignRight: false, gap: 4, phone: true });
  assert.ok(narrow.left >= 8 && narrow.left + narrow.width <= 232);
  // A trigger near the bottom still leaves a usable scrolling popup.
  assert.equal(menuPopupPlacement({ left: 0, right: 40, bottom: 760 }, { width: 412, height: 800 }, { alignRight: false, gap: 4, phone: true }).maxHeight, 120);
});
