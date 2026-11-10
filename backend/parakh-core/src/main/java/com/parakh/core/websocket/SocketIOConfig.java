package com.parakh.core.websocket;

import com.corundumstudio.socketio.AuthorizationResult;
import com.corundumstudio.socketio.SocketIOServer;
import com.parakh.core.config.JwtTokenProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name = "parakh.realtime.enabled", havingValue = "true", matchIfMissing = true)
@Configuration
public class SocketIOConfig {

    @Value("${websocket.port:3009}")
    private int port;

    private final JwtTokenProvider tokenProvider;

    public SocketIOConfig(JwtTokenProvider tokenProvider) {
        this.tokenProvider = tokenProvider;
    }

    @Bean
    public SocketIOServer socketIOServer() {
        com.corundumstudio.socketio.Configuration config = new com.corundumstudio.socketio.Configuration();
        config.setHostname("0.0.0.0");
        config.setPort(port);
        config.setOrigin("*");

        // Allow query param or header auth token validation
        config.setAuthorizationListener(data -> {
            String token = data.getSingleUrlParam("token");
            if (token == null && data.getHttpHeaders().contains("Authorization")) {
                String auth = data.getHttpHeaders().get("Authorization");
                if (auth != null && auth.startsWith("Bearer ")) {
                    token = auth.substring(7);
                }
            }
            if (token != null && !token.isBlank()) {
                boolean valid = tokenProvider.validateToken(token);
                return valid ? AuthorizationResult.SUCCESSFUL_AUTHORIZATION : AuthorizationResult.FAILED_AUTHORIZATION;
            }
            // Allow unauthenticated connection for public price rooms
            return AuthorizationResult.SUCCESSFUL_AUTHORIZATION;
        });

        return new SocketIOServer(config);
    }
}
