import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  Min,
  Max,
  MaxLength,
  ArrayMaxSize,
  Matches,
} from 'class-validator';

/** A tenant's own settings (tenant admin). */
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
  @MaxLength(255) // column is varchar(255)
  companyLogo?: string;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/, {
    message: 'Base currency must be a 3-letter code, like USD, EUR or AED',
  })
  baseCurrency?: string;

  @IsOptional()
  @IsString()
  // invoiceNumber is varchar(20): prefix + at least 4-5 digits must fit
  @MaxLength(15)
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

  // '' = leave unchanged (GET never returns it); null = remove the stored key.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  googleTranslateApiKey?: string | null;
}
