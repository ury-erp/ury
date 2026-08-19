/**
 * Derives a short, uppercase prefix from a name — same initials-of-each-word
 * logic used for Company Abbreviation on Step 1, extracted here so Room ->
 * Table short-code generation doesn't duplicate it.
 *
 * Falls back to "T" for empty or non-Latin input (e.g. names in a script
 * with no distinct uppercase initials) rather than emitting an empty/blank
 * prefix, which would produce table names like "-01".
 */
export function shortCode(name: string, maxLen = 5): string {
  const cleaned = (name || '').trim();
  if (!cleaned) return 'T';

  const initials = cleaned
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  const code = initials.slice(0, maxLen);
  return code || 'T';
}

/**
 * Same as shortCode, but disambiguates against a set of already-used
 * prefixes (e.g. other rooms in the same session) by appending a numeral
 * instead of silently colliding.
 */
export function uniqueShortCode(name: string, taken: Set<string>, maxLen = 5): string {
  const base = shortCode(name, maxLen);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}${n}`)) n += 1;
  return `${base}${n}`;
}

/**
 * Generates zero-padded auto table names for a room, e.g. prefix "EG",
 * count 3 -> ["EG-01", "EG-02", "EG-03"]. Padded to at least 2 digits
 * (matching the existing "T-01" seed convention) so lexical sort in list
 * views/reports doesn't put "EG-10" before "EG-2".
 */
export function generateTableNames(prefix: string, count: number, startIndex = 1): string[] {
  const highestIndex = startIndex + Math.max(count, 0) - 1;
  const width = Math.max(2, String(Math.max(highestIndex, 1)).length);
  const names: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const index = startIndex + i;
    names.push(`${prefix}-${String(index).padStart(width, '0')}`);
  }
  return names;
}

/** True if `tableName` matches the auto-generated pattern for `prefix` (e.g. "EG-03" for prefix "EG"). */
export function isAutoTableName(tableName: string, prefix: string): boolean {
  return new RegExp(`^${prefix}-\\d+$`).test(tableName);
}
