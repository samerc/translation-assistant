import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  Min,
  Max,
  MaxLength,
  ArrayMaxSize,
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
  @IsString()
  @MaxLength(10)
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
}
