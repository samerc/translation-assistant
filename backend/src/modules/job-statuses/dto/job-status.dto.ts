import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  JOB_STAGES,
  STATUS_NOTIFY,
  STATUS_TONES,
} from '../../../common/tenancy/job-stages.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateJobStatusDto {
  @IsIn(JOB_STAGES)
  stage: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @IsIn(STATUS_TONES)
  tone: string;

  @IsIn(STATUS_NOTIFY)
  notify: string;
}

export class UpdateJobStatusDefDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsIn(STATUS_TONES)
  tone?: string;

  @IsOptional()
  @IsIn(STATUS_NOTIFY)
  notify?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  /** Organization: hide a default / switch off its own. Platform: stop offering a default. */
  @IsOptional()
  @IsBoolean()
  hidden?: boolean;
}

export class StageToneDto {
  @IsIn(STATUS_TONES)
  tone: string;
}
