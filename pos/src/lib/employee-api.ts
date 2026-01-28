import { call } from './frappe-sdk';

export interface EmployeeSearchResult {
  name: string;          // Employee ID (e.g. HR-EMP-00001)
  employee_name: string; // Display name
  max_price: number;     // Max meal price for today
}

/**
 * Search employees eligible for employee meal at the current branch and day.
 */
export async function searchEmployees(
  search: string,
  limit: number = 10
): Promise<EmployeeSearchResult[]> {
  if (!search.trim()) return [];
  try {
    const res = await call.get('ury.ury_pos.api.searchEmployees', {
      search,
      limit,
    });
    return res.message || [];
  } catch (error) {
    console.error('Employee search error:', error);
    throw error;
  }
}
