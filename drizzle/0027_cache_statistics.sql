ALTER TABLE `proxy_logs` ADD `cached_tokens` integer;--> statement-breakpoint
ALTER TABLE `proxy_logs` ADD `cache_write_tokens` integer;--> statement-breakpoint
ALTER TABLE `proxy_logs` ADD `prompt_tokens_include_cache` integer;--> statement-breakpoint
ALTER TABLE `site_day_usage` ADD `total_cached_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `site_day_usage` ADD `cache_data_calls` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `site_day_usage` ADD `cache_hit_calls` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `site_hour_usage` ADD `total_cached_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `site_hour_usage` ADD `cache_data_calls` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `site_hour_usage` ADD `cache_hit_calls` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `model_day_usage` ADD `total_cached_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `model_day_usage` ADD `cache_data_calls` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `model_day_usage` ADD `cache_hit_calls` integer DEFAULT 0 NOT NULL;
