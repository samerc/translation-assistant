import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

/** Platform-wide settings (platform admin): outgoing email and sign-ups. */
export class UpdatePlatformSettingsDto {
  // ── Email / SMTP ──
  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpHost?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort?: number;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpUser?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpPass?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpFrom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  appBaseUrl?: string;

  @IsOptional()
  @IsBoolean()
  signupsEnabled?: boolean;
}
