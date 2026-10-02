"use client";

import { KnowledgeSourceSchema } from "@core/contracts";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import type { StartedKnowledgeIngestion } from "#/features/knowledge-upload/index.ts";

const StoredIngestionsSchema = z.array(
  z.object({
    runId: z.string().min(1),
    label: z.string(),
    sourceRef: z.string().min(1),
    projectId: z.string().min(1).optional(),
    source: KnowledgeSourceSchema,
  }),
);

const storageKey = (organizationId: string): string => `core.knowledge.ingestions.${organizationId}`;

/** What this tab stored; anything unreadable (blocked storage, old shape) reads as nothing. */
const readStored = (organizationId: string): StartedKnowledgeIngestion[] => {
  try {
    const raw = globalThis.sessionStorage.getItem(storageKey(organizationId));
    if (raw === null) return [];
    const parsed = StoredIngestionsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.map((run) => ({ ...run, projectId: run.projectId })) : [];
  } catch {
    return [];
  }
};

const writeStored = (organizationId: string, runs: readonly StartedKnowledgeIngestion[]): void => {
  try {
    globalThis.sessionStorage.setItem(storageKey(organizationId), JSON.stringify(runs));
  } catch {
    // Storage full or blocked: the notices still work for this visit.
  }
};

/**
 * Knowledge ingestions started from the settings page, kept in `sessionStorage` per organization
 * (UX review U-61): after a reload or a visit elsewhere, a pending run is followed again and one
 * that failed meanwhile shows its failure with retry. Only the tab that started them sees them;
 * dismissing, a retry and a finished run update the store.
 */
export const useStartedIngestions = (organizationId: string) => {
  const [started, setStarted] = useState<readonly StartedKnowledgeIngestion[]>(() => readStored(organizationId));
  useEffect(() => writeStored(organizationId, started), [organizationId, started]);
  const add = useCallback((run: StartedKnowledgeIngestion) => setStarted((runs) => [...runs, run]), []);
  const dismiss = useCallback((runId: string) => setStarted((runs) => runs.filter((run) => run.runId !== runId)), []);
  const restart = useCallback(
    (previousRunId: string, next: StartedKnowledgeIngestion) => setStarted((runs) => runs.map((run) => (run.runId === previousRunId ? next : run))),
    [],
  );
  return { started, add, dismiss, restart };
};
