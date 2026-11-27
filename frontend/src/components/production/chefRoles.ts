/** Roles allowed into the Chef UI. Mirrors `CHEF_UI_ROLES` in
 * ury/ury/utils/department_scope.py; the server enforces the same rule on
 * every Chef UI endpoint, so this guard is a usability gate only. */
export const CHEF_UI_ROLES = ['URY Department Head', 'URY Manager', 'URY Admin', 'System Manager', 'Administrator'];

export function hasChefUiRole(roles: string[]): boolean {
  return roles.some((role) => CHEF_UI_ROLES.includes(role));
}
