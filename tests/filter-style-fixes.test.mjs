import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFilterEffectsPixels,
  effectiveFilterEffects,
  retypeFilterEffects,
  validFilterEffects,
} from '../src/filterEffects.ts';
import { SMART_FILTER_MAX, planFilterChoice, validSmartFilters } from '../src/smartFilters.ts';
import {
  applyLayerStylesPixels,
  innerShadowBand,
  neutralLayerStyles,
  squaredDistanceToOutside,
} from '../src/layerStyles.ts';
import { layerStylesFollowMask } from '../src/document.ts';
import {
  DEFAULT_LIGHT_RAYS_SETTINGS,
  lightRaysGeometry,
  lightRaysPixelExtent,
  normalizeLightRaysSettings,
  renderLightRays,
  validLightRaysSettings,
} from '../src/lightRays.ts';
import { pooledTileWorkingBytes } from '../src/tiledDocument.ts';
import { DEFAULT_TILE_BATCH_BYTES, TILE_MAX_BATCH_BYTES } from '../src/tilePlan.ts';

const cloudsEffect = () =>
  effectiveFilterEffects({
    type: 'clouds',
    amount: 85,
    radius: 16,
    seed: 4,
    cloudRender: { foreground: '#101820', background: '#f0e0c0', scale: 64, fill: true },
  });

// ---------------------------------------------------------------------------
// 1. A second Filter-menu effect on a layer with a live effect

test('retyping a live Clouds effect drops its type-bound settings so the record validates', () => {
  const clouds = cloudsEffect();
  assert.equal(validFilterEffects(clouds), true);
  // The old menu handler spread the previous record and only changed `type`,
  // producing `{ type: 'motion-blur', cloudRender }`, which failed validation
  // ("Invalid layer document").
  assert.equal(validFilterEffects({ ...clouds, type: 'motion-blur' }), false);
  const blur = retypeFilterEffects(clouds, { type: 'motion-blur', amount: 70, radius: 24, angle: 0 });
  assert.equal(validFilterEffects(blur), true);
  assert.equal(blur.type, 'motion-blur');
  assert.equal(blur.radius, 24);
  assert.equal('cloudRender' in blur, false);

  const rays = retypeFilterEffects(blur, { type: 'light-rays', lightRays: { ...DEFAULT_LIGHT_RAYS_SETTINGS } });
  assert.equal(validFilterEffects(rays), true);
  const gaussian = retypeFilterEffects(rays, { type: 'gaussian-blur', radius: 3 });
  assert.equal(validFilterEffects(gaussian), true);
  assert.equal('lightRays' in gaussian, false);
  // Choosing Clouds again keeps a fresh valid cloud record.
  const again = retypeFilterEffects(gaussian, { type: 'clouds', cloudRender: clouds.cloudRender });
  assert.deepEqual(again.cloudRender, clouds.cloudRender);
  assert.equal(validFilterEffects(again), true);
});

test('choosing a different filter moves the live effect into the filter stack', () => {
  const live = cloudsEffect();
  const plan = planFilterChoice({ live, stack: [], type: 'motion-blur', stackable: true });
  assert.equal(plan.kind, 'stack');
  assert.equal(plan.stack.length, 1);
  assert.deepEqual(plan.stack[0], live);
  assert.equal(validSmartFilters(plan.stack), true);
  assert.equal(plan.moved.type, 'clouds');

  // Existing stack entries keep their order and hidden state.
  const hidden = { ...effectiveFilterEffects({ type: 'add-noise', amount: 20 }), enabled: false };
  const appended = planFilterChoice({ live, stack: [hidden], type: 'gaussian-blur', stackable: true });
  assert.equal(appended.kind, 'stack');
  assert.equal(appended.stack.length, 2);
  assert.equal(appended.stack[0].enabled, false);
  assert.equal(appended.stack[1].type, 'clouds');
});

test('filter choice replaces the live effect when there is nothing to keep or no room', () => {
  const live = cloudsEffect();
  assert.deepEqual(planFilterChoice({ live: undefined, stack: [], type: 'motion-blur', stackable: true }), {
    kind: 'replace',
    reason: 'empty',
  });
  assert.equal(
    planFilterChoice({ live: { ...live, amount: 0 }, stack: [], type: 'motion-blur', stackable: true }).reason,
    'empty',
    'a neutral live effect is not stacked',
  );
  assert.equal(planFilterChoice({ live, stack: [], type: 'none', stackable: true }).reason, 'empty');
  assert.equal(planFilterChoice({ live, stack: [], type: 'clouds', stackable: true }).reason, 'same-type');
  assert.equal(
    planFilterChoice({ live, stack: [], type: 'motion-blur', stackable: true, switchInPlace: true }).reason,
    'switch',
    'the Filter effect list changes the live type in place',
  );
  assert.equal(planFilterChoice({ live, stack: [], type: 'motion-blur', stackable: false }).reason, 'unsupported');
  const full = Array.from({ length: SMART_FILTER_MAX }, () => effectiveFilterEffects({ type: 'add-noise', amount: 5 }));
  const plan = planFilterChoice({ live, stack: full, type: 'motion-blur', stackable: true });
  assert.equal(plan.kind, 'replace');
  assert.equal(plan.reason, 'stack-full');
  assert.equal(plan.replaced.type, 'clouds');
});

// ---------------------------------------------------------------------------
// 2. Styles follow the layer mask

test('raster styles render after the mask only when an enabled mask asset exists', () => {
  const assets = { mask: { w: 1, h: 1, url: 'data:image/png;base64,AA==' } };
  assert.equal(layerStylesFollowMask({ kind: 'raster', mask: 'mask' }, assets), true);
  assert.equal(layerStylesFollowMask({ kind: 'smart-object', mask: 'mask', maskEnabled: true }, assets), true);
  assert.equal(layerStylesFollowMask({ kind: 'raster', mask: 'mask', maskEnabled: false }, assets), false);
  assert.equal(layerStylesFollowMask({ kind: 'raster', mask: 'missing' }, assets), false);
  assert.equal(layerStylesFollowMask({ kind: 'raster' }, assets), false);
  assert.equal(layerStylesFollowMask({ kind: 'text', mask: 'mask' }, assets), false);
  // An inverted mask still masks, so styles still follow it.
  assert.equal(layerStylesFollowMask({ kind: 'raster', mask: 'mask', maskInverted: true }, assets), true);
});

test('styles computed from masked alpha glow and shade around the masked shape', () => {
  // A full-layer texture masked to a disc: the style input is alpha x mask.
  const size = 81;
  const masked = new Uint8ClampedArray(size * size * 4);
  const unmasked = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const value = 60 + ((x * 7 + y * 13) % 120);
      unmasked.set([value, value, value, 255], offset);
      if (Math.hypot(x - 40, y - 40) <= 25) masked.set([value, value, value, 255], offset);
    }
  const styles = {
    outerGlow: { ...neutralLayerStyles.outerGlow, enabled: true, color: '#ff0000', opacity: 1, size: 10, spread: 0, blend: 'source-over' },
    innerShadow: { ...neutralLayerStyles.innerShadow, enabled: true, color: '#0000ff', opacity: 1, offsetX: 6, offsetY: 6, blur: 0, distance: 1 },
  };
  const fromMask = applyLayerStylesPixels(masked, size, size, styles);
  const fromLayer = applyLayerStylesPixels(unmasked, size, size, styles);
  assert.ok(fromMask[(40 * size + 68) * 4 + 3] > 0, 'outer glow around the masked disc');
  // Inside the disc, upper-left edge: the directional inner shadow.
  const inside = (36 * size + 18) * 4;
  assert.ok(fromMask[inside + 2] > fromMask[inside], 'inner shadow along the masked edge');
  assert.ok(fromLayer[inside + 2] <= fromLayer[inside], 'the unmasked layer has no edge there');
});

// ---------------------------------------------------------------------------
// 4. Inner Shadow: directional offset and Euclidean choke

const disc = (size, radius, centre = (size - 1) / 2) => {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1)
      if (Math.hypot(x - centre, y - centre) <= radius) data.set([255, 255, 255, 255], (y * size + x) * 4);
  return data;
};
const shadowAt = (data, size, x, y) => 255 - data[(y * size + x) * 4];

test('Inner Shadow offset is directional, like Drop Shadow', () => {
  const size = 161, source = disc(size, 60);
  const shadow = { ...neutralLayerStyles.innerShadow, enabled: true, color: '#000000', opacity: 1, blur: 0, distance: 1 };
  const down = applyLayerStylesPixels(source, size, size, { innerShadow: { ...shadow, offsetX: 0, offsetY: 15 } });
  // Light from above: the shadow hangs from the top inner edge only.
  assert.equal(shadowAt(down, size, 80, 25), 255, 'top inner edge is shadowed');
  assert.ok(shadowAt(down, size, 80, 35) > 0, 'shadow reaches the offset depth');
  assert.equal(shadowAt(down, size, 80, 136), 0, 'bottom inner edge stays clear');
  assert.equal(shadowAt(down, size, 80, 80), 0, 'centre stays clear');
  // Reversing the offset mirrors the shadow.
  const up = applyLayerStylesPixels(source, size, size, { innerShadow: { ...shadow, offsetX: 0, offsetY: -15 } });
  assert.equal(shadowAt(up, size, 80, 136), 255);
  assert.equal(shadowAt(up, size, 80, 25), 0);
  // X offsets work the same way.
  const right = applyLayerStylesPixels(source, size, size, { innerShadow: { ...shadow, offsetX: 15, offsetY: 0 } });
  assert.equal(shadowAt(right, size, 25, 80), 255);
  assert.equal(shadowAt(right, size, 136, 80), 0);
  // Never paints outside the source alpha.
  assert.equal(down[(2 * size + 2) * 4 + 3], 0);
});

test('Inner Shadow choke at distance 60 / blur 0 leaves a round clear centre, not a diamond', () => {
  const size = 241, centre = 120, radius = 100, source = disc(size, radius, centre);
  const output = applyLayerStylesPixels(source, size, size, {
    innerShadow: { ...neutralLayerStyles.innerShadow, enabled: true, color: '#000000', opacity: 1, offsetX: 0, offsetY: 0, blur: 0, distance: 60 },
  });
  // The clear centre is a disc of radius ~40 in every direction.
  for (let step = 0; step < 16; step += 1) {
    const angle = (step / 16) * Math.PI * 2;
    const at = (r) => shadowAt(output, size, Math.round(centre + Math.cos(angle) * r), Math.round(centre + Math.sin(angle) * r));
    assert.equal(at(34), 0, `clear at r=34, angle ${step}/16`);
    assert.equal(at(46), 255, `shadowed at r=46, angle ${step}/16`);
  }
  // With blur the falloff is smooth and still round.
  const soft = applyLayerStylesPixels(source, size, size, {
    innerShadow: { ...neutralLayerStyles.innerShadow, enabled: true, color: '#000000', opacity: 1, offsetX: 0, offsetY: 0, blur: 12, distance: 60 },
  });
  const axis = shadowAt(soft, size, centre + 40, centre);
  const diagonal = shadowAt(soft, size, Math.round(centre + 40 / Math.SQRT2), Math.round(centre + 40 / Math.SQRT2));
  assert.ok(axis > 40 && axis < 215, `soft edge ${axis}`);
  assert.ok(Math.abs(axis - diagonal) <= 24, `axis ${axis} vs diagonal ${diagonal}`);
});

test('squared distance transform matches brute force and honours the cap', () => {
  const width = 23, height = 17, outside = new Uint8Array(width * height);
  let state = 7;
  for (let i = 0; i < outside.length; i += 1) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    outside[i] = state % 11 === 0 ? 1 : 0;
  }
  const field = squaredDistanceToOutside(outside, width, height, 50);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      let best = Infinity;
      for (let oy = 0; oy < height; oy += 1)
        for (let ox = 0; ox < width; ox += 1)
          if (outside[oy * width + ox]) best = Math.min(best, (ox - x) ** 2 + (oy - y) ** 2);
      assert.equal(field[y * width + x], Math.min(best, 50), `${x},${y}`);
    }
  // No outside sample at all: everything reads as the cap.
  assert.ok(squaredDistanceToOutside(new Uint8Array(12), 4, 3, 9).every((value) => value === 9));
});

test('the inner-shadow band treats pixels beyond the layer as outside', () => {
  const width = 10, height = 6, alpha = new Uint8ClampedArray(width * height).fill(255);
  const band = innerShadowBand(alpha, width, height, { minX: 0, minY: 0, maxX: 9, maxY: 5 }, {
    distance: 2, blur: 0, offsetX: 0, offsetY: 0,
  });
  const at = (x, y) => band.mask[(y - band.y) * band.width + (x - band.x)];
  assert.equal(at(0, 3), 255, 'layer edge pixels are in the choke band');
  assert.equal(at(1, 3), 255);
  assert.equal(at(4, 3), 0, 'beyond the band');
  assert.equal(at(-1, 3), 255, 'outside the layer');
});

// ---------------------------------------------------------------------------
// 5. Performance: Motion Blur interior taps and pooled tile budgets

test('Motion Blur renders tiles identically to the whole image at tie angles', () => {
  const width = 90, height = 70, source = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < source.length; i += 1) source[i] = (Math.imul(i + 3, 2654435761) >>> 24) & 255;
  for (const angle of [30, 60, -150]) {
    const effect = { type: 'motion-blur', amount: 100, radius: 9, angle };
    const whole = applyFilterEffectsPixels(source, width, height, effect);
    // Render a crop with a 9 px halo; its inner area must match the whole image.
    const x0 = 20, y0 = 15, cropWidth = 50, cropHeight = 40;
    const crop = new Uint8ClampedArray(cropWidth * cropHeight * 4);
    for (let y = 0; y < cropHeight; y += 1)
      crop.set(source.subarray(((y0 + y) * width + x0) * 4, ((y0 + y) * width + x0 + cropWidth) * 4), y * cropWidth * 4);
    const tile = applyFilterEffectsPixels(crop, cropWidth, cropHeight, effect);
    for (let y = 9; y < cropHeight - 9; y += 1)
      for (let x = 9; x < cropWidth - 9; x += 1)
        for (let channel = 0; channel < 4; channel += 1)
          assert.equal(
            tile[(y * cropWidth + x) * 4 + channel],
            whole[((y0 + y) * width + x0 + x) * 4 + channel],
            `angle ${angle} at ${x0 + x},${y0 + y}`,
          );
  }
});

test('performance smoke: 1000x1000 Motion Blur radius 40 at a tie angle stays on the fast path', () => {
  const source = new Uint8ClampedArray(1000 * 1000 * 4);
  for (let i = 0; i < source.length; i += 1) source[i] = (i * 37) & 255;
  const started = performance.now();
  applyFilterEffectsPixels(source, 1000, 1000, { type: 'motion-blur', amount: 70, radius: 40, angle: 30 });
  const elapsed = performance.now() - started;
  // About 0.6 s on a dev machine (2.1 s before the shared-offset fast path);
  // the bound tolerates slow CI hardware.
  assert.ok(elapsed < 15_000, `took ${Math.round(elapsed)} ms`);
});

test('pooled tiled effects get enough working bytes to keep the pool busy', () => {
  assert.equal(pooledTileWorkingBytes(1), DEFAULT_TILE_BATCH_BYTES);
  assert.equal(pooledTileWorkingBytes(2), DEFAULT_TILE_BATCH_BYTES, 'phones keep the default budget');
  assert.equal(pooledTileWorkingBytes(4), DEFAULT_TILE_BATCH_BYTES);
  assert.equal(pooledTileWorkingBytes(8), DEFAULT_TILE_BATCH_BYTES * 2);
  assert.equal(pooledTileWorkingBytes(64), TILE_MAX_BATCH_BYTES, 'never above the hard ceiling');
  assert.equal(pooledTileWorkingBytes(Number.NaN), DEFAULT_TILE_BATCH_BYTES);
  // A 512 px tile with a 40 px halo needs ~3.9 MB; eight fit in the budget.
  const tileBytes = 592 * 592 * 8 + 512 * 512 * 4;
  assert.ok(Math.floor(pooledTileWorkingBytes(8) / tileBytes) >= 8);
});

// ---------------------------------------------------------------------------
// 6. Light Rays pixel units

test('Light Rays percentages map to explicit pixel radii on the layer', () => {
  const settings = normalizeLightRaysSettings({ ...DEFAULT_LIGHT_RAYS_SETTINGS, length: 40, innerRadius: 54 });
  const extent = lightRaysPixelExtent(settings, 2646, 4096);
  assert.equal(extent.base, 1323, 'half the shorter side');
  assert.ok(Math.abs(extent.length - 529.2) < 1e-9);
  assert.ok(Math.abs(extent.innerRadius - 714.42) < 1e-9);
  assert.ok(Math.abs(extent.outerRadius - (714.42 + 529.2)) < 1e-9);
  // With the default falloff a ray fades before its nominal tip; the UI says so.
  assert.ok(extent.visibleRadius > extent.innerRadius && extent.visibleRadius < extent.outerRadius);
  // Geometry uses exactly these values, so the readout and the render agree.
  const geometry = lightRaysGeometry(settings, 2646, 4096, 0.5, 0.5, 7);
  assert.equal(geometry.innerRadius, extent.innerRadius);
  assert.equal(geometry.length, extent.length);
  // Saved documents keep their percentage fields unchanged.
  assert.equal(validLightRaysSettings(settings), true);
  assert.equal(settings.length, 40);
  assert.equal(settings.innerRadius, 54);
  // Low falloff shows the full length.
  const flat = lightRaysPixelExtent({ ...settings, falloff: 0 }, 2646, 4096);
  assert.ok(flat.outerRadius - flat.visibleRadius < 1);
});

test('Light Rays run from the inner radius to inner radius + length', () => {
  const width = 241, height = 241;
  const source = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < source.length; i += 4) source.set([10, 10, 10, 255], i);
  // base = 120 px; inner 50% = 60 px; length 40% = 48 px; no randomness or fade.
  const settings = { ...DEFAULT_LIGHT_RAYS_SETTINGS, count: 360, width: 4, randomness: 0, falloff: 0, length: 40, innerRadius: 50 };
  const output = source.slice();
  renderLightRays(source, output, width, height, { settings, centerX: 0.5, centerY: 0.5, seed: 3, strength: 1 });
  const lit = (radius) => {
    let brightest = 0;
    for (let step = 0; step < 32; step += 1) {
      const angle = (step / 32) * Math.PI * 2;
      const x = Math.round(120 + Math.cos(angle) * radius), y = Math.round(120 + Math.sin(angle) * radius);
      brightest = Math.max(brightest, output[(y * width + x) * 4] - 10);
    }
    return brightest;
  };
  assert.equal(lit(30), 0, 'nothing inside the inner radius');
  assert.equal(lit(55), 0, 'still inside the inner radius');
  assert.ok(lit(70) > 40, 'lit just beyond the inner radius');
  assert.ok(lit(100) > 10, 'lit near the tip');
  assert.equal(lit(112), 0, 'dark beyond inner + length');
});
test('enabling a style does not make semi-transparent pixels more opaque', () => {
  // An 85% Clouds layer is semi-transparent everywhere; the source used to be
  // composited over a copy of itself, raising alpha 217 to 251.
  const width = 30, height = 30, source = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < source.length; i += 4) source.set([200, 120, 90, 217], i);
  const styled = applyLayerStylesPixels(source, width, height, {
    innerShadow: { ...neutralLayerStyles.innerShadow, enabled: true, opacity: 1, offsetX: 0, offsetY: 3, blur: 0, distance: 1 },
  });
  // Away from the shadow the pixel is untouched.
  assert.deepEqual(Array.from(styled.slice((20 * width + 15) * 4, (20 * width + 15) * 4 + 4)), [200, 120, 90, 217]);
  // Coverage is relative to the most opaque pixel: the uniform 85% interior
  // is not tinted, while the top edge (offset 3 px down) is shaded.
  const top = Array.from(styled.slice((1 * width + 15) * 4, (1 * width + 15) * 4 + 4));
  assert.ok(top[0] < 150, `top edge shaded ${top.join(",")}`);
  // An outline-only style (an outer effect) also leaves interior pixels alone.
  const outlined = applyLayerStylesPixels(source, width, height, {
    outline: { ...neutralLayerStyles.outline, enabled: true, width: 2 },
  });
  assert.deepEqual(Array.from(outlined.slice((15 * width + 15) * 4, (15 * width + 15) * 4 + 4)), [200, 120, 90, 217]);
});
