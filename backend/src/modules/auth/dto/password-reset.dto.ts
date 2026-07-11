import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { IsNotCommonPassword } from '../../../common/validators/is-not-common-password.js';

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @MaxLength(128)
  token: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @IsNotCommonPassword()
  newPassword: string;
}

export class VerifyResetTokenDto {
  @IsString()
  @MaxLength(128)
  token: string;
}
