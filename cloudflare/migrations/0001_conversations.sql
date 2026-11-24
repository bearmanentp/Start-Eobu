CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  login TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires);
CREATE TABLE conversations (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  turns TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX conversations_recent ON conversations(user_id, updated_at DESC);

