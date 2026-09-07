import { call } from '@ury/core';

interface ProductionUnitsResponse {
  production_units: string[];
}

/**
 * Fetches all production unit names for the current user's branch.
 * Production units are used to subscribe to KOT error channels on the POS terminal.
 *
 * Returns an empty array if no production units are found or if branch cannot be resolved.
 */
export async function getProductionUnitsForBranch(): Promise<string[]> {
  try {
    const response = await call.get<ProductionUnitsResponse>(
      'ury.ury_pos.api.get_production_units_for_branch'
    );
    return response.production_units || [];
  } catch (error) {
    console.error('Failed to fetch production units for branch:', error);
    return [];
  }
}
