import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { User } from '../../modules/users/entities/user.entity.js';
import type { Role } from '../../modules/roles/entities/role.entity.js';
import type { AuthenticatedRequest } from '../types/authenticated-request.js';
import { ROLE_ADMIN, ROLE_PLATFORM_ADMIN } from './roles.js';

/**
 * Who is calling, inside which tenant. Every access check and list query in a
 * tenant module takes one: `tenantId` scopes the data; `isAdmin` is the
 * organization's Admin (team, settings, roles); `seesAll` = sees every job and
 * client of *their* organization (Admin, or a role with job scope "all", e.g.
 * Accounting) instead of only the jobs assigned to them — what they may do with
 * them is still up to their permissions.
 */
export interface Actor {
  userId: string;
  tenantId: string;
  isAdmin: boolean;
  seesAll: boolean;
  /** False: prices are left out of responses and can't be set (role setting). */
  seesPrices: boolean;
  /** The role name. */
  role?: string;
  /** `resource:action` keys of the role (absent in some tests = not checked). */
  permissions?: string[];
}

/** Whether the actor's role has this permission (true when not known). */
export function can(actor: Actor, permission: string): boolean {
  return !actor.permissions || actor.permissions.includes(permission);
}

/** The built-in, locked Admin role (an organization can't make another "Admin"). */
export function isAdminRole(
  role?: Pick<Role, 'name' | 'isBuiltIn'> | null,
): boolean {
  return !!role && role.isBuiltIn && role.name === ROLE_ADMIN;
}

/** Sees all of the organization's jobs and clients, not only assigned ones. */
export function roleSeesAllJobs(user: Pick<User, 'role'>): boolean {
  return isAdminRole(user.role) || user.role?.jobScope === 'all';
}

export function actorOf(user: User): Actor {
  if (!user?.tenantId) {
    // Platform admins have no tenant; tenant endpoints are not for them.
    throw new ForbiddenException(
      'This action is only available inside an organization',
    );
  }
  return {
    userId: user.id,
    tenantId: user.tenantId,
    isAdmin: isAdminRole(user.role),
    seesAll: roleSeesAllJobs(user),
    seesPrices: isAdminRole(user.role) || user.role?.seesPrices !== false,
    permissions: (user.role?.permissions ?? []).map(
      (p) => `${p.resource}:${p.action}`,
    ),
    role: user.role?.name,
  };
}

export function isPlatformAdmin(user?: User | null): boolean {
  return !!user && !user.tenantId && user.role?.name === ROLE_PLATFORM_ADMIN;
}

/** `@CurrentActor() actor: Actor` — the caller as an Actor (403 for platform admins). */
export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Actor =>
    actorOf(ctx.switchToHttp().getRequest<AuthenticatedRequest>().user),
);
