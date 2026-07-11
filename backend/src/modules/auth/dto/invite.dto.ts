import { IsEmail, IsOptional, IsUUID } from 'class-validator';

export class InviteDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsUUID()
  roleId?: string;
}
