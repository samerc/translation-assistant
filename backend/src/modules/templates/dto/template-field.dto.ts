import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsIn,
  IsArray,
  ValidateNested,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FieldLabelDto {
  @IsInt()
  languageId: number;

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
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  isRepeatable?: boolean;

  @IsOptional()
  @IsArray()
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
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  isRepeatable?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldLabelDto)
  labels?: FieldLabelDto[];
}
