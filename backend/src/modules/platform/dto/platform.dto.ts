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
}

export class ListTenantsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['pending', 'active', 'suspended'])
  status?: 'pending' | 'active' | 'suspended';
}
