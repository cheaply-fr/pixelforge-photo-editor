import { effectiveFilterEffects, isNeutralFilterEffects, validFilterEffects, type FilterEffects } from './filterEffects.ts';

export const SMART_FILTER_MAX = 8;

/**
 * One stored filter-stack entry. `enabled: false` hides the entry without
 * losing its parameters; the field is omitted for enabled entries so stacks
 * written before toggling existed keep loading unchanged.
 */
export type SmartFilterEntry = FilterEffects & { enabled?: boolean };

/** Normalise a stored stack, keeping each entry's enabled flag. */
export function normalizeSmartFilterStack(value: unknown): SmartFilterEntry[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, SMART_FILTER_MAX).map((entry) => {
    const effect: SmartFilterEntry = effectiveFilterEffects(entry as Partial<FilterEffects>);
    if (entry && typeof entry === 'object' && (entry as SmartFilterEntry).enabled === false) effect.enabled = false;
    return effect;
  });
}

/** Entries for the stack UI, in render order (bottom first). */
export function smartFilterEntries(value: unknown): Array<{ effect: FilterEffects; enabled: boolean }> {
  return normalizeSmartFilterStack(value).map((entry) => {
    const { enabled, ...effect } = entry;
    return { effect: effect as FilterEffects, enabled: enabled !== false };
  });
}

/** The enabled effects, in render order. Disabled entries never render. */
export function effectiveSmartFilters(value: unknown): FilterEffects[] {
  return smartFilterEntries(value)
    .filter((entry) => entry.enabled)
    .map((entry) => entry.effect);
}

export function validSmartFilters(value: unknown): value is SmartFilterEntry[] {
  return (
    Array.isArray(value) &&
    value.length <= SMART_FILTER_MAX &&
    value.every(
      (entry) =>
        validFilterEffects(entry) &&
        ((entry as SmartFilterEntry).enabled === undefined || typeof (entry as SmartFilterEntry).enabled === 'boolean'),
    )
  );
}

export function appendSmartFilter(stack: readonly SmartFilterEntry[] | undefined, effect: FilterEffects): SmartFilterEntry[] {
  const current = normalizeSmartFilterStack(stack);
  if (current.length >= SMART_FILTER_MAX) throw new Error(`Smart Filter stack is limited to ${SMART_FILTER_MAX} effects`);
  if (!validFilterEffects(effect)) throw new Error('Smart Filter effect is invalid');
  const { enabled: _ignored, ...plain } = effect as SmartFilterEntry;
  return [...current, effectiveFilterEffects(plain)];
}

function checkedIndex(stack: readonly SmartFilterEntry[], index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= stack.length)
    throw new RangeError('Filter stack entry does not exist');
}

/** Show or hide one entry; hidden entries keep their parameters. */
export function setSmartFilterEnabled(
  stack: readonly SmartFilterEntry[] | undefined,
  index: number,
  enabled: boolean,
): SmartFilterEntry[] {
  const current = normalizeSmartFilterStack(stack);
  checkedIndex(current, index);
  return current.map((entry, position) => {
    if (position !== index) return entry;
    const { enabled: _previous, ...effect } = entry;
    return enabled ? (effect as SmartFilterEntry) : { ...effect, enabled: false };
  });
}

/** Move one entry up (+1, applied later) or down (-1, applied earlier). */
export function moveSmartFilter(
  stack: readonly SmartFilterEntry[] | undefined,
  index: number,
  offset: number,
): SmartFilterEntry[] {
  const current = normalizeSmartFilterStack(stack);
  checkedIndex(current, index);
  const target = index + Math.trunc(offset);
  if (target < 0 || target >= current.length || target === index) return current;
  const next = [...current];
  const [entry] = next.splice(index, 1);
  next.splice(target, 0, entry);
  return next;
}

/**
 * Replace one entry's parameters in place (the Filter effects controls edit a
 * stacked entry with this). The entry keeps its position and hidden state;
 * the effect is validated and normalised like an appended entry. Returns the
 * same normalised stack when nothing changed, so callers can skip a no-op
 * history step.
 */
export function replaceSmartFilter(
  stack: readonly SmartFilterEntry[] | undefined,
  index: number,
  effect: FilterEffects,
): SmartFilterEntry[] {
  const current = normalizeSmartFilterStack(stack);
  checkedIndex(current, index);
  const { enabled: _ignored, ...plain } = effect as SmartFilterEntry;
  if (!validFilterEffects(plain)) throw new Error('Smart Filter effect is invalid');
  if (plain.type === 'none') throw new Error('Remove the stacked filter instead of clearing it');
  const next: SmartFilterEntry = effectiveFilterEffects(plain);
  if (current[index].enabled === false) next.enabled = false;
  return current.map((entry, position) => (position === index ? next : entry));
}

/** Where a stacked entry being edited ends up after a move (or null after removal). */
export function trackedSmartFilterIndex(
  edited: number,
  change: { kind: 'move'; index: number; offset: number; length: number } | { kind: 'remove'; index: number },
): number | null {
  if (change.kind === 'remove')
    return change.index === edited ? null : change.index < edited ? edited - 1 : edited;
  const target = change.index + Math.trunc(change.offset);
  if (target < 0 || target >= change.length || target === change.index) return edited;
  if (edited === change.index) return target;
  if (change.index < edited && target >= edited) return edited - 1;
  if (change.index > edited && target <= edited) return edited + 1;
  return edited;
}

export function removeSmartFilter(
  stack: readonly SmartFilterEntry[] | undefined,
  index: number,
): SmartFilterEntry[] {
  const current = normalizeSmartFilterStack(stack);
  checkedIndex(current, index);
  return current.filter((_, position) => position !== index);
}

/**
 * What choosing a filter from the Filter menu does to a layer that already
 * has a live (editable) filter effect.
 *
 * - `stack`: the current live effect moves to the end of the filter stack
 *   (it keeps rendering, now before the live slot) and the chosen filter
 *   becomes the new live effect, so Clouds followed by Motion Blur blurs the
 *   clouds instead of discarding them.
 * - `replace`: the chosen filter replaces the live effect. Used when there is
 *   nothing worth keeping (no live effect, or the same filter chosen again),
 *   when the user is switching the live effect's type in place, when the
 *   layer cannot hold a filter stack, or when the stack is full.
 */
export type FilterChoicePlan =
  | { kind: 'stack'; stack: SmartFilterEntry[]; moved: FilterEffects }
  | { kind: 'replace'; reason: 'empty' | 'same-type' | 'switch' | 'unsupported' | 'stack-full'; replaced?: FilterEffects };

export function planFilterChoice(options: {
  /** The layer's current live filter effect (may be neutral). */
  live: Partial<FilterEffects> | undefined;
  /** The layer's current filter stack. */
  stack: readonly SmartFilterEntry[] | undefined;
  /** The filter being chosen. */
  type: FilterEffects['type'];
  /** False for layers that cannot carry a filter stack (text, shapes, adjustments). */
  stackable: boolean;
  /** True when the user is changing the live effect's type in place (the Filter effect list). */
  switchInPlace?: boolean;
}): FilterChoicePlan {
  const live = effectiveFilterEffects(options.live);
  if (options.type === 'none' || isNeutralFilterEffects(live)) return { kind: 'replace', reason: 'empty' };
  if (options.switchInPlace) return { kind: 'replace', reason: 'switch', replaced: live };
  if (live.type === options.type) return { kind: 'replace', reason: 'same-type', replaced: live };
  if (!options.stackable) return { kind: 'replace', reason: 'unsupported', replaced: live };
  const current = normalizeSmartFilterStack(options.stack);
  if (current.length >= SMART_FILTER_MAX) return { kind: 'replace', reason: 'stack-full', replaced: live };
  return { kind: 'stack', stack: appendSmartFilter(current, live), moved: live };
}
