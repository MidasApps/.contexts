CREATE TABLE "ai"."chunks_v1" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"document_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"namespace" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"token_count" integer NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"embedding_model" text NOT NULL,
	"embedding_version" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chunks_v1_document_chunk_key" UNIQUE("document_id","chunk_index"),
	CONSTRAINT "chunks_v1_chunk_index_check" CHECK ("ai"."chunks_v1"."chunk_index" >= 0),
	CONSTRAINT "chunks_v1_token_count_check" CHECK ("ai"."chunks_v1"."token_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ai"."chunks_v1" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai"."documents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" text NOT NULL,
	"namespace" text NOT NULL,
	"source" text NOT NULL,
	"source_ref" text NOT NULL,
	"title" text,
	"source_url" text,
	"mime_type" text,
	"content_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_tenant_source_ref_key" UNIQUE("tenant_id","source","source_ref"),
	CONSTRAINT "documents_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "documents_source_check" CHECK ("ai"."documents"."source" IN ('upload', 'url', 'catalog', 'module')),
	CONSTRAINT "documents_status_check" CHECK ("ai"."documents"."status" IN ('pending', 'ready', 'failed', 'deleted')),
	CONSTRAINT "documents_content_hash_check" CHECK ("ai"."documents"."content_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "ai"."documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai"."chunks_v1" ADD CONSTRAINT "chunks_v1_document_fk" FOREIGN KEY ("document_id","tenant_id") REFERENCES "ai"."documents"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chunks_v1_document_idx" ON "ai"."chunks_v1" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "chunks_v1_tenant_namespace_idx" ON "ai"."chunks_v1" USING btree ("tenant_id","namespace");--> statement-breakpoint
CREATE INDEX "chunks_v1_embedding_hnsw" ON "ai"."chunks_v1" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE INDEX "documents_tenant_namespace_idx" ON "ai"."documents" USING btree ("tenant_id","namespace");--> statement-breakpoint
CREATE POLICY "chunks_v1_tenant_rows" ON "ai"."chunks_v1" AS PERMISSIVE FOR ALL TO public USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "chunks_v1_platform_read" ON "ai"."chunks_v1" AS PERMISSIVE FOR SELECT TO public USING (tenant_id = '_platform');--> statement-breakpoint
CREATE POLICY "documents_tenant_rows" ON "ai"."documents" AS PERMISSIVE FOR ALL TO public USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));--> statement-breakpoint
CREATE POLICY "documents_platform_read" ON "ai"."documents" AS PERMISSIVE FOR SELECT TO public USING (tenant_id = '_platform');