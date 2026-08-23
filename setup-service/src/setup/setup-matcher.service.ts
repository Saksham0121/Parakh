import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createKafkaClient, KafkaClient, KAFKA_TOPICS, evaluateCondition, createLogger } from '@parakh/common';
import type { IndicatorValueDto } from '@parakh/common';

const logger = createLogger({ service: 'setup-matcher' });

@Injectable()
export class SetupMatcherService implements OnModuleInit, OnModuleDestroy {
  private kafkaClient: KafkaClient;

  constructor(private prisma: PrismaService) {
    this.kafkaClient = createKafkaClient('setup-service');
  }

  async onModuleInit() {
    await this.kafkaClient.subscribe(
      'setup-matcher-group',
      [KAFKA_TOPICS.INDICATOR_UPDATES],
      async ({ message }) => {
        if (!message.value) return;
        try {
          const update: IndicatorValueDto = JSON.parse(message.value.toString());
          await this.processIndicatorUpdate(update);
        } catch (err) {
          logger.error('Error processing indicator update', { error: err });
        }
      },
    );
    logger.info('Setup matcher initialized');
  }

  async onModuleDestroy() {
    await this.kafkaClient.disconnect();
  }

  private async processIndicatorUpdate(update: IndicatorValueDto) {
    // Note: If Setup model doesn't store symbols, we should perhaps get the watchlists for users who have active setups,
    // or assume setups apply to all symbols the user is watching.
    // For MVP, we'll fetch all active setups and evaluate against this symbol.
    const activeSetups = await this.prisma.setup.findMany({
      where: { active: true },
    });

    if (activeSetups.length === 0) return;

    for (const setup of activeSetups) {
      const conditions = setup.technicalConditions as any[];
      if (!conditions) continue;

      for (const condition of conditions) {
        if (condition.indicator === update.indicatorType) {
          
          // For complex indicators, assume we compare against a default property or it's a simple number
          const val = typeof update.value === 'object' && update.value !== null 
            ? (update.value as any).value || (update.value as any).macd || Object.values(update.value)[0] 
            : update.value;

          const isMatch = evaluateCondition(condition.operator, val as number, condition.value);
          
          if (isMatch) {
            const alertEvent = {
              userId: setup.userId,
              setupId: setup.id,
              setupName: setup.name,
              symbol: update.symbol,
              condition: `${condition.indicator} ${condition.operator} ${condition.threshold}`,
              value: update.value,
              timestamp: Date.now(),
            };

            await this.kafkaClient.publish(
              KAFKA_TOPICS.ALERT_FIRED,
              setup.userId,
              alertEvent
            );

            logger.info('Condition matched, alert fired', { setupId: setup.id, symbol: update.symbol });
          }
        }
      }
    }
  }
}
