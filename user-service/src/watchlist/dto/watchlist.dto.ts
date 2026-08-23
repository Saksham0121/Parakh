import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class AddWatchlistDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{1,5}$/, { message: 'Symbol must be 1-5 uppercase letters (e.g., AAPL, MSFT)' })
  symbol!: string;
}
