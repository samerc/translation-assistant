import { IsString, IsOptional, IsNumber, IsBoolean, MinLength, MaxLength, Min, Max } from 'class-validator';

export class CreateFreeformJobTypeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999999.99)
  pricePerPage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999999.99)
  discountedPricePerPage?: number;
}

export class UpdateFreeformJobTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999999.99)
  pricePerPage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999999.99)
  discountedPricePerPage?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
