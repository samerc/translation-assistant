import {
  IsString, IsOptional, IsInt, IsNumber, IsBoolean, IsIn,
  IsDateString, IsArray, ValidateNested, MinLength, MaxLength, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class JobLineItemDto {
  @IsString()
  @MaxLength(255)
  description: string;

  @IsOptional()
  @IsInt()
  templateId?: number;

  @IsOptional()
  @IsInt()
  freeformJobTypeId?: number;

  @IsInt()
  @Min(1)
  pageCount: number;

  @IsNumber()
  @Min(0)
  pricePerPage: number;

  @IsOptional()
  @IsBoolean()
  useDiscountedPrice?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountedPricePerPage?: number;
}

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
  @IsIn(['quote', 'accepted', 'in_progress'])
  status?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

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
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JobLineItemDto)
  lineItems?: JobLineItemDto[];
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
  @IsIn(['quote', 'accepted', 'in_progress', 'delivered', 'invoiced', 'paid', 'lost', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

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
