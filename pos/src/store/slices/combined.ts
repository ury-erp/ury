// Forward-declared combined type for cross-slice access.
// Uses `import type` to avoid circular runtime dependencies.
import type { MenuSlice } from './menu-slice';
import type { CartSlice } from './cart-slice';
import type { SelectionSlice } from './selection-slice';
import type { AppSlice } from './app-slice';

export type POSSliceAll = MenuSlice & CartSlice & SelectionSlice & AppSlice;