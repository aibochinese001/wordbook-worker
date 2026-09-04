ALTER TABLE words ADD COLUMN user_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_words_user ON words(user_id, done, next_due);
