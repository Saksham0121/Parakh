import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SetupService {
  constructor(private prisma: PrismaService) {}

  async createSetup(userId: string, data: any) {
    return this.prisma.setup.create({
      data: {
        name: data.name,
        // Spec: setups start INACTIVE by default — forces deliberate activation
        active: false,
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
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSetup(userId: string, id: string) {
    const setup = await this.prisma.setup.findFirst({
      where: { id, userId },
      include: {
        setupMatches: {
          orderBy: { matchedAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!setup) throw new NotFoundException('Setup not found');
    return setup;
  }

  async updateSetup(userId: string, id: string, data: any) {
    const existing = await this.prisma.setup.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Setup not found');

    return this.prisma.setup.update({
      where: { id },
      data: {
        // Only update fields that were explicitly provided — preserve existing data
        ...(data.name !== undefined && { name: data.name }),
        ...(data.technicalConditions !== undefined && { technicalConditions: data.technicalConditions }),
        ...(data.fundamentalConditions !== undefined && { fundamentalConditions: data.fundamentalConditions }),
        ...(data.fundamentalMode !== undefined && { fundamentalMode: data.fundamentalMode }),
        ...(data.orderRule !== undefined && { orderRule: data.orderRule }),
      },
    });
  }

  async toggleActive(userId: string, id: string) {
    const setup = await this.prisma.setup.findFirst({ where: { id, userId } });
    if (!setup) throw new NotFoundException('Setup not found');

    return this.prisma.setup.update({
      where: { id },
      data: { active: !setup.active },
    });
  }

  async duplicateSetup(userId: string, id: string) {
    const original = await this.prisma.setup.findFirst({ where: { id, userId } });
    if (!original) throw new NotFoundException('Setup not found');

    return this.prisma.setup.create({
      data: {
        name: `${original.name} (Copy)`,
        active: false, // duplicates always start inactive
        userId,
        technicalConditions: original.technicalConditions as any,
        fundamentalConditions: original.fundamentalConditions as any,
        fundamentalMode: original.fundamentalMode,
        orderRule: original.orderRule as any,
      },
    });
  }

  async deleteSetup(userId: string, id: string) {
    const existing = await this.prisma.setup.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Setup not found');

    return this.prisma.setup.delete({ where: { id } });
  }
}

