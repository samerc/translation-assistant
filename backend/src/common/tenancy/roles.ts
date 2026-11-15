/**
 * Built-in roles. Admin / Translator / Viewer are platform rows used by every
 * organization (a user's organization comes from users.tenant_id); Platform
 * Admin manages organizations and belongs to none. Admin and Platform Admin are
 * locked (set by the seed on every boot); Translator, Viewer and the platform
 * admin's own defaults can be changed — platform-wide by the platform admin, or
 * per organization by its Admin (see RolesService).
 */
export const ROLE_ADMIN = 'Admin';
export const ROLE_TRANSLATOR = 'Translator';
export const ROLE_VIEWER = 'Viewer';
export const ROLE_PLATFORM_ADMIN = 'Platform Admin';

/** Names nobody can give a new role (case-insensitive). */
export const RESERVED_ROLE_NAMES = [
  ROLE_ADMIN,
  ROLE_TRANSLATOR,
  ROLE_VIEWER,
  ROLE_PLATFORM_ADMIN,
];

/** Areas a role can be given rights on (resource of `resource:action`). Job files follow the Jobs rights. */
export const GRANTABLE_RESOURCES = [
  'clients',
  'jobs',
  'documents',
  'templates',
  'invoices',
  'reports',
  'calendar',
];
export const ROLE_ACTIONS = ['read', 'create', 'update', 'delete'];

/** Every organization role has these (the app needs them to work at all). */
export const ALWAYS_GRANTED = [
  'settings:read',
  'notifications:read',
  'notifications:update',
];
