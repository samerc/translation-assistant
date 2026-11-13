import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  /** The organization's first admin — invited by email. */
  @IsEmail()
  @MaxLength(255)
  adminEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  adminFirstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  adminLastName?: string;
}

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;
}

export class TenantInviteDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  /** Defaults to Admin (the usual reason: a tenant lost its admin). */
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;
}

export class ListTenantsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['pending', 'active', 'suspended', 'closing'])
  status?: 'pending' | 'active' | 'suspended' | 'closing';
}

export class DeclineDeletionDto {
  /** Optional note emailed to the admin who asked. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class RequestDeletionDto {
  @IsString()
  @MaxLength(150)
  confirmName: string;

  @IsString()
  @MaxLength(200)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
