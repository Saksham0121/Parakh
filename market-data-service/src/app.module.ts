import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { FinnhubModule } from './finnhub/finnhub.module';
import { MarketController } from './market/market.controller';
import { MarketService } from './market/market.service';
import { KafkaProducerModule } from './kafka/kafka-producer.module';
import { RedisModule } from './redis/redis.module';

import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsInterceptor } from '@parakh/common';


@Module({
  imports: [
    PrometheusModule.register(),
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    FinnhubModule,
    KafkaProducerModule,
    RedisModule,
  ],
  controllers: [MarketController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },MarketService],
})
export class AppModule {}
