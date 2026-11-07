import { effectiveFilterEffects, validFilterEffects, type FilterEffects } from './filterEffects.ts';

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

export function removeSmartFilter(
  stack: readonly SmartFilterEntry[] | undefined,
  index: number,
): SmartFilterEntry[] {
  const current = normalizeSmartFilterStack(stack);
  checkedIndex(current, index);
  return current.filter((_, position) => position !== index);
}
