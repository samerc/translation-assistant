import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { User } from '../../modules/users/entities/user.entity.js';
import type { AuthenticatedRequest } from '../types/authenticated-request.js';
import { ROLE_ADMIN, ROLE_PLATFORM_ADMIN } from './roles.js';

/**
 * Who is calling, inside which tenant. Every access check and list query in a
 * tenant module takes one: `tenantId` scopes the data, `isAdmin` is the
 * tenant admin (sees everything in *their* tenant, nothing outside it).
 */
export interface Actor {
  userId: string;
  tenantId: string;
  isAdmin: boolean;
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
    isAdmin: user.role?.name === ROLE_ADMIN,
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
