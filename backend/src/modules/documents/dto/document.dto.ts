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
  @IsInt()
  templateFieldId: number;

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
  @IsInt()
  jobId: number;

  @IsInt()
  templateId: number;

  @IsOptional()
  @IsInt()
  clonedFromId?: number;
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
