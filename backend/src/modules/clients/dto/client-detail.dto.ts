import { IsString, IsOptional, IsBoolean, MaxLength, IsEmail } from 'class-validator';

export class CreateClientEmailDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
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
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateClientAddressDto {
  @IsString()
  address: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
