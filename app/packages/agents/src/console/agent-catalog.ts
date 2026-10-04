import { type AdminAgent, AdminAgentSchema } from "@core/contracts";
import type { AgentDefinition } from "../runtime/agent-module.ts";

/** The parts of a built Mastra agent the catalog reads. */
export type CatalogAgent = { readonly name: string; readonly getDescription: () => string };

export type AgentCatalogSource = {
  /** Core and module agent definitions, in registration order. */
  readonly definitions: readonly AgentDefinition[];
  /** Built agents by id: entry agents, the supervisor and the subagents. */
  readonly built: Readonly<Record<string, CatalogAgent | undefined>>;
  readonly isEntry: (definition: AgentDefinition) => boolean;
  readonly supervisor: { readonly id: string; readonly ceiling: readonly string[] };
};

const sorted = (ids: readonly string[]): string[] => [...new Set(ids)].sort();

const entryOf = (source: AgentCatalogSource, definition: AgentDefinition): unknown => {
  const entry = source.isEntry(definition);
  const agent = source.built[definition.id];
  return {
    id: definition.id,
    name: agent?.name ?? definition.id,
    description: agent?.getDescription() ?? "",
    role: entry ? "entry" : "subagent",
    enablement: entry ? "always" : "per-organization",
    subagents: [],
    tools: sorted(definition.catalog?.tools ?? []),
    toolsVaryByOrganization: definition.catalog?.perOrganizationTools ?? false,
    skills: sorted(definition.catalog?.skills ?? []),
    permissions: sorted(definition.ceiling),
  };
};

/**
 * The registered agents for the staff catalog (decision 0044): the supervisor first, then every
 * definition in registration order. Names and descriptions come from the built agents; tools and
 * skills from what each definition declares (`AgentDefinition.catalog`), because an agent's tools
 * are resolved per run. An agent that does not fit the contract is left out, never a 500.
 */
export const buildAgentCatalog = (source: AgentCatalogSource): AdminAgent[] => {
  const supervisor = source.built[source.supervisor.id];
  const entries: unknown[] = [
    {
      id: source.supervisor.id,
      name: supervisor?.name ?? source.supervisor.id,
      description: supervisor?.getDescription() ?? "",
      role: "supervisor",
      enablement: "always",
      subagents: source.definitions
        .filter((definition) => !source.isEntry(definition))
        .map((definition) => definition.id),
      tools: [],
      // Read-only tools of the organization's connectors, resolved per run.
      toolsVaryByOrganization: true,
      skills: [],
      permissions: sorted(source.supervisor.ceiling),
    },
    ...source.definitions.map((definition) => entryOf(source, definition)),
  ];
  return entries.flatMap((entry) => {
    const parsed = AdminAgentSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
};
