import { Module } from '@nestjs/common';
import { AlertService } from './alert.service';
import { AlertController } from './alert.controller';
import { AlertConsumerService } from './alert-consumer.service';

@Module({
  controllers: [AlertController],
  providers: [AlertService, AlertConsumerService],
})
export class AlertModule {}
