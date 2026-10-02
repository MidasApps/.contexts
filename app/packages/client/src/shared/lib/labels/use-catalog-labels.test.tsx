import { CORE_PERMISSIONS } from "@core/contracts";
import { loadMessages, type ExtraNamespaces, type SupportedLocale } from "@core/i18n";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { IntlProvider } from "use-intl";
import { describe, expect, it } from "vitest";
import { useAgentLabel, useFlagLabel, usePermissionLabel, useToolLabel, useWorkflowLabel } from "./use-catalog-labels.ts";

const MODULE_MESSAGES: ExtraNamespaces = {
  example: {
    "pt-BR": { workflows: { "note-intake": { name: "Entrada de notas", description: "Cria uma nota." } }, permissions: { note: { archive: "Arquivar notas" } }, agents: { helper: "Ajudante" } },
  },
};

const wrapperFor =
  (locale: SupportedLocale = "pt-BR") =>
  ({ children }: { children: ReactNode }) => (
    <IntlProvider locale={locale} messages={loadMessages(locale, MODULE_MESSAGES)} timeZone="UTC">
      {children}
    </IntlProvider>
  );

describe("useWorkflowLabel", () => {
  it("names core workflows from the core catalog and module workflows from their module", () => {
    const { result } = renderHook(() => useWorkflowLabel(), { wrapper: wrapperFor() });
    expect(result.current.name("approval-demo")).toBe("Demonstração de aprovação");
    expect(result.current.name("example-note-intake")).toBe("Entrada de notas");
    expect(result.current.description("example-note-intake", "Creates a note.")).toBe("Cria uma nota.");
  });

  it("falls back to the id, and to the server description, when no label exists", () => {
    const { result } = renderHook(() => useWorkflowLabel(), { wrapper: wrapperFor() });
    expect(result.current.name("unknown-flow")).toBe("unknown-flow");
    expect(result.current.description("unknown-flow", "From the server.")).toBe("From the server.");
  });

  it("follows the locale", () => {
    const { result } = renderHook(() => useWorkflowLabel(), { wrapper: wrapperFor("en-US") });
    expect(result.current.name("usage-report")).toBe("Usage report");
  });
});

describe("useToolLabel", () => {
  it("names core tools from chat.tools, by stream name or id", () => {
    const { result } = renderHook(() => useToolLabel(), { wrapper: wrapperFor() });
    expect(result.current("knowledge_searchKnowledge")).toBe("Buscar na base de conhecimento");
    expect(result.current("web.search")).toBe("Pesquisar na web");
  });

  it("names a command tool by the permission its contract requires", () => {
    const { result } = renderHook(() => useToolLabel(), { wrapper: wrapperFor() });
    expect(result.current("command_tenancy_CreateProjectInput")).toBe("Criar projetos");
  });

  it("keeps a connector tool's own name", () => {
    const { result } = renderHook(() => useToolLabel(), { wrapper: wrapperFor() });
    expect(result.current("mcp_search")).toBe("mcp_search");
  });
});

describe("usePermissionLabel", () => {
  it("names core and module permissions, else shows the id", () => {
    const { result } = renderHook(() => usePermissionLabel(), { wrapper: wrapperFor() });
    expect(result.current("core.member.remove")).toBe("Remover membros");
    expect(result.current("example.note.archive")).toBe("Arquivar notas");
    expect(result.current("other.thing.do")).toBe("other.thing.do");
  });

  it.each(["pt-BR", "en-US", "es-419"] as const)("has a label for every core permission in %s", (locale) => {
    const { result } = renderHook(() => usePermissionLabel(), { wrapper: wrapperFor(locale) });
    const unlabelled = CORE_PERMISSIONS.map((definition) => definition.id).filter((id) => result.current(id) === id);
    expect(unlabelled).toEqual([]);
  });
});

describe("useFlagLabel", () => {
  it("names flags and describes them in the viewer's language", () => {
    const { result } = renderHook(() => useFlagLabel(), { wrapper: wrapperFor() });
    expect(result.current.name("ai.kill-switch")).toBe("Interruptor de emergência da IA");
    expect(result.current.name("chat.voice.realtime")).toBe("Voz em tempo real");
    expect(result.current.description("unknown.flag", "English reason.")).toBe("English reason.");
  });
});

describe("useAgentLabel", () => {
  it("names core and module agents, else uses the given name or the key", () => {
    const { result } = renderHook(() => useAgentLabel(), { wrapper: wrapperFor() });
    expect(result.current("knowledge")).toBe("Conhecimento");
    expect(result.current("example-helper")).toBe("Ajudante");
    expect(result.current("org-agent-1", "Meu agente")).toBe("Meu agente");
    expect(result.current("org-agent-1")).toBe("org-agent-1");
  });
});
