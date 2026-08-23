import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AlertModule } from './alert/alert.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AlertModule,
  ],
})
export class AppModule {}
