import { Module } from '@nestjs/common';
import { SetupService } from './setup.service';
import { SetupController } from './setup.controller';
import { SetupMatcherService } from './setup-matcher.service';

@Module({
  controllers: [SetupController],
  providers: [SetupService, SetupMatcherService],
})
export class SetupModule {}
