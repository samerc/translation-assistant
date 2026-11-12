import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsEmail } from 'class-validator';
import { MailService } from './mail.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';

class SendTestEmailDto {
  @IsEmail()
  to: string;
}

@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('test')
  // SMTP is platform-wide, so testing it is a platform-admin action.
  @UseGuards(AuthGuard('jwt'), PermissionsGuard, PlatformAdminGuard)
  @RequirePermissions('platform:update')
  @HttpCode(HttpStatus.OK)
  async sendTest(@Body() dto: SendTestEmailDto) {
    await this.mailService.sendTestEmail(dto.to);
    return { message: `Test email sent to ${dto.to}` };
  }
}
