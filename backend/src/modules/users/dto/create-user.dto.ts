import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsInt,
  IsOptional,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @IsInt()
  roleId: number;

  @IsOptional()
  @IsString()
  avatar?: string;
}
