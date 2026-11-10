package com.parakh.engine.security;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.crypto.SecretKey;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Validates the JWT issued by parakh-core for user-scoped engine endpoints (backtests, scanner).
 * Market data stays public so charts load without a round trip to the auth service.
 */
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    public static final String USER_ID = "parakh.userId";

    private final SecretKey key;

    public JwtAuthFilter(@Value("${jwt.secret:parakh_secret}") String secret) {
        // Same padding rule as parakh-core's JwtTokenProvider so both services derive the same key.
        String padded = secret.length() < 32 ? (secret + "01234567890123456789012345678901").substring(0, 32) : secret;
        this.key = Keys.hmacShaKeyFor(padded.getBytes(StandardCharsets.UTF_8));
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return !(path.startsWith("/api/backtests") || path.startsWith("/api/scanner"))
                || "OPTIONS".equalsIgnoreCase(request.getMethod());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String header = req.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            reject(res);
            return;
        }
        try {
            String userId = Jwts.parser().verifyWith(key).build()
                    .parseSignedClaims(header.substring(7)).getPayload().getSubject();
            req.setAttribute(USER_ID, userId);
        } catch (Exception e) {
            reject(res);
            return;
        }
        chain.doFilter(req, res);
    }

    private static void reject(HttpServletResponse res) throws IOException {
        res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        res.setContentType("application/json");
        res.getWriter().write("{\"message\":\"Authentication required\"}");
    }
}
