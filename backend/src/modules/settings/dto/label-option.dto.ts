import { IsString, IsOptional, IsInt, MinLength, MaxLength, IsIn } from 'class-validator';

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
  sortOrder?: number;
}
