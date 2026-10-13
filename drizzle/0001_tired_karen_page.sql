CREATE TABLE `presence` (
	`room` text NOT NULL,
	`player` text NOT NULL,
	`last_seen` integer NOT NULL,
	PRIMARY KEY(`room`, `player`)
);
