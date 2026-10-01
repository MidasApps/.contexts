import type { AgentModule, AgentRuntimePorts } from "@core/agents";
import { createExampleAgentModule } from "@core/module-example/agents";
import { exampleManifest } from "@core/module-example/manifest";
import { createExampleCommands } from "@core/module-example/server";
import type { AccessCore, AuditWriter, ContractCommand, FirebaseAdmin } from "@core/services";
import type { CoreServerModule } from "@core/services/composition";

/** What a module's server side receives from this app's core server. */
export type ModuleServerDeps = {
  readonly firestore: FirebaseAdmin["firestore"];
  readonly access: Pick<AccessCore, "forRequest">;
  readonly audit: AuditWriter;
};

/**
 * One installed module as this app composes it (spec §3.3, decisions 0019 and 0025):
 * - `manifest`: its permissions, unit types and settings join SP1's registries;
 * - `createCommands`: its entries of the command registry (agent tools, approvals, workflows);
 * - `createAgentModule`: its skills, workflows, tools and agents, built over the runtime ports.
 */
export type AppModule = {
  readonly manifest: CoreServerModule;
  readonly createCommands: (deps: ModuleServerDeps) => readonly ContractCommand[];
  readonly createAgentModule: (deps: { readonly ports: AgentRuntimePorts }) => AgentModule;
};

/**
 * Modules served by this Mastra app, listed here and only here (the core packages never
 * import a module, umbrella D6). Installing a module = one entry in this list.
 */
export const APP_MODULES: readonly AppModule[] = [{ manifest: exampleManifest, createCommands: createExampleCommands, createAgentModule: createExampleAgentModule }];
