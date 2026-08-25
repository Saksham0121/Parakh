import { initTracing } from '@parakh/common';
initTracing('setup-service');

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createLogger } from '@parakh/common';

async function bootstrap() {
  const logger = createLogger({ service: 'setup-service' });
  const port = process.env.SETUP_SERVICE_PORT || 3004;

  const app = await NestFactory.create(AppModule);
  app.enableCors();

  await app.listen(port);
  logger.info(`Setup service running on port ${port}`);
}

bootstrap();
