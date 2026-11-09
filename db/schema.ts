import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const rooms = sqliteTable('rooms', { code: text('code').primaryKey(), state: text('state').notNull(), version: integer('version').notNull().default(0), lastActivity: integer('last_activity').notNull().default(0) });

export const presence = sqliteTable('presence', { room: text('room').notNull(), player: text('player').notNull(), lastSeen: integer('last_seen').notNull() }, table => [primaryKey({columns:[table.room,table.player]})]);

export const expiredRooms = sqliteTable('expired_rooms', {code:text('code').primaryKey(),expiredAt:integer('expired_at').notNull()});

// Aggregate product metrics only: no room, player, device or session identifiers.
export const growthDaily = sqliteTable('growth_daily', {
  day:text('day').notNull(), event:text('event').notNull(), source:text('source').notNull(), total:integer('total').notNull().default(0)
}, table => [primaryKey({columns:[table.day,table.event,table.source]})]);
