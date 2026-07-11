import {
  IsString,
  IsUUID,
  MinLength,
  MaxLength,
  IsOptional,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { IsNotCommonPassword } from '../../../common/validators/is-not-common-password.js';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar?: string;

  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(['indigo', 'ocean', 'teal', 'slate'])
  colorPalette?: string;

  @IsOptional()
  @IsBoolean()
  darkMode?: boolean;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @IsNotCommonPassword()
  newPassword: string;
}
