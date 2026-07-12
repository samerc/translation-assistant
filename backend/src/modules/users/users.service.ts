import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity.js';
import { Session } from '../auth/entities/session.entity.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto, ChangePasswordDto } from './dto/update-user.dto.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
  ) {}

  /** Revoke all active sessions for a user and clear the legacy refresh token. */
  private async revokeAllSessions(userId: string): Promise<void> {
    await this.sessionRepository.update({ userId, revoked: false }, { revoked: true });
    await this.userRepository.update(userId, { refreshToken: '' });
  }

  async findAll(): Promise<Partial<User>[]> {
    const users = await this.userRepository.find({
      relations: ['role', 'role.permissions'],
    });
    // Drop the (potentially large) base64 logo from list responses — it's only
    // needed on the single-user branding form, served by findOne().
    return users.map((u) => {
      const { logo, ...rest } = this.sanitize(u);
      return rest;
    });
  }

  async findOne(id: string): Promise<Partial<User>> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['role', 'role.permissions'],
    });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }

  async create(dto: CreateUserDto): Promise<Partial<User>> {
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (existing) throw new BadRequestException('Email already in use');

    const hashedPassword = await bcrypt.hash(dto.password, 12);
    const user = this.userRepository.create({
      ...dto,
      password: hashedPassword,
    });

    const saved = await this.userRepository.save(user);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateUserDto): Promise<Partial<User>> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    await this.userRepository.update(id, dto);
    return this.findOne(id);
  }

  /** Set (data URL) or clear (null) the user's invoice logo. */
  async setLogo(id: string, logo: string | null): Promise<Partial<User>> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    await this.userRepository.update(id, { logo: logo as any });
    return this.findOne(id);
  }

  async changePassword(id: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const passwordValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!passwordValid) throw new BadRequestException('Current password is incorrect');

    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);
    await this.userRepository.update(id, { password: hashedPassword });
    // Force re-login everywhere after a password change (a stolen session must not survive).
    await this.revokeAllSessions(id);
  }

  async deactivate(id: string): Promise<Partial<User>> {
    const result = await this.update(id, { isActive: false });
    // Cut off existing sessions immediately, not just at token expiry.
    await this.revokeAllSessions(id);
    return result;
  }

  async activate(id: string): Promise<Partial<User>> {
    return this.update(id, { isActive: true });
  }

  async remove(id: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    await this.userRepository.remove(user);
  }

  private sanitize(user: User) {
    const { password, refreshToken, ...result } = user;
    return result;
  }
}
