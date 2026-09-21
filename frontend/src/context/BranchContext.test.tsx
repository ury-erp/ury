import { describe, expect, it } from 'vitest';
import { resolveActiveBranchId, type Branch } from './BranchContext';

const branches = (ids: string[]): Branch[] =>
  ids.map((id) => ({ id, name: id }));

describe('resolveActiveBranchId', () => {
  it('keeps a stored branch that still exists', () => {
    expect(resolveActiveBranchId(branches(['A', 'B']), 'B')).toBe('B');
  });

  it('selects the first branch when nothing is stored', () => {
    expect(resolveActiveBranchId(branches(['Demo Branch']), '')).toBe('Demo Branch');
    expect(resolveActiveBranchId(branches(['A', 'B']), null)).toBe('A');
  });

  it('selects the only branch instead of All Branches', () => {
    expect(resolveActiveBranchId(branches(['Demo Branch']), 'all')).toBe('Demo Branch');
  });

  it('keeps All Branches when multiple branches exist', () => {
    expect(resolveActiveBranchId(branches(['A', 'B']), 'all')).toBe('all');
  });

  it('falls back to the first branch when the stored id is stale', () => {
    expect(resolveActiveBranchId(branches(['Demo Branch']), 'URY')).toBe('Demo Branch');
  });

  it('returns all when there are no branches', () => {
    expect(resolveActiveBranchId([], 'all')).toBe('all');
    expect(resolveActiveBranchId([], 'x')).toBe('all');
  });
});
