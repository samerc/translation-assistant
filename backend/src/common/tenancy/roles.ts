/**
 * The fixed roles. Admin / Translator / Viewer exist inside every tenant (the
 * role rows are shared; a user's tenant comes from users.tenant_id). Platform
 * Admin manages tenants and platform settings and belongs to no tenant.
 * Permissions per role are set by the seed on every boot (seed.ts).
 */
export const ROLE_ADMIN = 'Admin';
export const ROLE_TRANSLATOR = 'Translator';
export const ROLE_VIEWER = 'Viewer';
export const ROLE_PLATFORM_ADMIN = 'Platform Admin';

/** Roles a tenant admin may give to users of their tenant. */
export const TENANT_ROLES = [ROLE_ADMIN, ROLE_TRANSLATOR, ROLE_VIEWER];
