import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class AddWatchlistDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9.\-_:]{1,25}$/, { message: 'Symbol must be a valid ticker (e.g. AAPL, RELIANCE.NS, BTC-USD)' })
  symbol!: string;
}

