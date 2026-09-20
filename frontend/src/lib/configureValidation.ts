import type { ConfigureState, SectionId } from '../context/ConfigureContext';

type ConfigureValues = Pick<ConfigureState, 'branch' | 'rooms' | 'tables' | 'menuItems' | 'taxConfig' | 'paymentMethods' | 'users'>;
const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export function isSectionValid(section: SectionId, state: ConfigureValues): boolean {
  switch (section) {
    case 'branch':
      return hasText(state.branch.branchName) && hasText(state.branch.invoicePrefix);
    case 'rooms':
      return state.rooms.length > 0 && state.rooms.every((room) => hasText(room.name));
    case 'tables':
      return state.tables.length > 0 && state.tables.every((table) =>
        hasText(table.name) && Number.isInteger(table.seats) && table.seats > 0 &&
        state.rooms.some((room) => room.name === table.room));
    case 'menu':
      return state.menuItems.length > 0 && state.menuItems.every((item) =>
        hasText(item.name) && hasText(item.course) && Number.isFinite(item.price) && item.price >= 0) &&
        Number.isFinite(state.taxConfig.taxPercentage) && state.taxConfig.taxPercentage >= 0;
    case 'payment':
      return state.paymentMethods.length > 0 && state.paymentMethods.every((method) => hasText(method.name));
    case 'users':
      return state.users.every((user) => hasText(user.name) && hasText(user.role) &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email));
  }
}

/** Existing records are reused by the API; an exception is never proof of success. */
export function assertConfigureSuccess(response: unknown): void {
  if (!response || typeof response !== 'object') throw new Error('Invalid setup result');
  const data = response as { status?: string; results?: { pos_profile?: unknown; pos_profile_error?: unknown } };
  if (data.results?.pos_profile_error) {
    throw new Error(String(data.results.pos_profile_error));
  }
  if (data.status !== 'success' || !hasText(data.results?.pos_profile)) {
    throw new Error('Setup did not confirm a working POS profile');
  }
}
