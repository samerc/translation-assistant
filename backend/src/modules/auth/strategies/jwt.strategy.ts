import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity.js';
import { bindRequestTenant } from '../../../common/tenancy/tenant-context.js';

export interface JwtPayload {
  sub: string;
  email?: string;
  type?: 'access' | 'refresh';
  jti?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    const secret = configService.get<string>('jwt.secret');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    // Only access tokens authenticate API calls. Refresh and file-access tokens
    // share the signing secret, and file tokens travel in URLs (logs, history).
    if (payload.type !== 'access') {
      throw new UnauthorizedException();
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      relations: {
        role: {
          permissions: true,
        },
        tenant: true,
      },
    });

    if (!user || !user.isActive || !user.emailVerified) {
      throw new UnauthorizedException();
    }
    // A suspended (or not yet approved) organization locks out all its users,
    // including access tokens issued before the suspension.
    if (user.tenantId && user.tenant?.status !== 'active') {
      throw new UnauthorizedException();
    }

    // From here on, loading another tenant's records aborts the request
    // (TenantIsolationSubscriber).
    bindRequestTenant(user.tenantId);
    return user;
  }
}
