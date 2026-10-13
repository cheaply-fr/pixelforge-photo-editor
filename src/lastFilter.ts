export function normalizeLastFilterType(
  value: unknown,
  allowed: readonly string[],
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized !== 'none' && allowed.includes(normalized) ? normalized : undefined;
}
