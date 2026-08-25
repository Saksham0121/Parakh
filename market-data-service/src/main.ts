import { initTracing } from '@parakh/common';
initTracing('market-data-service');

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createLogger } from '@parakh/common';

async function bootstrap() {
  const logger = createLogger({ service: 'market-data-service' });
  const port = process.env.MARKET_DATA_SERVICE_PORT || 3002;

  const app = await NestFactory.create(AppModule);
  app.enableCors();

  await app.listen(port);
  logger.info(`Market data service running on port ${port}`);
}

bootstrap();
