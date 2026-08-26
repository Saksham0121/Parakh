import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { YahooFinanceModule } from './yahoo-finance/yahoo-finance.module';
import { MarketController } from './market/market.controller';
import { MarketService } from './market/market.service';
import { KafkaProducerModule } from './kafka/kafka-producer.module';
import { RedisModule } from './redis/redis.module';

import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsInterceptor, HttpRequestDurationProvider } from '@parakh/common';

@Module({
  imports: [
    PrometheusModule.register(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env', '../../.env'],
    }),
    ScheduleModule.forRoot(),
    YahooFinanceModule,
    KafkaProducerModule,
    RedisModule,
  ],
  controllers: [MarketController],
  providers: [
    HttpRequestDurationProvider,
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    MarketService,
  ],
})
export class AppModule {}
