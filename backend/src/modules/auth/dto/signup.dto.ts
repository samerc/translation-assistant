import {
  Equals,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsStrongPassword } from '../../../common/validators/is-strong-password.js';

/** Public sign-up: creates an organization (pending approval) and its first admin. */
export class SignupDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  organizationName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsStrongPassword()
  password: string;

  @Equals(true, { message: 'Please accept the terms and privacy policy' })
  acceptTerms: boolean;

  // Cloudflare Turnstile response (required when TURNSTILE_SECRET_KEY is set).
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  turnstileToken?: string;
}

export class VerifyEmailDto {
  @IsString()
  @Length(64, 64)
  token: string;
}

export class ResendVerificationDto {
  @IsEmail()
  @MaxLength(255)
  email: string;
}
