import { IsString, IsOptional, IsBoolean, IsIn, MinLength, MaxLength } from 'class-validator';

export class CreateLanguageDto {
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsIn(['ltr', 'rtl'])
  direction: 'ltr' | 'rtl';
}

export class UpdateLanguageDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsIn(['ltr', 'rtl'])
  direction?: 'ltr' | 'rtl';

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
