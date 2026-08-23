import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createLogger } from '@parakh/common';

async function bootstrap() {
  const logger = createLogger({ service: 'backtest-service' });
  const port = process.env.BACKTEST_SERVICE_PORT || 3007;

  const app = await NestFactory.create(AppModule);
  app.enableCors();

  await app.listen(port);
  logger.info(`Backtest service running on port ${port}`);
}

bootstrap();
