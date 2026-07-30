import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsEmail } from 'class-validator';
import { MailService } from './mail.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { AdminGuard } from '../../common/guards/admin.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { AdminOnly } from '../../common/decorators/admin-only.decorator.js';

class SendTestEmailDto {
  @IsEmail()
  to: string;
}

@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('test')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard, AdminGuard)
  @RequirePermissions('settings:update')
  @AdminOnly()
  @HttpCode(HttpStatus.OK)
  async sendTest(@Body() dto: SendTestEmailDto) {
    await this.mailService.sendTestEmail(dto.to);
    return { message: `Test email sent to ${dto.to}` };
  }
}
