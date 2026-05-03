import { IsString, IsOptional, IsNumber, IsBoolean, MinLength, MaxLength, Min } from 'class-validator';

export class CreateFreeformJobTypeDto {
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

export class UpdateFreeformJobTypeDto {
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
}
