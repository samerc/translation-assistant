import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const ADMIN_ONLY_KEY = 'ADMIN_ONLY';

/**
 * Guard that enforces Admin role by checking the role name in the database.
 * This is a hard check on the role itself — not just permissions.
 *
 * Use this on endpoints where RBAC permissions alone aren't sufficient,
 * e.g., managing roles (a user with roles:update could escalate their own
 * privileges if not also gated by admin role check).
 *
 * Apply via the @AdminOnly() decorator on a controller class or method.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isAdminOnly = this.reflector.getAllAndOverride<boolean>(
      ADMIN_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If @AdminOnly() is not applied, allow through
    if (!isAdminOnly) return true;

    const { user } = context.switchToHttp().getRequest();

    if (!user || !user.role || user.role.name !== 'Admin') {
      throw new ForbiddenException('This action requires administrator privileges');
    }

    return true;
  }
}
