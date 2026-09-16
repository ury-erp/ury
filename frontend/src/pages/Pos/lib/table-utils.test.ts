import { describe, expect, it } from 'vitest';
import {
  formatMergedTableLabel,
  formatMergedTableLabelFromGroup,
  getMergeGroupMembers,
  getTableRenderGroups,
  isMergedTable,
  parseMergedWith,
  sortTablesByMergeGroups,
} from './table-utils';
import type { Table } from './table-api';

const buildTable = (overrides: Partial<Table> = {}): Table => ({
  name: 'T-1',
  occupied: 0,
  latest_invoice_time: null,
  is_take_away: 0,
  restaurant_room: 'Main Hall',
  table_shape: 'Circle',
  merged_with: null,
  ...overrides,
});

describe('parseMergedWith', () => {
  it('returns [] for null/undefined/empty input', () => {
    expect(parseMergedWith(null)).toEqual([]);
    expect(parseMergedWith(undefined)).toEqual([]);
    expect(parseMergedWith('')).toEqual([]);
  });

  it('splits a comma-separated list and trims whitespace', () => {
    expect(parseMergedWith('T-2, T-3 ,T-4')).toEqual(['T-2', 'T-3', 'T-4']);
  });

  it('filters out empty segments from trailing/double commas', () => {
    expect(parseMergedWith('T-2,,T-3,')).toEqual(['T-2', 'T-3']);
  });
});

describe('isMergedTable', () => {
  it('is false when merged_with is empty/null', () => {
    expect(isMergedTable(buildTable({ merged_with: null }))).toBe(false);
    expect(isMergedTable(buildTable({ merged_with: '' }))).toBe(false);
  });

  it('is true when merged_with names at least one partner', () => {
    expect(isMergedTable(buildTable({ merged_with: 'T-2' }))).toBe(true);
  });
});

describe('getMergeGroupMembers', () => {
  it('returns just the table itself when it has no merge partners', () => {
    const t1 = buildTable({ name: 'T-1' });
    expect(getMergeGroupMembers(t1, [t1])).toEqual(['T-1']);
  });

  it('returns all directly merged partners, sorted', () => {
    const t1 = buildTable({ name: 'T-1', merged_with: 'T-2' });
    const t2 = buildTable({ name: 'T-2', merged_with: 'T-1' });
    expect(getMergeGroupMembers(t1, [t1, t2])).toEqual(['T-1', 'T-2']);
  });

  it('transitively follows the merge chain (A-B-C all in one group)', () => {
    const t1 = buildTable({ name: 'T-1', merged_with: 'T-2' });
    const t2 = buildTable({ name: 'T-2', merged_with: 'T-1,T-3' });
    const t3 = buildTable({ name: 'T-3', merged_with: 'T-2' });
    expect(getMergeGroupMembers(t1, [t1, t2, t3])).toEqual(['T-1', 'T-2', 'T-3']);
    // Symmetric: starting from any member of the group gives the same set.
    expect(getMergeGroupMembers(t3, [t1, t2, t3])).toEqual(['T-1', 'T-2', 'T-3']);
  });

  it('ignores a merge_with reference to a table not present in allTables', () => {
    const t1 = buildTable({ name: 'T-1', merged_with: 'T-GHOST' });
    expect(getMergeGroupMembers(t1, [t1])).toEqual(['T-1']);
  });
});

describe('formatMergedTableLabel', () => {
  it('returns an empty string when primary is falsy', () => {
    expect(formatMergedTableLabel(null)).toBe('');
    expect(formatMergedTableLabel(undefined)).toBe('');
  });

  it('returns just the primary name when there are no merged partners', () => {
    expect(formatMergedTableLabel('T-1', null)).toBe('T-1');
    expect(formatMergedTableLabel('T-1')).toBe('T-1');
  });

  it('joins primary + sorted partners with " + "', () => {
    expect(formatMergedTableLabel('T-1', 'T-3,T-2')).toBe('T-1 + T-2 + T-3');
  });
});

describe('formatMergedTableLabelFromGroup', () => {
  it('returns an empty string for an empty group', () => {
    expect(formatMergedTableLabelFromGroup([])).toBe('');
  });

  it('sorts and joins all members with " + ", regardless of input order', () => {
    expect(formatMergedTableLabelFromGroup(['T-3', 'T-1', 'T-2'])).toBe('T-1 + T-2 + T-3');
  });
});

describe('getTableRenderGroups', () => {
  it('returns an empty array for an empty table list', () => {
    expect(getTableRenderGroups([])).toEqual([]);
  });

  it('puts each unmerged table in its own singleton group', () => {
    const t1 = buildTable({ name: 'T-1' });
    const t2 = buildTable({ name: 'T-2' });
    const groups = getTableRenderGroups([t1, t2]);
    expect(groups).toEqual([[t1], [t2]]);
  });

  it('groups merged tables together as one cluster, sorted by name', () => {
    const t2 = buildTable({ name: 'T-2', merged_with: 'T-1' });
    const t1 = buildTable({ name: 'T-1', merged_with: 'T-2' });
    const t3 = buildTable({ name: 'T-3' });
    const groups = getTableRenderGroups([t2, t1, t3]);

    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.length === 2)!.map((t) => t.name)).toEqual(['T-1', 'T-2']);
    expect(groups.find((g) => g.length === 1)!.map((t) => t.name)).toEqual(['T-3']);
  });

  it('orders clusters by their first (sorted) member name', () => {
    const tA = buildTable({ name: 'A-Table' });
    const tZ = buildTable({ name: 'Z-Table' });
    const groups = getTableRenderGroups([tZ, tA]);
    expect(groups.map((g) => g[0].name)).toEqual(['A-Table', 'Z-Table']);
  });
});

describe('sortTablesByMergeGroups', () => {
  it('flattens render groups back into a single ordered list', () => {
    const t2 = buildTable({ name: 'T-2', merged_with: 'T-1' });
    const t1 = buildTable({ name: 'T-1', merged_with: 'T-2' });
    const t3 = buildTable({ name: 'T-3' });

    const sorted = sortTablesByMergeGroups([t3, t2, t1]);

    expect(sorted.map((t) => t.name)).toEqual(['T-1', 'T-2', 'T-3']);
  });
});
