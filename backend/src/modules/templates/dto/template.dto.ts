import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsIn,
  IsArray,
  IsUUID,
  ValidateNested,
  MinLength,
  MaxLength,
  Min,
  Max,
  ArrayMaxSize,
  Matches,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FIELD_KEY_PATTERN } from './template-field.dto.js';

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

  /** false = draft (the setup wizard activates it at the end). */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** The languages the document is produced in. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  languageIds?: string[];

  /** Languages documents are translated from (none = any). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  sourceLanguageIds?: string[];
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

  /** The languages the document is produced in. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  languageIds?: string[];

  /** Languages documents are translated from (none = any). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  sourceLanguageIds?: string[];
}

/** Sample values for a test export (nothing is saved). */
export class TestExportValueDto {
  @IsUUID()
  templateFieldId: string;

  @IsString()
  @MaxLength(5000)
  value: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(499)
  entryIndex?: number;
}

export class TestExportDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => TestExportValueDto)
  values: TestExportValueDto[];

  /** Which document language to render labels / direction in. */
  @IsOptional()
  @IsUUID()
  languageId?: string;
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
  @Matches(FIELD_KEY_PATTERN)
  fieldKey: string;
}

export class WordPlaceholdersDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => WordPlaceholderItemDto)
  placeholders: WordPlaceholderItemDto[];
}

// ── Editing the Word file on the page (setup wizard) ──

/** Where on the page the user selected — see word-edit.ts. */
export class WordSpotDto {
  @IsString()
  @MaxLength(20000)
  paragraphText: string;

  @IsInt()
  @Min(0)
  occurrence: number;

  @IsInt()
  @Min(0)
  start: number;

  @IsInt()
  @Min(1)
  end: number;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string;
}

export class MarkWordFieldDto {
  @ValidateNested()
  @Type(() => WordSpotDto)
  spot: WordSpotDto;

  @IsString()
  @MaxLength(100)
  @Matches(FIELD_KEY_PATTERN)
  fieldKey: string;

  /** Label of a new field, in `languageId` (the template's first document language). */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;

  @IsOptional()
  @IsUUID()
  languageId?: string;
}

export class UnmarkWordFieldDto {
  @ValidateNested()
  @Type(() => WordSpotDto)
  spot: WordSpotDto;

  /** The text to put back (what was there before it became a field). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  restore?: string;
}

export class RepeatWordRowDto {
  @ValidateNested()
  @Type(() => WordSpotDto)
  spot: WordSpotDto;

  @IsString()
  @MaxLength(100)
  @Matches(FIELD_KEY_PATTERN)
  groupKey: string;
  /** Example rows right below to delete (same cells; counted on the page). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  removeBelow?: number;
}

export class UnrepeatWordRowDto {
  @ValidateNested()
  @Type(() => WordSpotDto)
  spot: WordSpotDto;
}
