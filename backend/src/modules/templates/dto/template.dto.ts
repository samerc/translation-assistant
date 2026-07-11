import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsIn,
  IsArray,
  IsUUID,
  IsObject,
  ValidateNested,
  MinLength,
  MaxLength,
  Min,
  Max,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTemplateDto {
  @IsOptional()
  @IsIn(['designer', 'word', 'simple'])
  type?: 'designer' | 'word' | 'simple';

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999999.99)
  pricePerPage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999999.99)
  discountedPricePerPage?: number;
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999999.99)
  pricePerPage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999999.99)
  discountedPricePerPage?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  layoutJson?: object[];
}

// ── DTOs for inline @Body() endpoints ──

export class ReorderFieldsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  fieldIds: string[];
}

export class WordPlaceholderItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  find: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  fieldKey: string;
}

export class WordPlaceholdersDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => WordPlaceholderItemDto)
  placeholders: WordPlaceholderItemDto[];
}
