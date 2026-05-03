import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsIn,
  MinLength,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTemplateDto {
  @IsOptional()
  @IsIn(['designer', 'word'])
  type?: 'designer' | 'word';

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerPage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountedPricePerPage?: number;
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerPage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountedPricePerPage?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  layoutJson?: object;
}
