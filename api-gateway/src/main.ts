import { initTracing } from '@parakh/common';
initTracing('api-gateway');

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createLogger } from '@parakh/common';

async function bootstrap() {
  const logger = createLogger({ service: 'api-gateway' });
  const port = process.env.API_GATEWAY_PORT || 3000;

  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors();

  await app.listen(port);
  logger.info(`API Gateway running on port ${port}`);
}

bootstrap();
