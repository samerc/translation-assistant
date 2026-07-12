import {
  IsString,
  IsUUID,
  MinLength,
  MaxLength,
  IsOptional,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { IsStrongPassword } from '../../../common/validators/is-strong-password.js';

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

  @IsStrongPassword()
  newPassword: string;
}
