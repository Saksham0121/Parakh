import { Controller, Get, Post, Put, Delete, Body, Param, Req, UnauthorizedException } from '@nestjs/common';
import { SetupService } from './setup.service';
import { Request } from 'express';

@Controller('setups')
export class SetupController {
  constructor(private setupService: SetupService) {}

  private getUserId(req: Request): string {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) throw new UnauthorizedException();
    return userId;
  }

  @Post()
  async create(@Req() req: Request, @Body() data: any) {
    return this.setupService.createSetup(this.getUserId(req), data);
  }

  @Get()
  async findAll(@Req() req: Request) {
    return this.setupService.getUserSetups(this.getUserId(req));
  }

  @Put(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    return this.setupService.updateSetup(this.getUserId(req), id, data);
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    return this.setupService.deleteSetup(this.getUserId(req), id);
  }
}
