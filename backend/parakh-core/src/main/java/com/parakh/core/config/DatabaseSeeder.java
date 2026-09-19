package com.parakh.core.config;

import com.parakh.common.domain.User;
import com.parakh.common.domain.Watchlist;
import com.parakh.core.repository.UserRepository;
import com.parakh.core.repository.WatchlistRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Component
public class DatabaseSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DatabaseSeeder.class);

    private final UserRepository userRepository;
    private final WatchlistRepository watchlistRepository;
    private final PasswordEncoder passwordEncoder;

    public DatabaseSeeder(UserRepository userRepository,
                          WatchlistRepository watchlistRepository,
                          PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.watchlistRepository = watchlistRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(String... args) {
        String adminEmail = "admin@parakh.com";
        if (!userRepository.existsByEmail(adminEmail)) {
            User admin = new User(adminEmail, passwordEncoder.encode("password123"));
            admin = userRepository.save(admin);

            List<String> defaultSymbols = List.of("RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "AAPL", "NVDA");
            for (String symbol : defaultSymbols) {
                watchlistRepository.save(new Watchlist(admin, symbol));
            }

            log.info("Test user seeded: {} / password123 with starter watchlist", adminEmail);
        }
    }
}
