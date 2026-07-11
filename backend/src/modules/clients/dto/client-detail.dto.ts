import { IsString, IsOptional, IsBoolean, MinLength, MaxLength, IsEmail } from 'class-validator';

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
  @MinLength(1)
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
  @MinLength(1)
  @MaxLength(1000)
  address: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
