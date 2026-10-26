import type { Request } from 'express';
import type { User } from '../../modules/users/entities/user.entity.js';
import type { JwtPayload } from '../../modules/auth/strategies/jwt.strategy.js';

/** Request behind the `jwt` (access-token) guard: `req.user` is the loaded User (with role.permissions). */
export interface AuthenticatedRequest extends Request {
  user: User;
}

/** Request seen by global guards, which run before auth: `req.user` may be absent. */
export interface MaybeAuthenticatedRequest extends Request {
  user?: User;
}

/** Request behind the `jwt-refresh` guard: `req.user` is the refresh payload plus the raw cookie token. */
export interface RefreshRequest extends Request {
  user: JwtPayload & { refreshToken: string };
}

/** Reads the httpOnly refresh cookie (cookie-parser types cookies as `any`). */
export function getRefreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.refresh_token;
}
