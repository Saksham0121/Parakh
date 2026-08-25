import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Histogram } from 'prom-client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric('http_request_duration_seconds')
    private readonly histogram: Histogram<string>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    
    // Some contexts (like WebSockets or Kafka) might not be HTTP
    if (!req || !req.method) {
      return next.handle();
    }

    const { method, route } = req;
    const url = route ? route.path : req.url;
    
    const endTimer = this.histogram.startTimer({
      method,
      route: url,
    });

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          const status_code = res.statusCode || 200;
          endTimer({ status_code });
        },
        error: (err) => {
          const status_code = err.status || 500;
          endTimer({ status_code });
        },
      }),
    );
  }
}
