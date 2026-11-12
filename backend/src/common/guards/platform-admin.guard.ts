import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { MaybeAuthenticatedRequest } from '../types/authenticated-request.js';
import { isPlatformAdmin } from '../tenancy/actor.js';

/**
 * Platform-admin endpoints (tenants, approvals, platform settings, global
 * languages/labels). A hard role-name + no-tenant check, on top of the
 * `platform:*` permissions, so no tenant user can ever reach them.
 * Apply after AuthGuard('jwt').
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context
      .switchToHttp()
      .getRequest<MaybeAuthenticatedRequest>();
    if (!isPlatformAdmin(user)) {
      throw new ForbiddenException(
        'This action requires platform administrator privileges',
      );
    }
    return true;
  }
}
