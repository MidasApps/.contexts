import type { ObservabilityExporter } from "@mastra/core/observability";
import type { MastraCompositeStore } from "@mastra/core/storage";
import type { MastraVector } from "@mastra/core/vector";
import type { PromptEvalRunner } from "../agents/prompt-eval-route.ts";
import type { ConnectorLoaders } from "../connectors/connector-registry.ts";
import type { AgentModels, ModelFactoryEnv } from "../models/model-factory.ts";
import type { ObservabilityEnv } from "../observability/create-observability.ts";
import type { WebClientEnv } from "../tools/web/firecrawl-client.ts";
import type { WebToolsRuntime } from "../tools/web/web-tools-runtime.ts";
import type { VoiceEnv } from "../voice/compose-voice.ts";
import type { AgentModule } from "./agent-module.ts";
import type { AgentRuntimePorts } from "./runtime-ports.ts";

export type ComposeAgentRuntimeArgs = {
  readonly env: ModelFactoryEnv &
    Pick<ObservabilityEnv, "OTEL_EXPORTER_OTLP_ENDPOINT"> &
    Pick<WebClientEnv, "FIRECRAWL_API_KEY" | "FIRECRAWL_API_URL"> &
    Pick<VoiceEnv, "AI_VOICE_ENABLED" | "AI_VOICE_REALTIME_ENABLED" | "AI_MODEL_REALTIME"> & {
      readonly AI_MEMORY_OBSERVATIONAL?: boolean;
      readonly MCP_REQUEST_STATE_KEY?: string;
      readonly SCHEDULE_MIN_INTERVAL_MINUTES?: number | undefined;
    };
  readonly ports: AgentRuntimePorts;
  /** `APP_MODULES` of `apps/mastra`, built with `defineAgentModule`. */
  readonly modules: readonly AgentModule[];
  /** Mastra storage (PostgresStore in the app; in-memory in tests). */
  readonly storage: MastraCompositeStore;
  /** Memory vectors (`PgVector` on schema `mastra` in the app); without it no memory is built. */
  readonly vector?: MastraVector;
  /** `service` of logs and traces. */
  readonly serviceName: string;
  /** Mastra `server.apiPrefix` (default `/api`). */
  readonly apiPrefix?: string;
  /** Test seams. */
  readonly models?: AgentModels;
  readonly exporters?: ObservabilityExporter[];
  readonly aiCatalog?: unknown;
  /** Directories tried first for agent instructions (the bundled copy in `apps/mastra`). */
  readonly instructionsDirs?: readonly string[];
  /** Directories tried first for core skills (`<dir>/<name>/SKILL.md`, the bundled copy). */
  readonly skillsDirs?: readonly string[];
  /** Test seam: how connectors become tools (defaults fetch specs and connect MCP servers). */
  readonly connectorLoaders?: ConnectorLoaders;
  /** Test seam: Firecrawl clients and the guard DNS (default: from env and the secret store). */
  readonly webTools?: WebToolsRuntime;
  /** Runs prompt evals (`createHarnessPromptEvalRunner` in `apps/mastra`); without it the eval route answers 503. */
  readonly promptEvalRunner?: PromptEvalRunner;
};
