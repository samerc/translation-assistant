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
import { DataSource, In, IsNull, QueryFailedError, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { MoreThan } from 'typeorm';
import { User } from '../users/entities/user.entity.js';
import { Role } from '../roles/entities/role.entity.js';
import { InviteToken } from './entities/invite-token.entity.js';
import { PasswordResetToken } from './entities/password-reset-token.entity.js';
import { Session } from './entities/session.entity.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtPayload } from './strategies/jwt.strategy.js';
import { MailService } from '../mail/mail.service.js';
import { EmailVerificationToken } from './entities/email-verification-token.entity.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { TurnstileService } from './turnstile.service.js';
import { SignupDto } from './dto/signup.dto.js';
import { actorOf, type Actor } from '../../common/tenancy/actor.js';
import { bindRequestTenant } from '../../common/tenancy/tenant-context.js';
import {
  ROLE_ADMIN,
  ROLE_PLATFORM_ADMIN,
  TENANT_ROLES,
} from '../../common/tenancy/roles.js';

interface LoginAttempt {
  failures: number;
  lockedUntil: number | null;
  lastAttempt: number;
}

const MAX_FAILURES = 5;
const LOCKOUT_DURATION_MS = 15 * 60_000; // 15 minutes
const ATTEMPT_WINDOW_MS = 60_000; // Reset counter after 1 minute of no attempts
const REFRESH_TOKEN_DAYS = 7;

// Role given to invitees when the admin leaves the role on "Default".
const DEFAULT_INVITE_ROLE = 'Translator';

/** Optional invitee name given by the inviting admin (pre-fills registration). */
export interface InviteeNames {
  firstName?: string;
  lastName?: string;
}
const VERIFY_EMAIL_HOURS = 24;
const SIGNUP_MESSAGE =
  'Check your email: we sent you a link to confirm your address. After that, we review new organizations and let you know when your account is ready.';

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
    private readonly mailService: MailService,
    @InjectRepository(EmailVerificationToken)
    private readonly verifyTokenRepository: Repository<EmailVerificationToken>,
    private readonly tenantsService: TenantsService,
    private readonly settingsService: SettingsService,
    private readonly turnstile: TurnstileService,
    private readonly dataSource: DataSource,
  ) {
    setInterval(() => this.cleanupAttempts(), 10 * 60_000);
  }

  // ── Login ──

  async login(dto: LoginDto, ip: string, userAgent: string) {
    // Lockout is keyed by (client IP + email) so an attacker cannot lock a victim
    // out from arbitrary IPs (targeted-lockout DoS); the per-IP throttle bounds
    // distributed guessing. Requires a trustworthy req.ip (see main.ts trust proxy).
    const emailKey = dto.email.toLowerCase();
    const attemptKey = `${ip}:${emailKey}`;
    this.checkLockout(attemptKey);

    const user = await this.userRepository.findOne({
      where: { email: dto.email },
      relations: {
        role: {
          permissions: true,
        },
        tenant: true,
      },
    });

    if (!user) {
      this.recordFailure(attemptKey);
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(
      dto.password,
      await this.loadPasswordHash(user.id),
    );
    if (!passwordValid) {
      this.recordFailure(attemptKey);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Only reveal account state AFTER credentials verify — otherwise "Account is
    // deactivated" vs "Invalid credentials" is an account-existence oracle.
    if (!user.isActive) {
      throw new ForbiddenException('Account is deactivated');
    }
    this.assertCanSignIn(user);

    this.loginAttempts.delete(attemptKey);

    // Generate new tokens and create a fresh session (session fixation prevention)
    const accessToken = await this.generateAccessToken(user);
    const { refreshToken, session } = await this.createSession(
      user,
      ip,
      userAgent,
    );

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
      where: {
        token: dto.inviteToken,
        used: false,
        expiresAt: MoreThan(new Date()),
      },
    });

    if (!invite)
      throw new BadRequestException('Invalid or expired invite token');
    if (invite.email.toLowerCase() !== dto.email.toLowerCase())
      throw new BadRequestException('Email does not match the invite');

    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (existingUser) throw new BadRequestException('Email already registered');
    // The invitee joins the inviting organization, and only while it is active.
    const tenant = await this.tenantsService.findOne(invite.tenantId);
    if (tenant.status !== 'active') {
      throw new BadRequestException('Invalid or expired invite token');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);
    const user = this.userRepository.create({
      email: invite.email, // the address the admin invited (match is case-insensitive)
      password: hashedPassword,
      firstName: dto.firstName,
      lastName: dto.lastName,
      roleId: invite.roleId,
      tenantId: invite.tenantId,
      emailVerified: true, // the invite link was delivered to this address
    });

    // Single use: claim the invite with a conditional UPDATE (concurrent
    // registrations with one token — only one gets affected = 1).
    const claim = await this.inviteTokenRepository.update(
      { id: invite.id, used: false },
      { used: true },
    );
    if (!claim.affected) {
      throw new BadRequestException('Invalid or expired invite token');
    }
    let savedUser: User;
    try {
      savedUser = await this.userRepository.save(user);
    } catch (err) {
      // e.g. the email was registered concurrently — give the invite back
      await this.inviteTokenRepository.update(invite.id, { used: false });
      throw err;
    }
    await this.inviteTokenRepository.update(invite.id, {
      usedByUserId: savedUser.id,
    });

    const fullUser = await this.userRepository.findOne({
      where: { id: savedUser.id },
      relations: {
        role: {
          permissions: true,
        },
        tenant: true,
      },
    });

    const accessToken = await this.generateAccessToken(fullUser!);
    const { refreshToken, session } = await this.createSession(
      fullUser!,
      ip,
      userAgent,
    );

    return {
      user: this.sanitizeUser(fullUser!),
      accessToken,
      refreshToken,
      sessionId: session.id,
    };
  }

  // ── Refresh ──

  async refreshTokens(
    userId: string,
    refreshToken: string,
    ip: string,
    userAgent: string,
  ) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: {
        role: {
          permissions: true,
        },
        tenant: true,
      },
    });

    if (!user || !user.isActive) throw new ForbiddenException('Access denied');
    // A suspended organization's sessions stop refreshing.
    if (
      !user.emailVerified ||
      (user.tenantId && user.tenant?.status !== 'active')
    ) {
      throw new ForbiddenException('Access denied');
    }

    // Find the active session for this refresh token (SHA-256 is deterministic → direct lookup)
    const matchedSession = await this.sessionRepository.findOne({
      where: {
        userId: user.id,
        refreshTokenHash: this.hashRefreshToken(refreshToken),
        revoked: false,
        expiresAt: MoreThan(new Date()),
      },
    });

    if (!matchedSession) {
      // Reuse detection: a token this session already rotated away from is
      // being presented again, so someone holds a copy of an old refresh
      // token. Revoke the session: both the thief and the user must log in.
      const replayed = await this.sessionRepository.findOne({
        where: {
          userId: user.id,
          previousRefreshTokenHash: this.hashRefreshToken(refreshToken),
          revoked: false,
        },
      });
      if (replayed) {
        this.logger.warn(
          `[REFRESH_TOKEN_REUSE] sessionId=${replayed.id} userId=${user.id} ip=${ip}`,
        );
        replayed.revoked = true;
        await this.sessionRepository.save(replayed);
      }
      throw new ForbiddenException('Access denied');
    }

    // IP / user-agent changes are normal (Wi-Fi to mobile data, Cloudflare
    // edge changes, browser updates), so they are logged for the audit trail
    // but don't end the session. Token theft is caught by reuse detection.
    const currentUAHash = this.hashUserAgent(userAgent);
    if (
      matchedSession.ipAddress !== ip ||
      matchedSession.userAgentHash !== currentUAHash
    ) {
      this.logger.log(
        `[SESSION_FINGERPRINT_CHANGE] sessionId=${matchedSession.id} userId=${user.id} ` +
          `storedIp=${matchedSession.ipAddress} currentIp=${ip} ` +
          `uaMatch=${matchedSession.userAgentHash === currentUAHash}`,
      );
      matchedSession.ipAddress = ip;
      matchedSession.userAgentHash = currentUAHash;
      matchedSession.userAgentRaw = (userAgent || '').slice(0, 512);
    }

    // Rotate: generate new tokens, update session
    const newAccessToken = await this.generateAccessToken(user);
    const newRefreshToken = await this.generateRefreshToken(user);
    const newHash = this.hashRefreshToken(newRefreshToken);

    matchedSession.previousRefreshTokenHash = matchedSession.refreshTokenHash;
    matchedSession.refreshTokenHash = newHash;
    matchedSession.lastUsedAt = new Date();
    await this.sessionRepository.save(matchedSession);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  // ── Logout ──

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      // Revoke the specific session for this token
      await this.sessionRepository.update(
        {
          userId,
          refreshTokenHash: this.hashRefreshToken(refreshToken),
          revoked: false,
        },
        { revoked: true },
      );
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
    this.logger.log(
      `[LOGOUT_EVERYWHERE] userId=${userId} revoked=${result.affected}`,
    );
    return { revokedCount: result.affected || 0 };
  }

  // ── Active Sessions ──

  // currentRefreshToken (the caller's cookie) marks this device's session, so the
  // UI can label it and treat revoking it as a logout.
  async getActiveSessions(userId: string, currentRefreshToken?: string) {
    const sessions = await this.sessionRepository.find({
      where: { userId, revoked: false, expiresAt: MoreThan(new Date()) },
      order: { lastUsedAt: 'DESC' },
    });
    const currentHash = currentRefreshToken
      ? this.hashRefreshToken(currentRefreshToken)
      : null;

    return sessions.map((s) => ({
      id: s.id,
      current: s.refreshTokenHash === currentHash,
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
      relations: {
        role: {
          permissions: true,
        },
        tenant: true,
      },
    });
    if (!user) throw new UnauthorizedException();
    return this.sanitizeUser(user);
  }

  // ── Invite ──

  async createInvite(
    email: string,
    roleId: string | undefined,
    tenantId: string,
    names?: InviteeNames,
  ): Promise<{ token: string; expiresAt: Date }> {
    // users.role_id is NOT NULL: resolve the role now, so a bad or missing role
    // fails here instead of at registration. No role picked = Translator.
    // Only the tenant roles can be given, never Platform Admin.
    const role = await this.userRepository.manager.findOne(Role, {
      where: roleId
        ? { id: roleId, name: In(TENANT_ROLES) }
        : { name: DEFAULT_INVITE_ROLE },
    });
    if (!role) {
      throw new BadRequestException(
        roleId
          ? 'Role not found'
          : `The default role "${DEFAULT_INVITE_ROLE}" does not exist — pick a role`,
      );
    }
    roleId = role.id;
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await this.inviteTokenRepository.save(
      this.inviteTokenRepository.create({
        token,
        email,
        firstName: names?.firstName?.trim() || null,
        lastName: names?.lastName?.trim() || null,
        roleId,
        tenantId,
        expiresAt,
      }),
    );
    const tenant = await this.tenantsService.findOne(tenantId);
    // Email the invite link (best-effort — the token is also returned so an admin can
    // copy the link manually if SMTP isn't configured yet).
    this.mailService
      .sendInvite(email, token, {
        firstName: names?.firstName?.trim(),
        organizationName: tenant.name,
        roleName: role.name,
      })
      .catch((err: unknown) => {
        this.logger.error(
          `[INVITE_EMAIL_FAILED] email=${email}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    return { token, expiresAt };
  }

  /**
   * What a (still usable) invite is for: the locked email, the suggested name,
   * the organization and role. Anyone holding the 64-char token may see it —
   * the token is the secret that was emailed to that address.
   */
  async inviteDetails(token: string) {
    const invite = await this.inviteTokenRepository.findOne({
      where: { token, used: false, expiresAt: MoreThan(new Date()) },
      relations: { tenant: true },
    });
    if (!invite || invite.tenant.status !== 'active') {
      throw new BadRequestException(
        'This invitation is invalid or has expired. Ask your administrator for a new one.',
      );
    }
    const role = invite.roleId
      ? await this.userRepository.manager.findOne(Role, {
          where: { id: invite.roleId },
        })
      : null;
    return {
      email: invite.email,
      firstName: invite.firstName ?? '',
      lastName: invite.lastName ?? '',
      organizationName: invite.tenant.name,
      roleName: role?.name ?? null,
    };
  }

  // ── Password Reset ──

  async requestPasswordReset(
    email: string,
  ): Promise<{ message: string; token?: string; expiresAt?: Date }> {
    const message =
      'If an account with that email exists, a reset link has been generated.';
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user || !user.isActive) return { message };

    await this.resetTokenRepository.update(
      { userId: user.id, used: false },
      { used: true },
    );

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30);
    await this.resetTokenRepository.save(
      this.resetTokenRepository.create({ token, userId: user.id, expiresAt }),
    );
    this.logger.log(`[PASSWORD_RESET_REQUESTED] userId=${user.id}`);

    // Deliver the reset link by email (best-effort — never block/leak on SMTP failure).
    this.mailService
      .sendPasswordReset(user.email, token)
      .catch((err: unknown) => {
        this.logger.error(
          `[PASSWORD_RESET_EMAIL_FAILED] userId=${user.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    // SECURITY: never return the raw reset token in the response outside development.
    // In production the token is delivered only via email (above).
    if (process.env.NODE_ENV !== 'production') {
      return { message, token, expiresAt };
    }
    return { message };
  }

  async verifyResetToken(
    token: string,
  ): Promise<{ valid: boolean; email?: string }> {
    const rt = await this.resetTokenRepository.findOne({
      where: { token, used: false, expiresAt: MoreThan(new Date()) },
    });
    if (!rt) return { valid: false };
    const user = await this.userRepository.findOne({
      where: { id: rt.userId },
    });
    const email = user
      ? user.email.replace(/^(.{2})(.*)(@.*)$/, '$1***$3')
      : undefined;
    return { valid: true, email };
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const rt = await this.resetTokenRepository.findOne({
      where: { token, used: false, expiresAt: MoreThan(new Date()) },
    });
    if (!rt) throw new BadRequestException('Invalid or expired reset token');

    // Single use: claim it with a conditional UPDATE. Of two concurrent resets
    // with the same token only one sees affected = 1.
    const claim = await this.resetTokenRepository.update(
      { id: rt.id, used: false },
      { used: true },
    );
    if (!claim.affected) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const user = await this.userRepository.findOne({
      where: { id: rt.userId },
    });
    if (!user) throw new BadRequestException('Invalid or expired reset token');

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await this.userRepository.update(user.id, {
      password: hashedPassword,
      mustChangePassword: false,
      refreshToken: '',
    });

    // Revoke all sessions (log out everywhere on password reset)
    await this.sessionRepository.update(
      { userId: user.id, revoked: false },
      { revoked: true },
    );

    // Any other outstanding reset tokens for this user die with this one.
    await this.resetTokenRepository.update(
      { userId: user.id, used: false },
      { used: true },
    );

    this.logger.log(`[PASSWORD_RESET_COMPLETED] userId=${user.id}`);
    return {
      message: 'Password has been reset. Please log in with your new password.',
    };
  }

  // ── Sign-in rules beyond the password ──

  /** Unverified emails and pending/suspended organizations can't sign in (said only after the password matched). */
  private assertCanSignIn(user: User): void {
    if (!user.emailVerified) {
      throw new ForbiddenException(
        'Please confirm your email address first: check your inbox for the link.',
      );
    }
    if (!user.tenantId) return; // platform admin
    if (user.tenant?.status === 'pending') {
      throw new ForbiddenException(
        "Your organization is waiting for approval. We'll email you as soon as it's ready.",
      );
    }
    if (user.tenant?.status === 'closing') {
      throw new ForbiddenException(
        'Your organization is scheduled for deletion. Contact support if this is a mistake.',
      );
    }
    if (user.tenant?.status !== 'active') {
      throw new ForbiddenException(
        "Your organization's account is suspended. Please contact support.",
      );
    }
  }

  // ── Self sign-up ──

  async signupStatus(): Promise<{
    enabled: boolean;
    turnstileSiteKey: string | null;
  }> {
    const platform = await this.settingsService.getPlatformSettings();
    return {
      enabled: platform.signupsEnabled,
      // Site keys are public by design (they go into the page).
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY?.trim() || null,
    };
  }

  /**
   * Creates an organization (pending approval) and its first admin (email not
   * yet verified), then emails a confirmation link. The response is the same
   * whether or not the email was already registered (no account oracle).
   */
  async signup(
    dto: SignupDto,
    ip: string,
  ): Promise<{ message: string; token?: string }> {
    const platform = await this.settingsService.getPlatformSettings();
    if (!platform.signupsEnabled) {
      throw new ForbiddenException('Sign-ups are closed at the moment');
    }
    await this.turnstile.verify(dto.turnstileToken, ip);

    const email = dto.email.trim().toLowerCase();
    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing) {
      this.mailService
        .sendSignupExistingAccount(email)
        .catch((err: unknown) =>
          this.logger.error(
            `[SIGNUP_EXISTING_EMAIL_FAILED]: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      this.logger.log(`[SIGNUP_EXISTING_ACCOUNT] ip=${ip}`);
      return { message: SIGNUP_MESSAGE };
    }

    const adminRole = await this.userRepository.manager.findOneOrFail(Role, {
      where: { name: ROLE_ADMIN },
    });
    const passwordHash = await bcrypt.hash(dto.password, 12);
    let created: { userId: string; tenantId: string };
    try {
      created = await this.dataSource.transaction(async (manager) => {
        const tenant = await this.tenantsService.create(manager, {
          name: dto.organizationName.trim(),
          status: 'pending',
          source: 'signup',
        });
        const user = await manager.save(
          manager.create(User, {
            email,
            password: passwordHash,
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            roleId: adminRole.id,
            tenantId: tenant.id,
            emailVerified: false,
          }),
        );
        return { userId: user.id, tenantId: tenant.id };
      });
    } catch (err) {
      // Same email signed up concurrently: answer like any other duplicate.
      const code = (err as { driverError?: { code?: string } }).driverError
        ?.code;
      if (err instanceof QueryFailedError && code === 'ER_DUP_ENTRY') {
        return { message: SIGNUP_MESSAGE };
      }
      throw err;
    }
    this.logger.log(
      `[SIGNUP] tenantId=${created.tenantId} userId=${created.userId} ip=${ip}`,
    );

    const token = await this.issueVerificationToken(created.userId, email);
    // Outside production the link token is returned for testing (no inbox needed).
    if (process.env.NODE_ENV !== 'production') {
      return { message: SIGNUP_MESSAGE, token };
    }
    return { message: SIGNUP_MESSAGE };
  }

  private async issueVerificationToken(
    userId: string,
    email: string,
  ): Promise<string> {
    await this.verifyTokenRepository.update(
      { userId, used: false },
      { used: true },
    );
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + VERIFY_EMAIL_HOURS * 3_600_000);
    await this.verifyTokenRepository.save(
      this.verifyTokenRepository.create({ token, userId, expiresAt }),
    );
    this.mailService
      .sendEmailVerification(email, token)
      .catch((err: unknown) =>
        this.logger.error(
          `[VERIFY_EMAIL_FAILED] userId=${userId}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    return token;
  }

  /** Confirms the address; a pending organization then waits for the platform admin. */
  async verifyEmail(
    token: string,
  ): Promise<{ message: string; organizationStatus?: string }> {
    const vt = await this.verifyTokenRepository.findOne({
      where: { token, used: false, expiresAt: MoreThan(new Date()) },
    });
    if (!vt) {
      throw new BadRequestException(
        'This confirmation link is invalid or has expired',
      );
    }
    const claim = await this.verifyTokenRepository.update(
      { id: vt.id, used: false },
      { used: true },
    );
    if (!claim.affected) {
      throw new BadRequestException(
        'This confirmation link is invalid or has expired',
      );
    }
    await this.userRepository.update(vt.userId, { emailVerified: true });
    const user = await this.userRepository.findOne({
      where: { id: vt.userId },
      relations: { tenant: true },
    });
    this.logger.log(`[EMAIL_VERIFIED] userId=${vt.userId}`);

    if (user?.tenant?.status === 'pending') {
      await this.notifyPlatformAdminsOfSignup(user.tenant.name, user.email);
      return {
        message:
          "Thanks, your email is confirmed. We're reviewing your organization and will email you as soon as it's ready.",
        organizationStatus: 'pending',
      };
    }
    return {
      message: 'Thanks, your email is confirmed. You can log in now.',
      organizationStatus: user?.tenant?.status,
    };
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const message =
      'If that address has an unconfirmed account, we sent a new confirmation link.';
    const user = await this.userRepository.findOne({
      where: { email: email.trim().toLowerCase() },
    });
    if (user && !user.emailVerified && user.isActive) {
      await this.issueVerificationToken(user.id, user.email);
    }
    return { message };
  }

  private async notifyPlatformAdminsOfSignup(
    organization: string,
    email: string,
  ): Promise<void> {
    const admins = await this.userRepository.find({
      where: {
        tenantId: IsNull(),
        isActive: true,
        role: { name: ROLE_PLATFORM_ADMIN },
      },
      relations: { role: true },
    });
    if (!admins.length) return;
    const repo = this.dataSource.getRepository(Notification);
    await repo.save(
      admins.map((a) =>
        repo.create({
          userId: a.id,
          type: 'tenant_signup',
          title: 'New sign-up waiting for approval',
          message: `${organization} (${email}) confirmed their email.`,
          link: '/platform',
        }),
      ),
    );
    for (const a of admins) {
      this.mailService
        .sendSignupAwaitingApproval(a.email, organization, email)
        .catch((err: unknown) =>
          this.logger.error(
            `[SIGNUP_ADMIN_EMAIL_FAILED]: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }
  }

  // ── File Tokens ──

  generateFileToken(userId: string): string {
    return this.jwtService.sign(
      { sub: userId, purpose: 'file-access' },
      { expiresIn: 300 },
    );
  }

  /**
   * The caller behind a file-view token (passport images open in a new tab, so
   * they carry a short-lived token in the URL instead of the bearer header).
   * Same rules as an API call: active user, active organization.
   */
  async actorForFileToken(token: string): Promise<Actor> {
    const userId = this.verifyFileToken(token);
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { role: true, tenant: true },
    });
    if (
      !user ||
      !user.isActive ||
      !user.tenantId ||
      user.tenant?.status !== 'active'
    ) {
      throw new UnauthorizedException('Invalid or expired file token');
    }
    bindRequestTenant(user.tenantId);
    return actorOf(user);
  }

  verifyFileToken(token: string): string {
    try {
      const payload = this.jwtService.verify<{ sub: string; purpose?: string }>(
        token,
      );
      if (payload.purpose !== 'file-access')
        throw new Error('Invalid token purpose');
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired file token');
    }
  }

  // ── Session helpers ──

  private async createSession(user: User, ip: string, userAgent: string) {
    const refreshToken = await this.generateRefreshToken(user);
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
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
    return createHash('sha256')
      .update(ua || '')
      .digest('hex')
      .slice(0, 64);
  }

  // Refresh tokens are high-entropy signed JWTs — store a fast SHA-256 digest
  // (not bcrypt, which truncates inputs at 72 bytes and would collide on JWTs).
  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async generateAccessToken(user: User): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      type: 'access',
    };
    return this.jwtService.signAsync(payload, {
      expiresIn: this.configService.get<number>('jwt.accessTokenTtl'),
    });
  }

  private async generateRefreshToken(user: User): Promise<string> {
    // jti: tokens issued to the same user in the same second would otherwise be
    // identical and share one session hash (logout on one device kills the other).
    const payload: JwtPayload = {
      sub: user.id,
      type: 'refresh',
      jti: randomUUID(),
    };
    return this.jwtService.signAsync(payload, {
      expiresIn: `${REFRESH_TOKEN_DAYS}d`,
    });
  }

  // ── Login attempt tracking ──

  private checkLockout(email: string): void {
    const attempt = this.loginAttempts.get(email);
    if (!attempt) return;
    if (attempt.lockedUntil && Date.now() < attempt.lockedUntil) {
      const remaining = Math.ceil((attempt.lockedUntil - Date.now()) / 1000);
      this.logger.warn(
        `[ACCOUNT_LOCKED] email=${email} remaining=${remaining}s`,
      );
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
      this.loginAttempts.set(email, {
        failures: 1,
        lockedUntil: null,
        lastAttempt: now,
      });
      return;
    }
    attempt.failures++;
    attempt.lastAttempt = now;
    if (attempt.failures >= MAX_FAILURES) {
      attempt.lockedUntil = now + LOCKOUT_DURATION_MS;
      this.logger.warn(
        `[ACCOUNT_LOCKOUT] email=${email} failures=${attempt.failures}`,
      );
    }
  }

  private cleanupAttempts(): void {
    const now = Date.now();
    for (const [key, attempt] of this.loginAttempts) {
      if (
        (attempt.lockedUntil && now >= attempt.lockedUntil) ||
        now - attempt.lastAttempt > LOCKOUT_DURATION_MS
      ) {
        this.loginAttempts.delete(key);
      }
    }
  }

  /** Re-check a signed-in user's password before a destructive action. */
  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const hash = await this.loadPasswordHash(userId);
    return !!hash && bcrypt.compare(password, hash);
  }

  // `password` is select: false on User, so it must be fetched on its own.
  private async loadPasswordHash(userId: string): Promise<string> {
    const row = await this.userRepository.findOne({
      where: { id: userId },
      select: { id: true, password: true },
    });
    return row?.password ?? '';
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
      mustChangePassword: user.mustChangePassword,
      // The organization the user works in; null for the platform admin.
      tenant: user.tenant
        ? { id: user.tenant.id, name: user.tenant.name }
        : null,
      isPlatformAdmin:
        !user.tenantId && user.role?.name === ROLE_PLATFORM_ADMIN,
      role: {
        id: user.role.id,
        name: user.role.name,
        permissions: user.role.permissions.map(
          (p) => `${p.resource}:${p.action}`,
        ),
      },
    };
  }
}
