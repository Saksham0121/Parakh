import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SetupService {
  constructor(private prisma: PrismaService) {}

  async createSetup(userId: string, data: any) {
    return this.prisma.setup.create({
      data: {
        name: data.name,
        active: data.active ?? true,
        userId,
        technicalConditions: data.technicalConditions || [],
        fundamentalConditions: data.fundamentalConditions || null,
        fundamentalMode: data.fundamentalMode || 'display_only',
        orderRule: data.orderRule || null,
      },
    });
  }

  async getUserSetups(userId: string) {
    return this.prisma.setup.findMany({
      where: { userId },
    });
  }

  async updateSetup(userId: string, id: string, data: any) {
    return this.prisma.setup.update({
      where: { id, userId },
      data: {
        name: data.name,
        active: data.active,
        technicalConditions: data.technicalConditions,
        fundamentalConditions: data.fundamentalConditions,
        fundamentalMode: data.fundamentalMode,
        orderRule: data.orderRule,
      },
    });
  }

  async deleteSetup(userId: string, id: string) {
    return this.prisma.setup.delete({
      where: { id, userId },
    });
  }
}
