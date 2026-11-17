import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class MoneyDto {
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsString()
  currency!: string;
}

export class CreateTransferDto {
  @IsString()
  sourceAccountId!: string;

  @IsString()
  destinationAccountId!: string;

  @ValidateNested()
  @Type(() => MoneyDto)
  amount!: MoneyDto;

  @IsIn(['OWN', 'INTERBANK'])
  kind!: 'OWN' | 'INTERBANK';

  @IsOptional()
  @IsString()
  description?: string;
}
