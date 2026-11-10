package com.parakh.core.websocket;

import com.corundumstudio.socketio.SocketIOServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name = "parakh.realtime.enabled", havingValue = "true", matchIfMissing = true)
@Component
public class SocketIOServerRunner implements CommandLineRunner, AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(SocketIOServerRunner.class);
    private final SocketIOServer server;

    public SocketIOServerRunner(SocketIOServer server) {
        this.server = server;
    }

    @Override
    public void run(String... args) {
        server.start();
        log.info("Netty Socket.IO server started on port {}", server.getConfiguration().getPort());
    }

    @Override
    public void close() {
        if (server != null) {
            log.info("Stopping Netty Socket.IO server");
            server.stop();
        }
    }
}
