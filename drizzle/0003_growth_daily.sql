-- Anonymous daily counters: never store room identifiers or player/session data.
CREATE TABLE growth_daily (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  source TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event, source)
);
CREATE INDEX growth_daily_event_day ON growth_daily(event, day);
