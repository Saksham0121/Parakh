import { Kafka, Producer, Consumer, KafkaConfig, ProducerConfig, ConsumerConfig, EachMessagePayload } from 'kafkajs';
import { propagation, context } from '@opentelemetry/api';

export interface KafkaClientOptions {
  clientId: string;
  brokers: string[];
}

export class KafkaClient {
  private kafka: Kafka;
  private producer: Producer | null = null;
  private consumers: Map<string, Consumer> = new Map();

  constructor(options: KafkaClientOptions) {
    const config: KafkaConfig = {
      clientId: options.clientId,
      brokers: options.brokers,
      retry: {
        initialRetryTime: 300,
        retries: 10,
      },
    };

    this.kafka = new Kafka(config);
  }

  /**
   * Get or create a producer instance.
   */
  async getProducer(config?: ProducerConfig): Promise<Producer> {
    if (!this.producer) {
      this.producer = this.kafka.producer(config);
      await this.producer.connect();
    }
    return this.producer;
  }

  /**
   * Publish a message to a Kafka topic.
   * Key is used for partition assignment (e.g., symbol for ordering guarantee).
   */
  async publish(topic: string, key: string, value: unknown): Promise<void> {
    const producer = await this.getProducer();
    
    // Inject OpenTelemetry trace context into headers
    const headers: Record<string, string> = {};
    propagation.inject(context.active(), headers);

    await producer.send({
      topic,
      messages: [
        {
          key,
          value: JSON.stringify(value),
          headers: headers as any, // Cast to any to satisfy Kafka headers type
          timestamp: Date.now().toString(),
        },
      ],
    });
  }

  /**
   * Create a consumer and subscribe to topics.
   * Returns the consumer for further configuration.
   */
  async subscribe(
    groupId: string,
    topics: string[],
    handler: (payload: EachMessagePayload) => Promise<void>,
    config?: Partial<ConsumerConfig>,
  ): Promise<Consumer> {
    const consumer = this.kafka.consumer({
      groupId,
      ...config,
    });

    await consumer.connect();

    for (const topic of topics) {
      await consumer.subscribe({ topic, fromBeginning: false });
    }

    await consumer.run({
      eachMessage: async (payload) => {
        // Extract trace context from headers
        let extractedContext = context.active();
        if (payload.message.headers) {
          const stringHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(payload.message.headers)) {
            if (v) stringHeaders[k] = v.toString();
          }
          extractedContext = propagation.extract(context.active(), stringHeaders);
        }

        // Run the handler inside the extracted trace context
        await context.with(extractedContext, () => handler(payload));
      },
    });

    this.consumers.set(groupId, consumer);
    return consumer;
  }

  /**
   * Gracefully disconnect all producers and consumers.
   */
  async disconnect(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }

    for (const [groupId, consumer] of this.consumers) {
      await consumer.disconnect();
      this.consumers.delete(groupId);
    }
  }
}

/**
 * Factory function to create a KafkaClient from environment variables.
 */
export function createKafkaClient(clientId?: string): KafkaClient {
  const brokers = (process.env.KAFKA_BROKERS || 'localhost:29092').split(',');
  const id = clientId || process.env.KAFKA_CLIENT_ID || 'parakh';

  return new KafkaClient({ clientId: id, brokers });
}
