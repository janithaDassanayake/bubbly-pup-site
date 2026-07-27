// Who may do what. Three roles, two power levels:
//
//   owner — the original seeded account. Same powers as admin, but PROTECTED: it
//           can't be removed or demoted, so the salon can never lock itself out.
//   admin — created by an owner/admin. Full portal + business settings + may
//           create, re-password and remove other logins.
//   staff — full day-to-day portal (appointments, slots, payments, customers,
//           reports, WhatsApp). No business settings, no account management.
//
// No self-service registration exists anywhere: a login can only come from an
// owner or admin creating it inside the portal.
export const ROLE = { OWNER: "owner", ADMIN: "admin", STAFF: "staff" } as const;
export type Role = (typeof ROLE)[keyof typeof ROLE];

/** Full rights: business settings AND account management. Owner or admin. */
export const isAdmin = (u: { role: string } | null | undefined) =>
  u?.role === ROLE.OWNER || u?.role === ROLE.ADMIN;

/** The protected original account — never removable, never demotable. */
export const isSuperUser = (u: { role: string } | null | undefined) =>
  u?.role === ROLE.OWNER;

export const roleLabel = (role: string) =>
  role === ROLE.OWNER ? "Owner" : role === ROLE.ADMIN ? "Admin" : "Staff";

/** Roles an owner/admin may assign. The protected `owner` role is not one of them. */
export const ASSIGNABLE: Role[] = [ROLE.ADMIN, ROLE.STAFF];
export const isAssignable = (role: string): role is Role =>
  (ASSIGNABLE as string[]).includes(role);
