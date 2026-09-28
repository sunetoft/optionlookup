/** Canonical admin role — case-insensitive match handles both 'admin' and 'ADMIN' in the DB. */
export const ADMIN_ROLE = 'admin';

export function isAdminRole(role: string | null | undefined): boolean {
  return role?.toLowerCase() === ADMIN_ROLE;
}