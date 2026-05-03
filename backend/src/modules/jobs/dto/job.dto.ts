import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  IsBoolean,
  IsIn,
  IsDateString,
  MinLength,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateJobDto {
  @IsOptional()
  @IsIn(['template', 'freeform'])
  type?: 'template' | 'freeform';

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  clientId: number;

  @IsOptional()
  @IsInt()
  contactId?: number;

  @IsInt()
  sourceLanguageId: number;

  @IsInt()
  targetLanguageId: number;

  @IsOptional()
  @IsIn(['quote', 'accepted', 'in_progress', 'delivered', 'invoiced', 'paid', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageCount?: number;

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
  useDiscountedPrice?: boolean;

  @IsOptional()
  @IsNumber()
  finalPrice?: number;

  @IsOptional()
  @IsBoolean()
  isFreeOfCharge?: boolean;

  @IsOptional()
  @IsString()
  freeOfChargeReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  paymentCurrency?: string;

  @IsOptional()
  @IsNumber()
  paymentAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateJobDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  contactId?: number;

  @IsOptional()
  @IsIn(['quote', 'accepted', 'in_progress', 'delivered', 'invoiced', 'paid', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageCount?: number;

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
  useDiscountedPrice?: boolean;

  @IsOptional()
  @IsNumber()
  finalPrice?: number;

  @IsOptional()
  @IsBoolean()
  isFreeOfCharge?: boolean;

  @IsOptional()
  @IsString()
  freeOfChargeReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  paymentCurrency?: string;

  @IsOptional()
  @IsNumber()
  paymentAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
