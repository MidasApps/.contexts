"use client";

import type { AgentCatalogEntry, AgentCatalogTool } from "@core/contracts";
import { useId, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import { isPromptAgentId } from "#/entities/prompt-version/index.ts";
import { AgentInstructions } from "#/features/tenant-prompt-addendum/index.ts";
import { Badge } from "#/shared/ui/atoms/Badge/Badge.tsx";

const TOOL_SOURCES = ["core", "module", "connector"] as const;

export type AgentCardProps = {
  organizationId: string;
  agent: Pick<AgentCatalogEntry, "key" | "name" | "description" | "source" | "moduleId" | "tools" | "skills">;
  /** The enabled state or switch (the supervisor has none: it is always on). */
  status?: ReactNode;
  /** `core.prompt.read` / `core.prompt.write` of the viewer. */
  prompt: { readonly canRead: boolean; readonly canWrite: boolean };
};

function ToolList({ tools }: { tools: readonly AgentCatalogTool[] }) {
  const t = useTranslations("settings.agents.catalog");
  if (tools.length === 0) return <p className="text-sm text-muted-foreground">{t("toolsEmpty")}</p>;
  return (
    <div className="flex flex-col gap-3">
      {TOOL_SOURCES.map((source) => {
        const group = tools.filter((tool) => tool.source === source);
        if (group.length === 0) return null;
        return (
          <div key={source} className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground-strong">{t(`toolSource.${source}`)}</p>
            <ul className="flex flex-col gap-1">
              {group.map((tool) => (
                <li key={tool.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono text-[12.5px] break-all">{tool.id}</span>
                  {/* The kind is written out: color alone never tells a mutation from a read. */}
                  <Badge variant={tool.kind === "mutation" ? "default" : "secondary"}>{tool.kind === "mutation" ? t("toolMutation") : t("toolRead")}</Badge>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    // A group, not a region: every card repeats these titles, and landmarks must be unique.
    <div role="group" aria-labelledby={id} className="flex flex-col gap-2">
      <h4 id={id} className="text-sm font-semibold">
        {title}
      </h4>
      {children}
    </div>
  );
}

/**
 * One agent as the organization sees it: what it is, whether it is on, the tools and skills it has
 * there, and the organization's instructions for it (the way an organization customizes an agent).
 */
export function AgentCard({ organizationId, agent, status, prompt }: AgentCardProps) {
  const t = useTranslations("settings.agents");
  const headingId = useId();
  return (
    <article aria-labelledby={headingId} data-slot="agent-card" className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={headingId} className="text-[15px] font-semibold">
            {agent.name}
          </h3>
          <p className="text-sm text-muted-foreground">{agent.description}</p>
          <p className="text-xs text-muted-foreground-strong">
            {agent.source === "module" && agent.moduleId !== null ? t("catalog.sourceModule", { module: agent.moduleId }) : t("catalog.sourceCore")}
          </p>
        </div>
        {status}
      </header>
      {prompt.canRead ? (
        isPromptAgentId(agent.key) ? (
          <AgentInstructions organizationId={organizationId} agentId={agent.key} agentName={agent.name} canWrite={prompt.canWrite} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("instructions.unsupported")}</p>
        )
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Part title={t("catalog.toolsTitle")}>
          <ToolList tools={agent.tools} />
        </Part>
        <Part title={t("catalog.skillsTitle")}>
          {agent.skills.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("catalog.skillsEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {agent.skills.map((skill) => (
                <li key={skill.name} className="flex flex-col text-sm">
                  <span className="font-mono text-[12.5px]">{skill.name}</span>
                  <span className="text-xs text-muted-foreground">{skill.description}</span>
                </li>
              ))}
            </ul>
          )}
        </Part>
      </div>
    </article>
  );
}
