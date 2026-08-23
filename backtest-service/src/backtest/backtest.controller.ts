import { Controller, Post, Get, Body, Param, Req, UnauthorizedException } from '@nestjs/common';
import { BacktestService } from './backtest.service';
import { Request } from 'express';

@Controller('backtests')
export class BacktestController {
  constructor(private backtestService: BacktestService) {}

  private getUserId(req: Request): string {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) throw new UnauthorizedException();
    return userId;
  }

  @Post()
  async createRun(@Req() req: Request, @Body() body: any) {
    return this.backtestService.triggerBacktest(
      this.getUserId(req),
      body.setupId,
      body.symbol,
      body.startDate,
      body.endDate
    );
  }

  @Get(':runId')
  async getRun(@Req() req: Request, @Param('runId') runId: string) {
    return this.backtestService.getBacktestRun(this.getUserId(req), runId);
  }

  @Get('leaderboard/top')
  async getLeaderboard() {
    return this.backtestService.getSetupRankings();
  }
}
