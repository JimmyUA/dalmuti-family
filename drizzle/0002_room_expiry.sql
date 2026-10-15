ALTER TABLE rooms ADD COLUMN last_activity INTEGER NOT NULL DEFAULT 0;
-- Existing rooms receive a full grace period from migration time.
UPDATE rooms SET last_activity=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE last_activity=0;
CREATE INDEX rooms_last_activity ON rooms(last_activity);
CREATE TABLE expired_rooms (code TEXT PRIMARY KEY, expired_at INTEGER NOT NULL);
CREATE INDEX expired_rooms_time ON expired_rooms(expired_at);
CREATE TRIGGER rooms_cleanup AFTER DELETE ON rooms BEGIN
 DELETE FROM presence WHERE room=OLD.code;
 INSERT OR REPLACE INTO expired_rooms(code,expired_at) VALUES(OLD.code,CAST(strftime('%s','now') AS INTEGER)*1000);
END;
