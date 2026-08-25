import { initTracing } from '@parakh/common';
initTracing('indicator-service');

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createLogger } from '@parakh/common';

async function bootstrap() {
  const logger = createLogger({ service: 'indicator-service' });
  const port = process.env.INDICATOR_SERVICE_PORT || 3003;

  const app = await NestFactory.create(AppModule);
  app.enableCors();

  await app.listen(port);
  logger.info(`Indicator service running on port ${port}`);
}

bootstrap();
