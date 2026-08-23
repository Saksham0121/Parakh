import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PriceGateway } from './gateways/price.gateway';
import { KafkaConsumerService } from './kafka/kafka-consumer.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [PriceGateway, KafkaConsumerService],
})
export class AppModule {}
