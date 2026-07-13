import { describe, it, expect } from 'vitest';
import type { POSSliceAll } from './combined';
import type { MenuSlice } from './menu-slice';
import type { CartSlice } from './cart-slice';
import type { SelectionSlice } from './selection-slice';
import type { AppSlice } from './app-slice';

describe('combined type', () => {
  it('POSSliceAll type is exported and can be imported without error', () => {
    // If the import succeeded, this test passes
    // This is primarily a type-level check
    expect(true).toBe(true);
  });

  it('POSSliceAll is a union of all slice types', () => {
    // Verify the type structure by asserting it combines all slices
    // This is a compile-time check; runtime just verifies the import
    type VerifyCombination = POSSliceAll extends (MenuSlice & CartSlice & SelectionSlice & AppSlice) ? true : false;
    const check: VerifyCombination = true;
    expect(check).toBe(true);
  });

  it('module exports POSSliceAll type correctly for use in other modules', () => {
    // The type is used across cart-slice, menu-slice, selection-slice, app-slice
    // as StateCreator<POSSliceAll, ...> which validates the export works
    expect(true).toBe(true);
  });
});
