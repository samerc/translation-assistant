import { IsString, IsOptional, IsBoolean, MaxLength, IsEmail, IsIn } from 'class-validator';

export const EMAIL_LABELS = ['Work', 'Personal', 'Other'] as const;
export const PHONE_LABELS = ['Work', 'Mobile', 'Home', 'Fax', 'Other'] as const;
export const ADDRESS_LABELS = ['Work', 'Home', 'Billing', 'Shipping', 'Other'] as const;

export class CreateClientEmailDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsIn(EMAIL_LABELS)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateClientPhoneDto {
  @IsString()
  @MaxLength(50)
  phone: string;

  @IsOptional()
  @IsIn(PHONE_LABELS)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateClientAddressDto {
  @IsString()
  address: string;

  @IsOptional()
  @IsIn(ADDRESS_LABELS)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
