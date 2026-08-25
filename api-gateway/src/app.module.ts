import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TerminusModule } from '@nestjs/terminus';
import { ProxyModule } from './proxy/proxy.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { AuthMiddleware } from './middleware/auth.middleware';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({}),
    TerminusModule,
    ProxyModule,
    RateLimitModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply JWT auth middleware to all protected routes
    // Public routes (auth/register, auth/login) are excluded in the middleware itself
    consumer.apply(AuthMiddleware).forRoutes('*');
  }
}
