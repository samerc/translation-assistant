import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { IsNotCommonPassword } from '../../../common/validators/is-not-common-password.js';

export class RegisterDto {
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

  @IsString()
  @MaxLength(500)
  inviteToken: string;
}
