import { Module } from '@nestjs/common';
import { BacktestService } from './backtest.service';
import { BacktestController } from './backtest.controller';
import { BacktestWorkerService } from './backtest-worker.service';

@Module({
  controllers: [BacktestController],
  providers: [BacktestService, BacktestWorkerService],
})
export class BacktestModule {}
