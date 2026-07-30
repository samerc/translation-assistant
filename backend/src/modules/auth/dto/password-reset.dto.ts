import { IsEmail, IsString, MaxLength } from 'class-validator';
import { IsStrongPassword } from '../../../common/validators/is-strong-password.js';

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @MaxLength(128)
  token: string;

  @IsStrongPassword()
  newPassword: string;
}

export class VerifyResetTokenDto {
  @IsString()
  @MaxLength(128)
  token: string;
}
