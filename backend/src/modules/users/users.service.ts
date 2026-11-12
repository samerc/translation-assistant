import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { User } from './entities/user.entity.js';
import { Role } from '../roles/entities/role.entity.js';
import { Session } from '../auth/entities/session.entity.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto, ChangePasswordDto } from './dto/update-user.dto.js';
import { TENANT_ROLES } from '../../common/tenancy/roles.js';

/**
 * Who may be managed: a tenant admin manages the users of their own tenant;
 * the platform admin ('platform') manages tenant users of any tenant, but not
 * other platform admins.
 */
export type UserScope = { tenantId: string } | 'platform';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
  ) {}

  /** Revoke all active sessions for a user and clear the legacy refresh token. */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.sessionRepository.update(
      { userId, revoked: false },
      { revoked: true },
    );
    await this.userRepository.update(userId, { refreshToken: '' });
  }

  private scopeWhere(scope: UserScope) {
    return scope === 'platform'
      ? { tenantId: Not(IsNull()) }
      : { tenantId: scope.tenantId };
  }

  /** The user, if it falls inside the scope (else 404 — never "exists elsewhere"). */
  private async findScoped(id: string, scope: UserScope): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id, ...this.scopeWhere(scope) },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Only Admin / Translator / Viewer can be given inside a tenant. */
  private async assertTenantRole(roleId: string): Promise<void> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId, name: In(TENANT_ROLES) },
    });
    if (!role) throw new BadRequestException('Role not found');
  }

  async findAll(tenantId: string): Promise<Partial<User>[]> {
    const users = await this.userRepository.find({
      where: { tenantId },
      relations: {
        role: {
          permissions: true,
        },
      },
      order: { firstName: 'ASC', lastName: 'ASC' },
    });
    // Drop the (potentially large) base64 logo from list responses — it's only
    // needed on the single-user branding form, served by findOne().
    return users.map((u) => {
      const { logo, ...rest } = this.sanitize(u);
      return rest;
    });
  }

  /** One user of the caller's tenant (admin view). */
  async findInTenant(id: string, tenantId: string): Promise<Partial<User>> {
    await this.findScoped(id, { tenantId });
    return this.findOne(id);
  }

  /** Unscoped by id: only for the caller's own profile and after a scoped check. */
  async findOne(id: string): Promise<Partial<User>> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: {
        role: {
          permissions: true,
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }

  async create(dto: CreateUserDto, tenantId: string): Promise<Partial<User>> {
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (existing) throw new BadRequestException('Email already in use');
    await this.assertTenantRole(dto.roleId);

    const hashedPassword = await bcrypt.hash(dto.password, 12);
    const user = this.userRepository.create({
      ...dto,
      password: hashedPassword,
      tenantId,
      emailVerified: true,
    });

    const saved = await this.userRepository.save(user);
    return this.findOne(saved.id);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    scope: UserScope,
  ): Promise<Partial<User>> {
    await this.findScoped(id, scope);
    if (dto.roleId) await this.assertTenantRole(dto.roleId);
    return this.applyUpdate(id, dto);
  }

  /** The caller editing their own profile (role / active status stripped by the controller). */
  updateSelf(id: string, dto: UpdateUserDto): Promise<Partial<User>> {
    return this.applyUpdate(id, dto);
  }

  private async applyUpdate(
    id: string,
    dto: UpdateUserDto,
  ): Promise<Partial<User>> {
    await this.userRepository.update(id, dto);
    // Deactivating cuts off existing sessions immediately, whichever endpoint did it.
    if (dto.isActive === false) await this.revokeAllSessions(id);
    return this.findOne(id);
  }

  /** Set (data URL) or clear (null) the user's own invoice logo. */
  async setLogo(id: string, logo: string | null): Promise<Partial<User>> {
    await this.userRepository.update(id, { logo });
    return this.findOne(id);
  }

  async changePassword(id: string, dto: ChangePasswordDto): Promise<void> {
    // password is select: false on User — ask for it explicitly.
    const user = await this.userRepository.findOne({
      where: { id },
      select: { id: true, password: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const passwordValid = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );
    if (!passwordValid)
      throw new BadRequestException('Current password is incorrect');

    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);
    await this.userRepository.update(id, {
      password: hashedPassword,
      mustChangePassword: false,
    });
    // Force re-login everywhere after a password change (a stolen session must not survive).
    await this.revokeAllSessions(id);
  }

  /**
   * Admin-issued temporary password, for when a user is locked out and email
   * reset isn't available. Shown to the admin once; the user must change it at
   * next login (mustChangePassword) and all their sessions end now.
   */
  async resetPasswordByAdmin(
    id: string,
    scope: UserScope,
  ): Promise<{ temporaryPassword: string }> {
    await this.findScoped(id, scope);
    // 16 random chars + one of each class the password rules require.
    const temporaryPassword = `${randomBytes(12).toString('base64url')}a7K!`;
    await this.userRepository.update(id, {
      password: await bcrypt.hash(temporaryPassword, 12),
      mustChangePassword: true,
    });
    await this.revokeAllSessions(id);
    return { temporaryPassword };
  }

  async deactivate(id: string, scope: UserScope): Promise<Partial<User>> {
    return this.update(id, { isActive: false }, scope); // also revokes sessions
  }

  async activate(id: string, scope: UserScope): Promise<Partial<User>> {
    return this.update(id, { isActive: true }, scope);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const user = await this.findScoped(id, { tenantId });
    await this.userRepository.remove(user);
  }

  private sanitize(user: User) {
    const { password, refreshToken, ...result } = user;
    return result;
  }
}
