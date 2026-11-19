import { call, db } from '@ury/core';

/**
 * Fetches all production unit names for the current user's branch.
 * Production units are used to subscribe to KOT error channels on the POS terminal.
 *
 * Returns an empty array if no production units are found or if branch cannot be resolved.
 */
export async function getProductionUnitsForBranch(): Promise<string[]> {
  try {
    const response = await call.get<{ message: string }>(
      'ury.ury_pos.api.getBranch'
    );
    if (!response.message) return [];

    // Native getDocList enforces read permissions; getBranch resolves the
    // branch from the server session rather than accepting a caller's branch.
    const units = await db.getDocList<{ name: string }>('URY Production Unit', {
      fields: ['name'],
      filters: [['branch', '=', response.message]],
      limit: 0,
    });
    return units.map(({ name }) => name);
  } catch (error) {
    console.error('Failed to fetch production units for branch:', error);
    return [];
  }
}
