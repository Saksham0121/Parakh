import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AlertService {
  constructor(private prisma: PrismaService) {}

  async getUserAlerts(userId: string) {
    // Assuming alert history is stored as SetupMatches
    return this.prisma.setupMatch.findMany({
      where: {
        setup: { userId }
      },
      orderBy: { matchedAt: 'desc' },
      take: 50, // Get last 50 alerts
      include: { setup: { select: { name: true } } }
    });
  }
}
