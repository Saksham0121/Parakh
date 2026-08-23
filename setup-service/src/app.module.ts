import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SetupModule } from './setup/setup.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    SetupModule,
  ],
})
export class AppModule {}
