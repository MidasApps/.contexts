"use client";

import type { ContractDefinition } from "@core/contracts";
import { createContext, type ReactNode, use, useMemo } from "react";
import type { UiSubmission } from "#/entities/message/index.ts";
import type { UiRegistry } from "./ui-registry.ts";

/** Which tool call a submission answers. */
export type SubmissionOrigin = { readonly toolCallId: string; readonly toolName: string };

export type GenerativeUiEnvironment = {
  readonly registry: UiRegistry;
  /** The contract of an id (`example.CreateNoteCommand`), or `undefined` when the client has none. */
  readonly findContract: (contractId: string) => ContractDefinition | undefined;
  /** Sends what the member answered in a component (a submitted form, a choice). */
  readonly submit: (submission: UiSubmission, origin: SubmissionOrigin) => Promise<void> | void;
  /** Href of an approval request in the approvals inbox. */
  readonly approvalHref: (approvalId: string) => string;
  /** Permission check for form fields behind `ui.visibleWith`; denies when absent. */
  readonly can?: ((permission: string) => boolean) | undefined;
  /** Currency of new money values (`AccessContext.regional.currency`). */
  readonly defaultCurrency?: string | undefined;
};

export type GenerativeUiProviderProps = Omit<GenerativeUiEnvironment, "findContract" | "approvalHref"> & {
  /** Contracts forms may render: the core's and the installed modules'. */
  readonly contracts: readonly ContractDefinition[];
  /** Defaults to `/approvals/{approvalId}` (the inbox route of the SP4 plan). */
  readonly approvalHref?: ((approvalId: string) => string) | undefined;
  readonly children: ReactNode;
};

const defaultApprovalHref = (approvalId: string): string => `/approvals/${encodeURIComponent(approvalId)}`;

const GenerativeUiContext = createContext<GenerativeUiEnvironment | null>(null);

/** Gives generative components their registry, the contracts they may render and the way to answer. */
export function GenerativeUiProvider({
  registry,
  contracts,
  submit,
  approvalHref,
  can,
  defaultCurrency,
  children,
}: GenerativeUiProviderProps) {
  const byId = useMemo(() => new Map(contracts.map((contract) => [contract.id, contract])), [contracts]);
  const environment: GenerativeUiEnvironment = {
    registry,
    findContract: (contractId) => byId.get(contractId),
    submit,
    approvalHref: approvalHref ?? defaultApprovalHref,
    can,
    defaultCurrency,
  };
  return <GenerativeUiContext value={environment}>{children}</GenerativeUiContext>;
}

/**
 * The generative UI environment.
 * @throws {Error} outside `GenerativeUiProvider` (a composition bug).
 */
export const useGenerativeUi = (): GenerativeUiEnvironment => {
  const environment = use(GenerativeUiContext);
  if (environment === null) throw new Error("useGenerativeUi must be used inside GenerativeUiProvider");
  return environment;
};
