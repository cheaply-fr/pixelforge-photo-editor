/**
 * Deterministic alpha-mask composition for precision selections.
 *
 * Selection tools produce canvas-sized alpha masks. Keeping the blend in a
 * small, DOM-free primitive makes geometric, Color Range and Magic Wand
 * selections share the same Replace/Add/Subtract/Intersect semantics and
 * keeps their round-trip behavior testable without a browser canvas.
 */

export type SelectionMaskOperation =
  | 'replace'
  | 'add'
  | 'subtract'
  | 'intersect';

const OPERATIONS = new Set<SelectionMaskOperation>([
  'replace',
  'add',
  'subtract',
  'intersect',
]);
const MAX_MASK_PIXELS = 16_000_000;

function normalizeMask(mask: ArrayLike<number>, label: string): Uint8ClampedArray {
  if (!mask || typeof mask.length !== 'number' || !Number.isSafeInteger(mask.length))
    throw new Error(`${label} mask length is invalid.`);
  if (mask.length > MAX_MASK_PIXELS)
    throw new Error(`${label} mask exceeds the pixel limit.`);
  const output = new Uint8ClampedArray(mask.length);
  for (let index = 0; index < mask.length; index += 1) {
    const value = mask[index];
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw new Error(`${label} mask contains an invalid alpha value.`);
    output[index] = Math.max(0, Math.min(255, Math.round(value)));
  }
  return output;
}

/**
 * Compose a new selection alpha mask with the current mask.
 *
 * `replace` intentionally ignores `current`; when there is no current mask,
 * the remaining operations also resolve to the incoming mask, matching the
 * editor's behavior for the first selection gesture. Add uses a max union,
 * subtract removes the incoming coverage proportionally, and intersect keeps
 * the minimum alpha. Inputs are copied and never mutated.
 */
export function composeSelectionAlpha(
  current: ArrayLike<number> | undefined,
  incoming: ArrayLike<number>,
  operation: SelectionMaskOperation,
): { mask: Uint8ClampedArray; changed: boolean } {
  if (!OPERATIONS.has(operation)) throw new Error('Selection mask operation is invalid.');
  const next = normalizeMask(incoming, 'Incoming');
  if (!current) return { mask: next, changed: next.some((value) => value !== 0) };
  const previous = normalizeMask(current, 'Current');
  if (previous.length !== next.length)
    throw new Error('Selection masks have different sizes.');
  if (operation === 'replace') {
    let changed = false;
    for (let index = 0; index < next.length; index += 1)
      if (next[index] !== previous[index]) {
        changed = true;
        break;
      }
    return { mask: next, changed };
  }
  const output = new Uint8ClampedArray(next.length);
  let changed = false;
  for (let index = 0; index < output.length; index += 1) {
    const left = previous[index], right = next[index];
    output[index] =
      operation === 'add'
        ? Math.max(left, right)
        : operation === 'subtract'
          ? Math.round(left * (1 - right / 255))
          : Math.min(left, right);
    if (output[index] !== left) changed = true;
  }
  return { mask: output, changed };
}

/**
 * The stored form of a composed (Add/Subtract/Intersect) selection. Both
 * sides are resolved to alpha before composing, so feather, inversion and
 * transform are already in the composed mask; keeping them on the result
 * applied them again on every render, so each Add softened earlier edges
 * once more. The caller then sets `mask` to the composed alpha asset.
 */
export function composedSelection<
  T extends { feather: number; inverted: boolean; matrix?: unknown; mask?: string },
>(next: T): T {
  const result = { ...next, mask: undefined, feather: 0, inverted: false };
  delete result.matrix;
  return result;
}
