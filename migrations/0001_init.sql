CREATE TABLE IF NOT EXISTS words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL,
  pos TEXT NOT NULL DEFAULT '',
  meaning TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  stage INTEGER NOT NULL DEFAULT 0,
  next_due TEXT NOT NULL DEFAULT (date('now', '+2 day')),
  done INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_words_next_due ON words(done, next_due);
CREATE INDEX IF NOT EXISTS idx_words_created ON words(created_at);
