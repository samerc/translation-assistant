import {
  IsEmail,
  IsString,
  IsUUID,
  MinLength,
  MaxLength,
  IsOptional,
} from 'class-validator';
import { IsNotCommonPassword } from '../../../common/validators/is-not-common-password.js';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @IsNotCommonPassword()
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
