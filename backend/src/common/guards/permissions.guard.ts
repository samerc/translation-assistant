import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';
import type { MaybeAuthenticatedRequest } from '../types/authenticated-request.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context
      .switchToHttp()
      .getRequest<MaybeAuthenticatedRequest>();

    if (!user || !user.role || !user.role.permissions) {
      return false;
    }

    const userPermissions = user.role.permissions.map(
      (p) => `${p.resource}:${p.action}`,
    );

    return requiredPermissions.every((permission) =>
      userPermissions.includes(permission),
    );
  }
}
