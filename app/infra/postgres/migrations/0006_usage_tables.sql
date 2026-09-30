CREATE SCHEMA "usage";
--> statement-breakpoint
CREATE TABLE "usage"."llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"request_id" text,
	"trace_id" text,
	"tenant_id" text NOT NULL,
	"user_id" text,
	"agent_id" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cached_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" bigint,
	"latency_ms" integer NOT NULL,
	"finish_reason" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_calls_tokens_check" CHECK ("usage"."llm_calls"."input_tokens" >= 0 AND "usage"."llm_calls"."output_tokens" >= 0 AND "usage"."llm_calls"."cached_tokens" >= 0),
	CONSTRAINT "llm_calls_cost_check" CHECK ("usage"."llm_calls"."cost_micro_usd" IS NULL OR "usage"."llm_calls"."cost_micro_usd" >= 0),
	CONSTRAINT "llm_calls_latency_check" CHECK ("usage"."llm_calls"."latency_ms" >= 0),
	CONSTRAINT "llm_calls_trace_id_check" CHECK ("usage"."llm_calls"."trace_id" IS NULL OR "usage"."llm_calls"."trace_id" ~ '^[0-9a-f]{32}$')
);
--> statement-breakpoint
ALTER TABLE "usage"."llm_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "usage"."tenant_budgets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" text NOT NULL,
	"monthly_micro_usd" bigint NOT NULL,
	"monthly_tokens" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_budgets_tenant_key" UNIQUE("tenant_id"),
	CONSTRAINT "tenant_budgets_caps_check" CHECK ("usage"."tenant_budgets"."monthly_micro_usd" >= 0 AND "usage"."tenant_budgets"."monthly_tokens" >= 0)
);
--> statement-breakpoint
ALTER TABLE "usage"."tenant_budgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "llm_calls_tenant_occurred_idx" ON "usage"."llm_calls" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE POLICY "llm_calls_tenant_rows" ON "usage"."llm_calls" AS PERMISSIVE FOR ALL TO public USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "tenant_budgets_tenant_rows" ON "usage"."tenant_budgets" AS PERMISSIVE FOR ALL TO public USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));