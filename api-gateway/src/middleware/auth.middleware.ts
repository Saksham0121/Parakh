import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  { method: 'POST', path: '/api/auth/register' },
  { method: 'POST', path: '/api/auth/login' },
  { method: 'GET', path: '/api/health' },
];

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  private jwtSecret: string;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {
    this.jwtSecret = this.configService.get<string>('JWT_SECRET', 'default-secret-change-me');
  }

  use(req: Request, _res: Response, next: NextFunction) {
    console.log(`[AuthMiddleware] req.method=${req.method} req.path=${req.path} req.originalUrl=${req.originalUrl}`);

    // Skip auth for public routes (ignoring query strings if any)
    const urlPath = req.originalUrl.split('?')[0];
    const isPublic = PUBLIC_ROUTES.some(
      (route) => req.method === route.method && (urlPath === route.path || urlPath.endsWith(route.path.replace('/api', '')))
    );

    if (req.method === 'OPTIONS' || isPublic) {
      return next();
    }

    // Extract and verify JWT
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.split(' ')[1];

    try {
      const payload = this.jwtService.verify(token, { secret: this.jwtSecret });
      // Attach user info to request for downstream services
      (req as any).user = { userId: payload.sub, email: payload.email };
      // Forward user info as headers to downstream services
      req.headers['x-user-id'] = payload.sub;
      req.headers['x-user-email'] = payload.email;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    next();
  }
}
