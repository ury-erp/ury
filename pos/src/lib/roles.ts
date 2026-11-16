const PRIVILEGED_ROLES = ['URY Manager', 'URY Admin', 'URY Owner', 'System Manager'];

/** True when URY Cashier is held without any management/admin role. */
export const isCashierOnly = (roles?: string[] | null): boolean =>
  Boolean(roles?.includes('URY Cashier')) && !PRIVILEGED_ROLES.some((r) => roles?.includes(r));
