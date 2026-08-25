import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SetupModule } from './setup/setup.module';
import { PrismaModule } from './prisma/prisma.module';

import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsInterceptor, HttpRequestDurationProvider } from '@parakh/common';


@Module({
  imports: [
    PrometheusModule.register(),
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    SetupModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule {}
