import { Module } from '@nestjs/common';
import { FundamentalsSchedulerService } from './fundamentals-scheduler.service';
import { FundamentalsController } from './fundamentals.controller';

@Module({
  controllers: [FundamentalsController],
  providers: [FundamentalsSchedulerService],
})
export class FundamentalsModule {}
