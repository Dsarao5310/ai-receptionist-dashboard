# Tenancy and Authentication Rules

- Auth.js / NextAuth v5 is the locked authentication system. Do not add Supabase Auth
  or run competing authentication systems.
- Sessions use signed httpOnly cookies, `sameSite=lax`, secure cookies in production,
  approximately eight-hour expiry and one-hour rotation, and minimal identity/platform
  claims.
- Platform privilege and workspace role are separate. `operator` is the platform role;
  workspace roles are `owner`, `manager`, and `staff`. A workspace owner is not a
  platform operator.
- Re-read workspace membership and role from the database. Never trust a browser role,
  cookie-selected workspace, route/query workspace, or payload workspace as authorization.
- Server guards and centralized permission helpers are authoritative. Frontend gates are
  only user experience controls, and direct routes/actions require the same authorization.
- Resolve an authorized workspace before creating a scoped repository/query context.
  Ordinary users must not enumerate or access other workspaces.
- Revoked membership and permission changes must take effect without waiting for a stale
  workspace-role client or token claim.
- The hosted staging matrix has verified owner/manager/staff, Harbour owner isolation,
  platform-operator access, workspace switching, sign-out, and safe continuation.
- Changes to authentication, repositories, persistence, or provider boundaries require
  hostile tests for foreign records, forged roles, changed workspace selectors, revoked
  membership, direct admin actions, and cross-workspace writes.
- Cross-tenant reads, mutations, or relationship links are release blockers.
