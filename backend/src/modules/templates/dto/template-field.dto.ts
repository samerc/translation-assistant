import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsIn,
  IsUUID,
  IsArray,
  ValidateNested,
  MinLength,
  MaxLength,
  Min,
  Max,
  ArrayMaxSize,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

// Same rule as Word placeholders ({holder_name}), so every key can be used in a
// Word template: letters, digits and underscores, not starting with a digit.
export const FIELD_KEY_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const FIELD_KEY_MESSAGE =
  'Keys can only use letters, numbers and underscores, and cannot start with a number (e.g. holder_name)';

export class FieldLabelDto {
  @IsUUID()
  languageId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  label: string;
}

export class CreateTemplateFieldDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(FIELD_KEY_PATTERN, { message: FIELD_KEY_MESSAGE })
  fieldKey: string;

  @IsIn(['text', 'textarea', 'number', 'date', 'image'])
  fieldType: 'text' | 'textarea' | 'number' | 'date' | 'image';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  // '' clears the group
  @ValidateIf((_o, v) => v !== '')
  @Matches(FIELD_KEY_PATTERN, { message: FIELD_KEY_MESSAGE })
  groupKey?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => FieldLabelDto)
  labels?: FieldLabelDto[];
}

export class UpdateTemplateFieldDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(FIELD_KEY_PATTERN, { message: FIELD_KEY_MESSAGE })
  fieldKey?: string;

  @IsOptional()
  @IsIn(['text', 'textarea', 'number', 'date', 'image'])
  fieldType?: 'text' | 'textarea' | 'number' | 'date' | 'image';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  // '' clears the group
  @ValidateIf((_o, v) => v !== '')
  @Matches(FIELD_KEY_PATTERN, { message: FIELD_KEY_MESSAGE })
  groupKey?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => FieldLabelDto)
  labels?: FieldLabelDto[];
}
