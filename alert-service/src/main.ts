import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createLogger } from '@parakh/common';

async function bootstrap() {
  const logger = createLogger({ service: 'alert-service' });
  const port = process.env.ALERT_SERVICE_PORT || 3005;

  const app = await NestFactory.create(AppModule);
  app.enableCors();

  await app.listen(port);
  logger.info(`Alert service running on port ${port}`);
}

bootstrap();
