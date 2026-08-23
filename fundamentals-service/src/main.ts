import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createLogger } from '@parakh/common';

async function bootstrap() {
  const logger = createLogger({ service: 'fundamentals-service' });
  const port = process.env.FUNDAMENTALS_SERVICE_PORT || 3006;

  const app = await NestFactory.create(AppModule);
  app.enableCors();

  await app.listen(port);
  logger.info(`Fundamentals service running on port ${port}`);
}

bootstrap();
