import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  ArrayMaxSize,
  Matches,
} from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  companyAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  companyLogo?: string;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/, {
    message: 'baseCurrency must be a 3-letter ISO code (e.g. USD)',
  })
  baseCurrency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  invoicePrefix?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxUploadSizeMb?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  allowedFileTypes?: string[];

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
}
