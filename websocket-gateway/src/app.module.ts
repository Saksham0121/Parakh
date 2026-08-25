import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PriceGateway } from './gateways/price.gateway';
import { KafkaConsumerService } from './kafka/kafka-consumer.service';

import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsInterceptor } from '@parakh/common';


@Module({
  imports: [
    PrometheusModule.register(),ConfigModule.forRoot({ isGlobal: true })],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },PriceGateway, KafkaConsumerService],
})
export class AppModule {}
