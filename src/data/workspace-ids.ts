/**
 * Workspace identifiers shared by the demo dataset and the identity fixtures.
 *
 * They live in their own module so the client-side demo data and the
 * server-only identity tables can agree on which tenant is which without the
 * browser bundle pulling in anything from `server/`.
 */
export const DEV_WORKSPACE_A = "ws_coastal_bloom";
export const DEV_WORKSPACE_B = "ws_harbour_dental";
