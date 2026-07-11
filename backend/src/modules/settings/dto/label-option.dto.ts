import { IsString, IsOptional, IsInt, MinLength, MaxLength, Min, Max, IsIn } from 'class-validator';

export const LABEL_CATEGORIES = ['email', 'phone', 'address'] as const;
export type LabelCategory = (typeof LABEL_CATEGORIES)[number];

export class CreateLabelOptionDto {
  @IsIn(LABEL_CATEGORIES)
  category: LabelCategory;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  value: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class UpdateLabelOptionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  value?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}
