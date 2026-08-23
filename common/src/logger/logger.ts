import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

export interface LoggerOptions {
  service: string;
  level?: string;
}

/**
 * Create a structured JSON logger for a service.
 * Includes correlation ID support for distributed tracing.
 */
export function createLogger(options: LoggerOptions): winston.Logger {
  const { service, level = process.env.LOG_LEVEL || 'info' } = options;

  return winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ),
    defaultMeta: {
      service,
      nodeEnv: process.env.NODE_ENV || 'development',
    },
    transports: [
      new winston.transports.Console({
        format:
          process.env.NODE_ENV === 'production'
            ? winston.format.json()
            : winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message, service, correlationId, ...meta }) => {
                  const corrId = correlationId ? ` [${correlationId}]` : '';
                  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
                  return `${timestamp} [${service}] ${level}${corrId}: ${message}${metaStr}`;
                }),
              ),
      }),
    ],
  });
}

/**
 * Generate a new correlation ID for request tracing across services.
 */
export function generateCorrelationId(): string {
  return uuidv4();
}
