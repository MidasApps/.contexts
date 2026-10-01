CREATE SCHEMA "agents";
--> statement-breakpoint
CREATE TABLE "agents"."prompt_activations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"agent_id" text NOT NULL,
	"scope" text NOT NULL,
	"tenant_id" text,
	"version_id" uuid NOT NULL,
	"forced" boolean DEFAULT false NOT NULL,
	"reason" text,
	"activated_by" text NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_activations_scope_check" CHECK ("agents"."prompt_activations"."scope" IN ('platform', 'tenant')),
	CONSTRAINT "prompt_activations_scope_tenant_check" CHECK (("agents"."prompt_activations"."scope" = 'tenant') = ("agents"."prompt_activations"."tenant_id" IS NOT NULL)),
	CONSTRAINT "prompt_activations_forced_reason_check" CHECK (NOT "agents"."prompt_activations"."forced" OR "agents"."prompt_activations"."reason" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "agents"."prompt_activations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agents"."prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"agent_id" text NOT NULL,
	"scope" text NOT NULL,
	"tenant_id" text,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"body_sha256" text NOT NULL,
	"note" text,
	"eval_experiment_id" text,
	"eval_verdict" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_versions_agent_scope_tenant_version_key" UNIQUE NULLS NOT DISTINCT("agent_id","scope","tenant_id","version"),
	CONSTRAINT "prompt_versions_scope_check" CHECK ("agents"."prompt_versions"."scope" IN ('platform', 'tenant')),
	CONSTRAINT "prompt_versions_scope_tenant_check" CHECK (("agents"."prompt_versions"."scope" = 'tenant') = ("agents"."prompt_versions"."tenant_id" IS NOT NULL)),
	CONSTRAINT "prompt_versions_version_check" CHECK ("agents"."prompt_versions"."version" >= 1),
	CONSTRAINT "prompt_versions_sha_check" CHECK ("agents"."prompt_versions"."body_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "prompt_versions_verdict_check" CHECK ("agents"."prompt_versions"."eval_verdict" IS NULL OR "agents"."prompt_versions"."eval_verdict" IN ('passed', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "agents"."prompt_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agents"."prompt_activations" ADD CONSTRAINT "prompt_activations_version_fk" FOREIGN KEY ("version_id") REFERENCES "agents"."prompt_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prompt_activations_version_idx" ON "agents"."prompt_activations" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "prompt_activations_lookup_idx" ON "agents"."prompt_activations" USING btree ("agent_id","scope","tenant_id","activated_at");--> statement-breakpoint
CREATE POLICY "prompt_activations_tenant_or_platform_rows" ON "agents"."prompt_activations" AS PERMISSIVE FOR ALL TO public USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "prompt_versions_tenant_or_platform_rows" ON "agents"."prompt_versions" AS PERMISSIVE FOR ALL TO public USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true));