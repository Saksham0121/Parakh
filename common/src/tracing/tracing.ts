import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { TraceIdRatioBasedSampler, ParentBasedSampler } from '@opentelemetry/sdk-trace-base';

export const initTracing = (serviceName: string) => {
  // Set the service name via env var if not already set, so NodeSDK picks it up
  if (!process.env.OTEL_SERVICE_NAME) {
    process.env.OTEL_SERVICE_NAME = serviceName;
  }

  const exporter = new OTLPTraceExporter({
    url: 'http://jaeger:4318/v1/traces',
  });

  const sdk = new NodeSDK({
    traceExporter: exporter,
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(0.1), // 10% sampling in hot path
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((error) => console.log('Error terminating tracing', error))
      .finally(() => process.exit(0));
  });
};
