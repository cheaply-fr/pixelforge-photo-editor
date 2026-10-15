import { effectiveFilterEffects, validFilterEffects, type FilterEffects } from './filterEffects.ts';

export const SMART_FILTER_MAX = 8;

export function effectiveSmartFilters(value: unknown): FilterEffects[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, SMART_FILTER_MAX).map((entry) => effectiveFilterEffects(entry));
}

export function validSmartFilters(value: unknown): value is FilterEffects[] {
  return Array.isArray(value) && value.length <= SMART_FILTER_MAX && value.every(validFilterEffects);
}

export function appendSmartFilter(stack: readonly FilterEffects[] | undefined, effect: FilterEffects): FilterEffects[] {
  const current = effectiveSmartFilters(stack);
  if (current.length >= SMART_FILTER_MAX) throw new Error(`Smart Filter stack is limited to ${SMART_FILTER_MAX} effects`);
  if (!validFilterEffects(effect)) throw new Error('Smart Filter effect is invalid');
  return [...current, effectiveFilterEffects(effect)];
}
