package com.parakh.core.websocket;

import com.corundumstudio.socketio.AckRequest;
import com.corundumstudio.socketio.SocketIOClient;
import com.corundumstudio.socketio.SocketIOServer;
import com.corundumstudio.socketio.annotation.OnConnect;
import com.corundumstudio.socketio.annotation.OnDisconnect;
import com.corundumstudio.socketio.annotation.OnEvent;
import com.parakh.core.config.JwtTokenProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class SocketIOEventHandler {

    private static final Logger log = LoggerFactory.getLogger(SocketIOEventHandler.class);

    private final SocketIOServer server;
    private final JwtTokenProvider tokenProvider;
    // Map sessionId -> userId
    private final Map<String, String> clientUserMap = new ConcurrentHashMap<>();

    public SocketIOEventHandler(SocketIOServer server, JwtTokenProvider tokenProvider) {
        this.server = server;
        this.tokenProvider = tokenProvider;
        server.addListeners(this);
    }

    @OnConnect
    public void onConnect(SocketIOClient client) {
        String token = client.getHandshakeData().getSingleUrlParam("token");
        String authHeader = client.getHandshakeData().getHttpHeaders().get("Authorization");
        if (token == null && authHeader != null && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7);
        }

        if (token != null && tokenProvider.validateToken(token)) {
            String userId = tokenProvider.getUserIdFromToken(token);
            clientUserMap.put(client.getSessionId().toString(), userId);
            log.info("Client connected: {} (User: {})", client.getSessionId(), userId);
        } else {
            log.info("Client connected: {} (Guest)", client.getSessionId());
        }
    }

    @OnDisconnect
    public void onDisconnect(SocketIOClient client) {
        clientUserMap.remove(client.getSessionId().toString());
        log.info("Client disconnected: {}", client.getSessionId());
    }

    @OnEvent("subscribe:symbol")
    public void onSubscribeSymbol(SocketIOClient client, Map<String, String> data, AckRequest ackRequest) {
        if (data != null && data.containsKey("symbol")) {
            String symbol = data.get("symbol").toUpperCase();
            client.joinRoom("symbol:" + symbol);
            log.info("Client {} subscribed to symbol:{}", client.getSessionId(), symbol);
        }
    }

    @OnEvent("unsubscribe:symbol")
    public void onUnsubscribeSymbol(SocketIOClient client, Map<String, String> data, AckRequest ackRequest) {
        if (data != null && data.containsKey("symbol")) {
            String symbol = data.get("symbol").toUpperCase();
            client.leaveRoom("symbol:" + symbol);
            log.info("Client {} unsubscribed from symbol:{}", client.getSessionId(), symbol);
        }
    }

    public void broadcastToSymbolRoom(String symbol, String eventName, Object data) {
        server.getRoomOperations("symbol:" + symbol.toUpperCase()).sendEvent(eventName, data);
    }

    public void broadcastToUser(String userId, String eventName, Object data) {
        for (var entry : clientUserMap.entrySet()) {
            if (entry.getValue().equals(userId)) {
                SocketIOClient client = server.getClient(java.util.UUID.fromString(entry.getKey()));
                if (client != null) {
                    client.sendEvent(eventName, data);
                }
            }
        }
    }
}
