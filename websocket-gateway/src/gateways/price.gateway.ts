import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { JwtService } from '@nestjs/jwt';
import { createLogger } from '@parakh/common';

const logger = createLogger({ service: 'price-gateway' });

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
export class PriceGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private connectedClients = new Map<string, { userId?: string; symbols: Set<string> }>();

  constructor(private configService: ConfigService) {}

  async afterInit(server: Server) {
    // Set up Redis adapter for cross-instance pub/sub
    try {
      const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
      const redisPort = this.configService.get<number>('REDIS_PORT', 6379);

      const pubClient = new Redis({ host: redisHost, port: redisPort });
      const subClient = pubClient.duplicate();

      server.adapter(createAdapter(pubClient, subClient) as any);
      logger.info('Redis adapter connected for Socket.IO');
    } catch (err) {
      logger.warn('Failed to connect Redis adapter — running without cross-instance sync', { error: err });
    }

    logger.info('WebSocket gateway initialized');
  }

  handleConnection(client: Socket) {
    // Extract JWT from handshake for authenticated connections
    const token = client.handshake.auth?.token || client.handshake.query?.token;
    let userId: string | undefined;

    if (token) {
      try {
        const jwtService = new JwtService({
          secret: this.configService.get<string>('JWT_SECRET', 'default-secret-change-me'),
        });
        const payload = jwtService.verify(token as string);
        userId = payload.sub;
      } catch {
        logger.warn('Invalid JWT on WebSocket connection', { clientId: client.id });
      }
    }

    this.connectedClients.set(client.id, { userId, symbols: new Set() });
    logger.info('Client connected', { clientId: client.id, userId });
  }

  handleDisconnect(client: Socket) {
    const clientData = this.connectedClients.get(client.id);
    if (clientData) {
      // Leave all symbol rooms
      for (const symbol of clientData.symbols) {
        client.leave(`symbol:${symbol}`);
      }
    }
    this.connectedClients.delete(client.id);
    logger.info('Client disconnected', { clientId: client.id });
  }

  /**
   * Client subscribes to a symbol's real-time updates.
   * Joins a Socket.IO room keyed by symbol.
   */
  @SubscribeMessage('subscribe:symbol')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { symbol: string },
  ) {
    const symbol = data.symbol.toUpperCase();
    client.join(`symbol:${symbol}`);

    const clientData = this.connectedClients.get(client.id);
    if (clientData) {
      clientData.symbols.add(symbol);
    }

    logger.info('Client subscribed to symbol', { clientId: client.id, symbol });
    return { event: 'subscribed', data: { symbol } };
  }

  /**
   * Client unsubscribes from a symbol.
   */
  @SubscribeMessage('unsubscribe:symbol')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { symbol: string },
  ) {
    const symbol = data.symbol.toUpperCase();
    client.leave(`symbol:${symbol}`);

    const clientData = this.connectedClients.get(client.id);
    if (clientData) {
      clientData.symbols.delete(symbol);
    }

    return { event: 'unsubscribed', data: { symbol } };
  }

  /**
   * Broadcast a price update to all clients watching this symbol.
   * Called by the Kafka consumer service.
   */
  broadcastPrice(symbol: string, data: any) {
    this.server.to(`symbol:${symbol}`).emit('price:update', data);
  }

  /**
   * Broadcast an indicator update.
   */
  broadcastIndicator(symbol: string, data: any) {
    this.server.to(`symbol:${symbol}`).emit('indicator:update', data);
  }

  /**
   * Broadcast an alert to a specific user.
   */
  broadcastAlert(userId: string, data: any) {
    // Find all sockets belonging to this user
    for (const [clientId, clientData] of this.connectedClients) {
      if (clientData.userId === userId) {
        this.server.to(clientId).emit('alert:fired', data);
      }
    }
  }
}
