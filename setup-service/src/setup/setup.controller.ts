import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UnauthorizedException } from '@nestjs/common';
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

  @Get(':id')
  async findOne(@Req() req: Request, @Param('id') id: string) {
    return this.setupService.getSetup(this.getUserId(req), id);
  }

  @Patch(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    return this.setupService.updateSetup(this.getUserId(req), id, data);
  }

  @Patch(':id/activate')
  async toggleActive(@Req() req: Request, @Param('id') id: string) {
    return this.setupService.toggleActive(this.getUserId(req), id);
  }

  @Post(':id/duplicate')
  async duplicate(@Req() req: Request, @Param('id') id: string) {
    return this.setupService.duplicateSetup(this.getUserId(req), id);
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    return this.setupService.deleteSetup(this.getUserId(req), id);
  }
}
