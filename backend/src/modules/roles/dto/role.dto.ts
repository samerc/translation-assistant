import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** What a role may do. `permissions` are `area:action` keys (e.g. `invoices:update`). */
export class CreateRoleDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  @Matches(/^[a-z]+:(read|create|update|delete)$/, { each: true })
  permissions: string[];

  @IsIn(['all', 'assigned'])
  jobScope: 'all' | 'assigned';

  @IsBoolean()
  seesPrices: boolean;
}

export class UpdateRoleDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  @Matches(/^[a-z]+:(read|create|update|delete)$/, { each: true })
  permissions?: string[];

  @IsOptional()
  @IsIn(['all', 'assigned'])
  jobScope?: 'all' | 'assigned';

  @IsOptional()
  @IsBoolean()
  seesPrices?: boolean;
}
