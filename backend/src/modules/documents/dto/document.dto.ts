import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsArray,
  ValidateNested,
  IsIn,
  MaxLength,
  Min,
  Max,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FieldValueDto {
  @IsUUID()
  templateFieldId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  pageNumber?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  entryIndex?: number;

  @IsString()
  @MaxLength(50000)
  value: string;
}

export class CreateDocumentDto {
  @IsUUID()
  jobId: string;

  @IsUUID()
  templateId: string;

  @IsOptional()
  @IsUUID()
  clonedFromId?: string;
}

export class SaveFieldValuesDto {
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => FieldValueDto)
  values: FieldValueDto[];
}

export class UpdateDocumentStatusDto {
  @IsIn(['draft', 'completed'])
  status: 'draft' | 'completed';
}

export class CloneDocumentDto {
  @IsUUID()
  jobId: string;
}
