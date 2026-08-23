import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { FinnhubModule } from './finnhub/finnhub.module';
import { MarketController } from './market/market.controller';
import { MarketService } from './market/market.service';
import { KafkaProducerModule } from './kafka/kafka-producer.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    FinnhubModule,
    KafkaProducerModule,
    RedisModule,
  ],
  controllers: [MarketController],
  providers: [MarketService],
})
export class AppModule {}
