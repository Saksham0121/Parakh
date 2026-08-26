import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IndicatorModule } from './indicator/indicator.module';

import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsInterceptor, HttpRequestDurationProvider } from '@parakh/common';


@Module({
  imports: [
    PrometheusModule.register(),
    ConfigModule.forRoot({ isGlobal: true }),
    IndicatorModule,
  ],
  providers: [
    HttpRequestDurationProvider,
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule {}
