let counter = 0;

/**
 * Monotonic id generator for client-only list rows (rooms, tables, menu
 * items, etc). Date.now() collides when multiple rows are generated in the
 * same tick (e.g. auto-generating N tables for a room at once), which
 * corrupts row-scoped updates since every row generated in that tick shares
 * one id.
 */
export function nextId(prefix = 'row'): string {
  counter += 1;
  return `${prefix}_${counter}`;
}
