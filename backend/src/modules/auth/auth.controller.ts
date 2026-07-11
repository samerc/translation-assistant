import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Req,
  Res,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { InviteDto } from './dto/invite.dto.js';
import { ForgotPasswordDto, ResetPasswordDto, VerifyResetTokenDto } from './dto/password-reset.dto.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { AdminGuard } from '../../common/guards/admin.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { AdminOnly } from '../../common/decorators/admin-only.decorator.js';

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private getIp(req: Request): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.ip
      || req.socket?.remoteAddress
      || 'unknown';
  }

  private getUA(req: Request): string {
    return req.headers['user-agent'] || 'unknown';
  }

  private setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie('refresh_token', refreshToken, REFRESH_COOKIE_OPTIONS);
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie('refresh_token', { path: '/api/auth' });
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto, this.getIp(req), this.getUA(req));
    this.setRefreshCookie(res, result.refreshToken);
    // Return accessToken in body (stored in localStorage by frontend).
    // refreshToken is in httpOnly cookie only — don't expose in response body.
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.register(dto, this.getIp(req), this.getUA(req));
    this.setRefreshCookie(res, result.refreshToken);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post('refresh')
  @UseGuards(AuthGuard('jwt-refresh'))
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async refresh(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.refreshTokens(
      req.user.sub,
      req.user.refreshToken,
      this.getIp(req),
      this.getUA(req),
    );
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refresh_token;
    await this.authService.logout(req.user.id, refreshToken);
    this.clearRefreshCookie(res);
    return { message: 'Logged out' };
  }

  @Post('logout-everywhere')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async logoutEverywhere(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.logoutEverywhere(req.user.id);
    this.clearRefreshCookie(res);
    return { message: `Logged out of all devices`, ...result };
  }

  @Get('sessions')
  @UseGuards(AuthGuard('jwt'))
  async getActiveSessions(@Req() req: any) {
    return this.authService.getActiveSessions(req.user.id);
  }

  @Delete('sessions/:sessionId')
  @UseGuards(AuthGuard('jwt'))
  async revokeSession(@Req() req: any, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    await this.authService.revokeSession(req.user.id, sessionId);
    return { message: 'Session revoked' };
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  async getProfile(@Req() req: any) {
    return this.authService.getProfile(req.user.id);
  }

  @Post('invite')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard, AdminGuard)
  @RequirePermissions('users:create')
  @AdminOnly()
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  async createInvite(@Body() dto: InviteDto) {
    return this.authService.createInvite(dto.email, dto.roleId);
  }

  @Post('file-token')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async getFileToken(@Req() req: any) {
    return { token: this.authService.generateFileToken(req.user.id) };
  }

  // ── Password Reset ──

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post('verify-reset-token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verifyResetToken(@Body() dto: VerifyResetTokenDto) {
    return this.authService.verifyResetToken(dto.token);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }
}
