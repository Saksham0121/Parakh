-- Setups are evaluated on a chosen timeframe against an explicit symbol universe
-- (empty = the owner's watchlist). Matches are de-duplicated per bar.
ALTER TABLE setups ADD COLUMN IF NOT EXISTS timeframe VARCHAR(8) NOT NULL DEFAULT 'D';
ALTER TABLE setups ADD COLUMN IF NOT EXISTS universe JSONB;

CREATE INDEX IF NOT EXISTS idx_setups_active ON setups(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_setup_matches_symbol ON setup_matches(symbol);
