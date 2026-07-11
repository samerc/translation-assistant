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
} from 'class-validator';
import { Type } from 'class-transformer';

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
  groupKey?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => FieldLabelDto)
  labels?: FieldLabelDto[];
}
