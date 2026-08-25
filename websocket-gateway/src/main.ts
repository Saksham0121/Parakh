import { initTracing } from '@parakh/common';
initTracing('websocket-gateway');

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createLogger } from '@parakh/common';

async function bootstrap() {
  const logger = createLogger({ service: 'websocket-gateway' });
  const port = process.env.WEBSOCKET_GATEWAY_PORT || 3009;

  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: '*' });

  await app.listen(port);
  logger.info(`WebSocket gateway running on port ${port}`);
}

bootstrap();
