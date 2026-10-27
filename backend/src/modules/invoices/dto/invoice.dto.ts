import {
  IsString,
  IsOptional,
  IsNumber,
  IsUUID,
  IsArray,
  ValidateNested,
  IsDateString,
  MinLength,
  MaxLength,
  Min,
  Max,
  IsIn,
  ArrayMinSize,
  ArrayMaxSize,
  Matches,
  IsEmail,
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
  @Matches(/^[A-Z]{3}$/, {
    message: 'Currency must be a 3-letter code, like USD, EUR or AED',
  })
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
  @Matches(/^[A-Z]{3}$/, {
    message: 'Currency must be a 3-letter code, like USD, EUR or AED',
  })
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
  /** This payment's amount (may be part of the balance). */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99999999.99)
  paidAmount: number;

  /** Date received (YYYY-MM-DD); defaults to today. */
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  method?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class SendInvoiceEmailDto {
  @IsOptional()
  @IsEmail()
  email?: string; // defaults to the client's primary email when omitted

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
