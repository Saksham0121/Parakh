import { Controller, Get, Param, Query } from '@nestjs/common';
import { IndicatorService } from './indicator.service';

@Controller('indicators')
export class IndicatorController {
  constructor(private indicatorService: IndicatorService) {}

  @Get(':symbol')
  async getAllIndicators(@Param('symbol') symbol: string) {
    return this.indicatorService.getAllIndicators(symbol.toUpperCase());
  }

  @Get(':symbol/:type')
  async getIndicator(
    @Param('symbol') symbol: string,
    @Param('type') type: string,
    @Query('period') period?: string,
  ) {
    const params: Record<string, number> = {};
    if (period) params.period = parseInt(period);

    return this.indicatorService.getLatestIndicator(
      symbol.toUpperCase(),
      type.toUpperCase(),
      params,
    );
  }
}
