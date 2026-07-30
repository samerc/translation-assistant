import {
  IsEmail,
  IsString,
  IsUUID,
  MinLength,
  MaxLength,
  IsOptional,
} from 'class-validator';
import { IsStrongPassword } from '../../../common/validators/is-strong-password.js';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsStrongPassword()
  password: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @IsUUID()
  roleId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar?: string;
}
