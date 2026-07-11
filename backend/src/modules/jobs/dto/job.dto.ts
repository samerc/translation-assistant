import {
  IsString, IsOptional, IsInt, IsNumber, IsBoolean, IsIn, IsUUID,
  IsDateString, IsArray, ValidateNested, MinLength, MaxLength, Min, Max,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class JobLineItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  description: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  pageCount: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(999999.99)
  pricePerPage: number;

  @IsOptional()
  @IsBoolean()
  useDiscountedPrice?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(999999.99)
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
  @MaxLength(2000)
  description?: string;

  @IsUUID()
  clientId: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsUUID()
  sourceLanguageId: string;

  @IsOptional()
  @IsUUID()
  targetLanguageId?: string;

  @IsOptional()
  @IsIn(['quote', 'accepted', 'in_progress'])
  status?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(99999999.99)
  finalPrice?: number;

  @IsOptional()
  @IsBoolean()
  isFreeOfCharge?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  freeOfChargeReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
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
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsIn(['quote', 'accepted', 'in_progress', 'delivered', 'invoiced', 'paid', 'lost', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(99999999.99)
  finalPrice?: number;

  @IsOptional()
  @IsBoolean()
  isFreeOfCharge?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  freeOfChargeReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  paymentCurrency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(99999999.99)
  paymentAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

// ── DTOs for inline @Body() endpoints ──

export class UpdateJobStatusDto {
  @IsIn(['quote', 'accepted', 'in_progress', 'delivered', 'invoiced', 'paid', 'lost', 'cancelled'])
  status: string;
}

export class CreateJobLineItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  description: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  pageCount: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(999999.99)
  pricePerPage: number;

  @IsOptional()
  @IsBoolean()
  useDiscountedPrice?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(999999.99)
  discountedPricePerPage?: number;
}

export class UpdateJobLineItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  pageCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(999999.99)
  pricePerPage?: number;

  @IsOptional()
  @IsBoolean()
  useDiscountedPrice?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(999999.99)
  discountedPricePerPage?: number;
}

export class AssignJobUserDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsIn(['view', 'edit'])
  permissionLevel?: 'view' | 'edit';
}

export class LinkFileDto {
  @IsUUID()
  sourceJobId: string;

  @IsUUID()
  fileId: string;
}

export class UploadFileCategoryDto {
  @IsOptional()
  @IsIn(['source', 'translated'])
  category?: 'source' | 'translated';
}
