CREATE TABLE `game_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`host_id` text NOT NULL,
	`room_code` text NOT NULL,
	`mode` text DEFAULT 'classic' NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`summary_json` text,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`host_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_sessions_room_code_unique` ON `game_sessions` (`room_code`);--> statement-breakpoint
CREATE INDEX `idx_sessions_host` ON `game_sessions` (`host_id`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`order` integer NOT NULL,
	`type` text NOT NULL,
	`prompt` text NOT NULL,
	`time_limit_sec` integer DEFAULT 20 NOT NULL,
	`points` integer DEFAULT 1000 NOT NULL,
	`config` text NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_questions_quiz` ON `questions` (`quiz_id`);--> statement-breakpoint
CREATE TABLE `quizzes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_quizzes_owner` ON `quizzes` (`owner_id`);--> statement-breakpoint
CREATE TABLE `session_answers` (
	`session_id` text NOT NULL,
	`player_id` text NOT NULL,
	`player_nickname` text NOT NULL,
	`question_id` text NOT NULL,
	`question_prompt` text NOT NULL,
	`payload` text NOT NULL,
	`latency_ms` integer NOT NULL,
	`is_correct` integer NOT NULL,
	`points` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_session_answers_session` ON `session_answers` (`session_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);