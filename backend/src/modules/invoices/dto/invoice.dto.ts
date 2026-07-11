import {
  IsString, IsOptional, IsNumber, IsUUID, IsArray, ValidateNested,
  IsDateString, MinLength, MaxLength, Min, Max, IsIn, ArrayMinSize, ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateInvoiceItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description: string;

  @IsOptional()
  @IsUUID()
  jobId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(999999.99)
  quantity: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(99999999.99)
  unitPrice: number;
}

export class CreateInvoiceDto {
  @IsUUID()
  clientId: string;

  @IsDateString()
  issueDate: string;

  @IsDateString()
  dueDate: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  taxRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Invoice must have at least one item' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];
}

export class UpdateInvoiceDto {
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  taxRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items?: CreateInvoiceItemDto[];
}

export class UpdateInvoiceStatusDto {
  @IsIn(['draft', 'sent', 'paid', 'overdue', 'cancelled'])
  status: string;
}

export class RecordPaymentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(99999999.99)
  paidAmount: number;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
