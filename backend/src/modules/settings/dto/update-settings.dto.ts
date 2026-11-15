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
  IsIn,
  IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';

export const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];

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

  // The logo is uploaded through PATCH /settings/logo (validated image), never here.

  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyTaxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bankDetails?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  invoiceFooter?: string;

  @IsOptional()
  @IsIn(DATE_FORMATS, {
    message: 'Date format must be DD/MM/YYYY, MM/DD/YYYY or YYYY-MM-DD',
  })
  dateFormat?: string;

  @IsOptional()
  @IsBoolean()
  translatorsSeePrices?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
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
