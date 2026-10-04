"use client";

import type { KnowledgeDocumentStatus } from "@core/contracts";
import { useTranslations } from "use-intl";
import { StatusPill, type StatusTone } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";

const TONES: Record<KnowledgeDocumentStatus, StatusTone> = {
  pending: "blue",
  ready: "emerald",
  failed: "danger",
  deleted: "neutral",
};

/** Indexing status of a document; the text carries the meaning, the tone only reinforces it. */
export function KnowledgeStatusPill({ status }: { status: KnowledgeDocumentStatus }) {
  const t = useTranslations("settings.knowledge.status");
  return <StatusPill tone={TONES[status]}>{t(status)}</StatusPill>;
}
