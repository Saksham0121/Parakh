import { Controller, All, Req, Res, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { createProxyMiddleware, RequestHandler } from 'http-proxy-middleware';
import { SERVICE_PORTS } from '@parakh/common';

/**
 * Service route mapping.
 * Maps URL prefixes to downstream service addresses.
 */
const SERVICE_ROUTES: Record<string, { target: string; pathRewrite: Record<string, string> }> = {
  '/api/auth': {
    target: `http://localhost:${SERVICE_PORTS.USER_SERVICE}`,
    pathRewrite: { '^/api/auth': '/auth' },
  },
  '/api/watchlist': {
    target: `http://localhost:${SERVICE_PORTS.USER_SERVICE}`,
    pathRewrite: { '^/api/watchlist': '/watchlist' },
  },
  '/api/market': {
    target: `http://localhost:${SERVICE_PORTS.MARKET_DATA_SERVICE}`,
    pathRewrite: { '^/api/market': '/market' },
  },
  '/api/indicators': {
    target: `http://localhost:${SERVICE_PORTS.INDICATOR_SERVICE}`,
    pathRewrite: { '^/api/indicators': '/indicators' },
  },
  '/api/setups': {
    target: `http://localhost:${SERVICE_PORTS.SETUP_SERVICE}`,
    pathRewrite: { '^/api/setups': '/setups' },
  },
  '/api/alerts': {
    target: `http://localhost:${SERVICE_PORTS.ALERT_SERVICE}`,
    pathRewrite: { '^/api/alerts': '/alerts' },
  },
  '/api/backtests': {
    target: `http://localhost:${SERVICE_PORTS.BACKTEST_SERVICE}`,
    pathRewrite: { '^/api/backtests': '/backtests' },
  },
  '/api/fundamentals': {
    target: `http://localhost:${SERVICE_PORTS.FUNDAMENTALS_SERVICE}`,
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
    // Find matching proxy
    for (const [prefix, proxy] of this.proxies) {
      if (req.path.startsWith(prefix)) {
        return (proxy as any)(req, res, () => {});
      }
    }

    throw new HttpException('Route not found', HttpStatus.NOT_FOUND);
  }
}
