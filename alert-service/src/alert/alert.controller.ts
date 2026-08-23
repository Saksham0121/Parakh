import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import { AlertService } from './alert.service';
import { Request } from 'express';

@Controller('alerts')
export class AlertController {
  constructor(private alertService: AlertService) {}

  private getUserId(req: Request): string {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) throw new UnauthorizedException();
    return userId;
  }

  @Get()
  async getHistory(@Req() req: Request) {
    return this.alertService.getUserAlerts(this.getUserId(req));
  }
}
