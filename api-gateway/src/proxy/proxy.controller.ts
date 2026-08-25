import { Controller, All, Req, Res, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { createProxyMiddleware, fixRequestBody, RequestHandler } from 'http-proxy-middleware';
import { SERVICE_PORTS } from '@parakh/common';

/**
 * Helper to determine the target host.
 * If running in Docker (inferred by REDIS_HOST=redis), route to the container name.
 * Otherwise, route to localhost for local development.
 */
const getHost = (serviceName: string) => process.env.REDIS_HOST === 'redis' ? serviceName : 'localhost';

/**
 * Service route mapping.
 * Maps URL prefixes to downstream service addresses.
 */
const SERVICE_ROUTES: Record<string, { target: string; pathRewrite: Record<string, string> }> = {
  '/api/auth': {
    target: `http://${getHost('user-service')}:${SERVICE_PORTS.USER_SERVICE}`,
    pathRewrite: { '^/api/auth': '/auth' },
  },
  '/api/watchlist': {
    target: `http://${getHost('user-service')}:${SERVICE_PORTS.USER_SERVICE}`,
    pathRewrite: { '^/api/watchlist': '/watchlist' },
  },
  '/api/market': {
    target: `http://${getHost('market-data-service')}:${SERVICE_PORTS.MARKET_DATA_SERVICE}`,
    pathRewrite: { '^/api/market': '/market' },
  },
  '/api/indicators': {
    target: `http://${getHost('indicator-service')}:${SERVICE_PORTS.INDICATOR_SERVICE}`,
    pathRewrite: { '^/api/indicators': '/indicators' },
  },
  '/api/setups': {
    target: `http://${getHost('setup-service')}:${SERVICE_PORTS.SETUP_SERVICE}`,
    pathRewrite: { '^/api/setups': '/setups' },
  },
  '/api/alerts': {
    target: `http://${getHost('alert-service')}:${SERVICE_PORTS.ALERT_SERVICE}`,
    pathRewrite: { '^/api/alerts': '/alerts' },
  },
  '/api/backtests': {
    target: `http://${getHost('backtest-service')}:${SERVICE_PORTS.BACKTEST_SERVICE}`,
    pathRewrite: { '^/api/backtests': '/backtests' },
  },
  '/api/fundamentals': {
    target: `http://${getHost('fundamentals-service')}:${SERVICE_PORTS.FUNDAMENTALS_SERVICE}`,
    pathRewrite: { '^/api/fundamentals': '/fundamentals' },
  },
};

@Controller()
export class ProxyController {
  private proxies: Map<string, RequestHandler> = new Map();

  constructor(private configService: ConfigService) {
    // Create proxy middleware for each service route
    for (const [prefix, config] of Object.entries(SERVICE_ROUTES)) {
      this.proxies.set(
        prefix,
        createProxyMiddleware({
          target: config.target,
          changeOrigin: true,
          pathRewrite: config.pathRewrite,
          on: {
            proxyReq: fixRequestBody,
            error: (err, _req, res) => {
              const response = res as Response;
              if (!response.headersSent) {
                response.status(502).json({
                  statusCode: 502,
                  message: `Service unavailable: ${prefix}`,
                });
              }
            },
          },
        }),
      );
    }
  }

  @All('*')
  async handleProxy(@Req() req: Request, @Res() res: Response) {
    // NestJS strips the global prefix from req.path, so use req.originalUrl for matching
    const urlPath = req.originalUrl.split('?')[0];
    for (const [prefix, proxy] of this.proxies) {
      if (urlPath.startsWith(prefix)) {
        return (proxy as any)(req, res, () => {});
      }
    }

    throw new HttpException('Route not found', HttpStatus.NOT_FOUND);
  }
}
