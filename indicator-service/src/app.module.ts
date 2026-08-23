import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IndicatorModule } from './indicator/indicator.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    IndicatorModule,
  ],
})
export class AppModule {}
