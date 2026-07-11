import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { MoreThan } from 'typeorm';
import { User } from '../users/entities/user.entity.js';
import { InviteToken } from './entities/invite-token.entity.js';
import { PasswordResetToken } from './entities/password-reset-token.entity.js';
import { Session } from './entities/session.entity.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtPayload } from './strategies/jwt.strategy.js';

interface LoginAttempt {
  failures: number;
  lockedUntil: number | null;
  lastAttempt: number;
}

const MAX_FAILURES = 5;
const LOCKOUT_DURATION_MS = 15 * 60_000; // 15 minutes
const ATTEMPT_WINDOW_MS = 60_000; // Reset counter after 1 minute of no attempts
const REFRESH_TOKEN_DAYS = 7;

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');
  private readonly loginAttempts = new Map<string, LoginAttempt>();

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(InviteToken)
    private readonly inviteTokenRepository: Repository<InviteToken>,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokenRepository: Repository<PasswordResetToken>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    setInterval(() => this.cleanupAttempts(), 10 * 60_000);
  }

  // ── Login ──

  async login(dto: LoginDto, ip: string, userAgent: string) {
    const emailKey = dto.email.toLowerCase();
    this.checkLockout(emailKey);

    const user = await this.userRepository.findOne({
      where: { email: dto.email },
      relations: ['role', 'role.permissions'],
    });

    if (!user) {
      this.recordFailure(emailKey);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Account is deactivated');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) {
      this.recordFailure(emailKey);
      throw new UnauthorizedException('Invalid credentials');
    }

    this.loginAttempts.delete(emailKey);

    // Generate new tokens and create a fresh session (session fixation prevention)
    const accessToken = await this.generateAccessToken(user);
    const { refreshToken, session } = await this.createSession(user, ip, userAgent);

    return {
      user: this.sanitizeUser(user),
      accessToken,
      refreshToken,
      sessionId: session.id,
    };
  }

  // ── Register ──

  async register(dto: RegisterDto, ip: string, userAgent: string) {
    const invite = await this.inviteTokenRepository.findOne({
      where: { token: dto.inviteToken, used: false, expiresAt: MoreThan(new Date()) },
    });

    if (!invite) throw new BadRequestException('Invalid or expired invite token');
    if (invite.email !== dto.email) throw new BadRequestException('Email does not match the invite');

    const existingUser = await this.userRepository.findOne({ where: { email: dto.email } });
    if (existingUser) throw new BadRequestException('Email already registered');

    const hashedPassword = await bcrypt.hash(dto.password, 12);
    const user = this.userRepository.create({
      email: dto.email,
      password: hashedPassword,
      firstName: dto.firstName,
      lastName: dto.lastName,
      roleId: invite.roleId,
    });

    const savedUser = await this.userRepository.save(user);
    invite.used = true;
    invite.usedByUserId = savedUser.id;
    await this.inviteTokenRepository.save(invite);

    const fullUser = await this.userRepository.findOne({
      where: { id: savedUser.id },
      relations: ['role', 'role.permissions'],
    });

    const accessToken = await this.generateAccessToken(fullUser!);
    const { refreshToken, session } = await this.createSession(fullUser!, ip, userAgent);

    return {
      user: this.sanitizeUser(fullUser!),
      accessToken,
      refreshToken,
      sessionId: session.id,
    };
  }

  // ── Refresh ──

  async refreshTokens(userId: string, refreshToken: string, ip: string, userAgent: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['role', 'role.permissions'],
    });

    if (!user) throw new ForbiddenException('Access denied');

    // Find the active session for this refresh token
    const sessions = await this.sessionRepository.find({
      where: { userId: user.id, revoked: false, expiresAt: MoreThan(new Date()) },
    });

    let matchedSession: Session | null = null;
    for (const session of sessions) {
      const tokenMatches = await bcrypt.compare(refreshToken, session.refreshTokenHash);
      if (tokenMatches) {
        matchedSession = session;
        break;
      }
    }

    if (!matchedSession) {
      throw new ForbiddenException('Access denied');
    }

    // Check IP/UA binding — flag suspicious changes
    const currentUAHash = this.hashUserAgent(userAgent);
    if (matchedSession.ipAddress !== ip || matchedSession.userAgentHash !== currentUAHash) {
      this.logger.warn(
        `[SESSION_FINGERPRINT_MISMATCH] sessionId=${matchedSession.id} userId=${user.id} ` +
        `storedIp=${matchedSession.ipAddress} currentIp=${ip} ` +
        `uaMatch=${matchedSession.userAgentHash === currentUAHash}`,
      );
      // Revoke the suspicious session
      matchedSession.revoked = true;
      await this.sessionRepository.save(matchedSession);
      throw new ForbiddenException('Session invalidated due to suspicious activity. Please log in again.');
    }

    // Rotate: generate new tokens, update session
    const newAccessToken = await this.generateAccessToken(user);
    const newRefreshToken = randomBytes(48).toString('base64url');
    const newHash = await bcrypt.hash(newRefreshToken, 12);

    matchedSession.refreshTokenHash = newHash;
    matchedSession.lastUsedAt = new Date();
    await this.sessionRepository.save(matchedSession);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  // ── Logout ──

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      // Revoke the specific session
      const sessions = await this.sessionRepository.find({
        where: { userId, revoked: false },
      });
      for (const session of sessions) {
        const matches = await bcrypt.compare(refreshToken, session.refreshTokenHash);
        if (matches) {
          session.revoked = true;
          await this.sessionRepository.save(session);
          break;
        }
      }
    }
    // Also clear legacy refreshToken on user entity for backward compat
    await this.userRepository.update(userId, { refreshToken: '' });
  }

  async logoutEverywhere(userId: string): Promise<{ revokedCount: number }> {
    const result = await this.sessionRepository.update(
      { userId, revoked: false },
      { revoked: true },
    );
    await this.userRepository.update(userId, { refreshToken: '' });
    this.logger.log(`[LOGOUT_EVERYWHERE] userId=${userId} revoked=${result.affected}`);
    return { revokedCount: result.affected || 0 };
  }

  // ── Active Sessions ──

  async getActiveSessions(userId: string) {
    const sessions = await this.sessionRepository.find({
      where: { userId, revoked: false, expiresAt: MoreThan(new Date()) },
      order: { lastUsedAt: 'DESC' },
    });

    return sessions.map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgentRaw ? s.userAgentRaw.slice(0, 100) : 'Unknown',
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId, revoked: false },
    });
    if (!session) throw new BadRequestException('Session not found');
    session.revoked = true;
    await this.sessionRepository.save(session);
  }

  // ── Profile ──

  async getProfile(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['role', 'role.permissions'],
    });
    if (!user) throw new UnauthorizedException();
    return this.sanitizeUser(user);
  }

  // ── Invite ──

  async createInvite(email: string, roleId?: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await this.inviteTokenRepository.save(
      this.inviteTokenRepository.create({ token, email, roleId, expiresAt }),
    );
    return { token, expiresAt };
  }

  // ── Password Reset ──

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const message = 'If an account with that email exists, a reset link has been generated.';
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user || !user.isActive) return { message };

    await this.resetTokenRepository.update({ userId: user.id, used: false }, { used: true });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30);
    await this.resetTokenRepository.save(
      this.resetTokenRepository.create({ token, userId: user.id, expiresAt }),
    );
    this.logger.log(`[PASSWORD_RESET_REQUESTED] userId=${user.id}`);

    // SECURITY: never return the raw reset token in the response outside development.
    // In production the token must be delivered out-of-band (email). Exposing it here
    // would let anyone reset any account by knowing only the email address.
    // TODO: wire an email service and drop the dev fallback entirely.
    if (process.env.NODE_ENV !== 'production') {
      return { message, token, expiresAt } as any;
    }
    return { message };
  }

  async verifyResetToken(token: string): Promise<{ valid: boolean; email?: string }> {
    const rt = await this.resetTokenRepository.findOne({
      where: { token, used: false, expiresAt: MoreThan(new Date()) },
    });
    if (!rt) return { valid: false };
    const user = await this.userRepository.findOne({ where: { id: rt.userId } });
    const email = user ? user.email.replace(/^(.{2})(.*)(@.*)$/, '$1***$3') : undefined;
    return { valid: true, email };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const rt = await this.resetTokenRepository.findOne({
      where: { token, used: false, expiresAt: MoreThan(new Date()) },
    });
    if (!rt) throw new BadRequestException('Invalid or expired reset token');

    const user = await this.userRepository.findOne({ where: { id: rt.userId } });
    if (!user) throw new BadRequestException('Invalid or expired reset token');

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await this.userRepository.update(user.id, { password: hashedPassword, refreshToken: '' });

    // Revoke all sessions (log out everywhere on password reset)
    await this.sessionRepository.update({ userId: user.id, revoked: false }, { revoked: true });

    rt.used = true;
    await this.resetTokenRepository.save(rt);
    await this.resetTokenRepository.update({ userId: user.id, used: false }, { used: true });

    this.logger.log(`[PASSWORD_RESET_COMPLETED] userId=${user.id}`);
    return { message: 'Password has been reset. Please log in with your new password.' };
  }

  // ── File Tokens ──

  generateFileToken(userId: string): string {
    return this.jwtService.sign({ sub: userId, purpose: 'file-access' }, { expiresIn: 300 });
  }

  verifyFileToken(token: string): string {
    try {
      const payload = this.jwtService.verify(token);
      if (payload.purpose !== 'file-access') throw new Error('Invalid token purpose');
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired file token');
    }
  }

  // ── Session helpers ──

  private async createSession(user: User, ip: string, userAgent: string) {
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshTokenHash = await bcrypt.hash(refreshToken, 12);
    const uaHash = this.hashUserAgent(userAgent);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);

    const session = await this.sessionRepository.save(
      this.sessionRepository.create({
        userId: user.id,
        refreshTokenHash,
        ipAddress: ip,
        userAgentHash: uaHash,
        userAgentRaw: userAgent?.slice(0, 512) || 'Unknown',
        lastUsedAt: new Date(),
        expiresAt,
      }),
    );

    return { refreshToken, session };
  }

  private hashUserAgent(ua: string): string {
    return createHash('sha256').update(ua || '').digest('hex').slice(0, 64);
  }

  private async generateAccessToken(user: User): Promise<string> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return this.jwtService.signAsync(payload, {
      expiresIn: this.configService.get<number>('jwt.accessTokenTtl'),
    });
  }

  // ── Login attempt tracking ──

  private checkLockout(email: string): void {
    const attempt = this.loginAttempts.get(email);
    if (!attempt) return;
    if (attempt.lockedUntil && Date.now() < attempt.lockedUntil) {
      const remaining = Math.ceil((attempt.lockedUntil - Date.now()) / 1000);
      this.logger.warn(`[ACCOUNT_LOCKED] email=${email} remaining=${remaining}s`);
      throw new ForbiddenException(
        `Account temporarily locked due to too many failed attempts. Try again in ${remaining} seconds.`,
      );
    }
    if (attempt.lockedUntil && Date.now() >= attempt.lockedUntil) {
      this.loginAttempts.delete(email);
    }
  }

  private recordFailure(email: string): void {
    const now = Date.now();
    const attempt = this.loginAttempts.get(email);
    if (!attempt || now - attempt.lastAttempt > ATTEMPT_WINDOW_MS) {
      this.loginAttempts.set(email, { failures: 1, lockedUntil: null, lastAttempt: now });
      return;
    }
    attempt.failures++;
    attempt.lastAttempt = now;
    if (attempt.failures >= MAX_FAILURES) {
      attempt.lockedUntil = now + LOCKOUT_DURATION_MS;
      this.logger.warn(`[ACCOUNT_LOCKOUT] email=${email} failures=${attempt.failures}`);
    }
  }

  private cleanupAttempts(): void {
    const now = Date.now();
    for (const [key, attempt] of this.loginAttempts) {
      if ((attempt.lockedUntil && now >= attempt.lockedUntil) || now - attempt.lastAttempt > LOCKOUT_DURATION_MS) {
        this.loginAttempts.delete(key);
      }
    }
  }

  // ── Sanitize ──

  private sanitizeUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      isActive: user.isActive,
      colorPalette: user.colorPalette,
      darkMode: user.darkMode,
      role: {
        id: user.role.id,
        name: user.role.name,
        permissions: user.role.permissions.map((p) => `${p.resource}:${p.action}`),
      },
    };
  }
}
