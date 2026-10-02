"use client";

import { CORE_CONTRACTS, type ContractDefinition } from "@core/contracts";
import { useCallback, useMemo } from "react";
import { useTranslations } from "use-intl";
import { useOptionalModuleRegistry } from "../shell/shell-registry-context.tsx";
import { agentLabelKeys, flagLabelKeys, normalizeToolId, permissionLabelKeys, toolLabelKeys, workflowLabelKeys } from "./catalog-label-keys.ts";

type RootTranslator = ReturnType<typeof useTranslations>;

/** The copy of the first candidate key the catalogs have, or `undefined`. */
const firstMessage = (t: RootTranslator, keys: readonly string[]): string | undefined => {
  const key = keys.find((candidate) => t.has(candidate as never));
  return key === undefined ? undefined : t(key as never);
};

const useRootTranslator = (): RootTranslator => useTranslations();

export type CatalogLabel = {
  /** The human name, or the id itself when no catalog names it. */
  readonly name: (id: string) => string;
  /** The localized description, or `fallback` (the server's text) when no catalog has one. */
  readonly description: (id: string, fallback: string) => string;
};

/** Names of workflows (decision 0051): `common.workflows.<id>` or the module's `<moduleId>.workflows.<rest>`. */
export const useWorkflowLabel = (): CatalogLabel => {
  const t = useRootTranslator();
  return useMemo(
    () => ({
      name: (id) => firstMessage(t, workflowLabelKeys(id, "name")) ?? id,
      description: (id, fallback) => firstMessage(t, workflowLabelKeys(id, "description")) ?? fallback,
    }),
    [t],
  );
};

/** Names of feature flags (decision 0051): `common.flags.<key>`; the registry's reason is the description fallback. */
export const useFlagLabel = (): CatalogLabel => {
  const t = useRootTranslator();
  return useMemo(
    () => ({
      name: (key) => firstMessage(t, flagLabelKeys(key, "name")) ?? key,
      description: (key, fallback) => firstMessage(t, flagLabelKeys(key, "description")) ?? fallback,
    }),
    [t],
  );
};

/** Name of an agent: `common.agents.<key>` or the module's; else the name the server gave, else the key. */
export const useAgentLabel = (): ((key: string, fallback?: string) => string) => {
  const t = useRootTranslator();
  return useCallback((key, fallback) => firstMessage(t, agentLabelKeys(key)) ?? fallback ?? key, [t]);
};

/** Label of a permission: the permissions catalog (core, platform) or the module's `<moduleId>.permissions.<rest>`; else the id. */
export const usePermissionLabel = (): ((permission: string) => string) => {
  const t = useRootTranslator();
  return useCallback((permission) => firstMessage(t, permissionLabelKeys(permission)) ?? permission, [t]);
};

const CORE_CONTRACTS_BY_ID: ReadonlyMap<string, ContractDefinition> = new Map(CORE_CONTRACTS.map((contract) => [contract.id, contract]));
const COMMAND_PREFIX = "command.";

/**
 * Label of an agent tool, from its id or its stream name (`knowledge_searchKnowledge`):
 * `chat.tools.<id>`, then a command tool's permission label (`command.tenancy.CreateProjectInput`
 * → "Criar projetos"), then the module's `<moduleId>.tools.<rest>`. Connector tools keep their
 * own name: the organization named them.
 */
export const useToolLabel = (): ((toolNameOrId: string) => string) => {
  const t = useRootTranslator();
  const modules = useOptionalModuleRegistry();
  const permissionLabel = usePermissionLabel();
  return useCallback(
    (toolNameOrId) => {
      const id = normalizeToolId(toolNameOrId);
      const own = firstMessage(t, toolLabelKeys(id));
      if (own !== undefined) return own;
      if (id.startsWith(COMMAND_PREFIX)) {
        const commandId = id.slice(COMMAND_PREFIX.length);
        const contract = CORE_CONTRACTS_BY_ID.get(commandId) ?? modules?.contracts().find((candidate) => candidate.id === commandId);
        const permission = contract?.meta.permission;
        if (permission !== undefined) {
          const label = permissionLabel(permission);
          if (label !== permission) return label;
        }
      }
      return toolNameOrId;
    },
    [t, modules, permissionLabel],
  );
};

/** Name of an installed module, from its manifest `labelKey`; the module id when the module is not installed here. */
export const useModuleLabel = (): ((moduleId: string) => string) => {
  const t = useRootTranslator();
  const modules = useOptionalModuleRegistry();
  return useCallback(
    (moduleId) => {
      const labelKey = modules?.get(moduleId)?.manifest.labelKey;
      return (labelKey === undefined ? undefined : firstMessage(t, [labelKey])) ?? moduleId;
    },
    [t, modules],
  );
};

/** Label of a command (`tenancy.CreateProjectInput` → "Criar projetos"), as its agent tool is named; else the command id. */
export const useCommandLabel = (): ((commandId: string) => string) => {
  const toolLabel = useToolLabel();
  return useCallback(
    (commandId) => {
      const toolId = `${COMMAND_PREFIX}${commandId}`;
      const label = toolLabel(toolId);
      return label === toolId ? commandId : label;
    },
    [toolLabel],
  );
};
