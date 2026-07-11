import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtPayload } from './jwt.strategy.js';

/**
 * Extracts the refresh token from:
 * 1. httpOnly cookie 'refresh_token' (preferred, secure)
 * 2. Authorization Bearer header (fallback for backward compat during migration)
 */
function extractRefreshToken(req: Request): string | null {
  // Try cookie first
  const cookieToken = req.cookies?.refresh_token;
  if (cookieToken) return cookieToken;

  // Fallback to Bearer header
  const authHeader = req.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return null;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(configService: ConfigService) {
    const secret = configService.get<string>('jwt.secret');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractRefreshToken]),
      ignoreExpiration: false,
      secretOrKey: secret,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const refreshToken = extractRefreshToken(req);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }
    return { ...payload, refreshToken };
  }
}
