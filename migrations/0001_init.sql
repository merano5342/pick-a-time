-- 揪甘心 initial schema (規格書 §5.3). All timestamps are ISO-8601 strings (UTC).

CREATE TABLE hosts (
  id            TEXT PRIMARY KEY,
  google_sub    TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,          -- random 32+ char token stored in an HttpOnly cookie
  host_id    TEXT NOT NULL REFERENCES hosts(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_host ON sessions(host_id);

-- Soft-delete only: records are never hard-deleted (FR-10).
CREATE TABLE events (
  id                TEXT PRIMARY KEY,   -- 16-char unpredictable id
  host_account_id   TEXT NOT NULL REFERENCES hosts(id),
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  location_text     TEXT,
  location_url      TEXT,
  host_name         TEXT NOT NULL DEFAULT '',
  host_email        TEXT NOT NULL DEFAULT '',
  mode              TEXT NOT NULL CHECK (mode IN ('date_only', 'time_slots')),
  response_deadline TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finalized', 'cancelled')),
  final_slot_id     TEXT,
  final_note        TEXT,
  cancelled_at      TEXT,
  ai_restaurant     TEXT,               -- JSON of AiSelectedRestaurant
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX idx_events_host ON events(host_account_id, created_at);

CREATE TABLE time_slots (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL REFERENCES events(id),
  position   INTEGER NOT NULL,
  date       TEXT NOT NULL,
  time       TEXT NOT NULL DEFAULT '',
  label      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_slots_event ON time_slots(event_id, position);

CREATE TABLE participant_responses (
  id             TEXT PRIMARY KEY,
  event_id       TEXT NOT NULL REFERENCES events(id),
  nickname       TEXT NOT NULL,
  nickname_lower TEXT NOT NULL,
  email          TEXT NOT NULL DEFAULT '',
  password_hash  TEXT,
  comment        TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  UNIQUE (event_id, nickname_lower)
);

CREATE TABLE response_availability (
  response_id TEXT NOT NULL REFERENCES participant_responses(id),
  slot_id     TEXT NOT NULL REFERENCES time_slots(id),
  status      TEXT NOT NULL,
  PRIMARY KEY (response_id, slot_id)
);

CREATE TABLE event_comments (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL REFERENCES events(id),
  nickname   TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_comments_event ON event_comments(event_id, created_at);

-- Fixed-window counters for public write endpoints (votes, comments, password attempts).
CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);
