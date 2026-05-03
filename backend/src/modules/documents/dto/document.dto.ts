import {
  IsInt,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FieldValueDto {
  @IsString()
  templateFieldId: string;

  @IsOptional()
  @IsInt()
  pageNumber?: number;

  @IsOptional()
  @IsInt()
  entryIndex?: number;

  @IsString()
  value: string;
}

export class CreateDocumentDto {
  @IsString()
  jobId: string;

  @IsString()
  templateId: string;

  @IsOptional()
  @IsString()
  clonedFromId?: string;
}

export class SaveFieldValuesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldValueDto)
  values: FieldValueDto[];
}

export class UpdateDocumentStatusDto {
  @IsIn(['draft', 'completed'])
  status: 'draft' | 'completed';
}
