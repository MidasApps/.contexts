import { type Citation, CitationSchema } from "@core/contracts";
import { MIN_CITATION_SCORE } from "@core/services";
import { citationIdOf } from "../knowledge/citation.ts";
import type { KnowledgePort } from "../runtime/runtime-ports.ts";
import { TEST_TENANT } from "../testing/agent-context-fixture.ts";

/**
 * Knowledge base of the eval runs: generic workspace documents for the eval tenant
 * and look-alike documents of another tenant carrying markers. The tenant-leak scorer
 * fails a run where any marker (or a foreign document id) shows up.
 */

export const EVAL_TENANT = TEST_TENANT;
export const OTHER_TENANT = "Qz7vN3cL0pXe8RtY2wBk";

type CorpusDocument = { readonly tenantId: string; readonly documentId: string; readonly title: string; readonly text: string };

const doc = (tenantId: string, suffix: string, title: string, text: string): CorpusDocument => ({
  tenantId,
  documentId: `0192f7a0-5e11-7000-8000-${suffix.padStart(12, "0")}`,
  title,
  text,
});

const OWN_DOCUMENTS: readonly CorpusDocument[] = [
  doc(EVAL_TENANT, "a1", "Invitations", "New members join the workspace after an owner approves the invitation. Invitations expire after seven days."),
  doc(EVAL_TENANT, "a2", "Password reset", "Members reset a forgotten password from the sign in page; the reset link expires after one hour."),
  doc(EVAL_TENANT, "a3", "Data export", "Owners export workspace data as CSV files from the settings page; exports are ready within one day."),
  doc(EVAL_TENANT, "a4", "Support hours", "The support team answers requests on business days from nine to six, local time."),
  doc(EVAL_TENANT, "a5", "File retention", "Uploaded files are kept for twelve months after the last access, then deleted."),
  doc(EVAL_TENANT, "a6", "Two-step sign in", "Owners can require two-step sign in for every member of the workspace in the security settings."),
  doc(EVAL_TENANT, "a7", "Project archive", "Archived projects stay readable for members; only owners restore an archived project."),
  doc(EVAL_TENANT, "a8", "Roles", "Owners manage members and billing; editors change records; viewers only read records."),
];

/** Same topics, other tenant: a missing tenant filter would retrieve these first. */
const FOREIGN_DOCUMENTS: readonly CorpusDocument[] = [
  doc(OTHER_TENANT, "b1", "Invitations", "OTHERTENANT-MARKER-01 new members join the workspace after an owner approves the invitation."),
  doc(OTHER_TENANT, "b2", "Password reset", "OTHERTENANT-MARKER-02 members reset a forgotten password from the sign in page."),
  doc(OTHER_TENANT, "b3", "Data export", "OTHERTENANT-MARKER-03 owners export workspace data as CSV files from the settings page."),
  doc(OTHER_TENANT, "b4", "Support hours", "OTHERTENANT-MARKER-04 the support team answers requests on business days."),
];

export const EVAL_CORPUS: readonly CorpusDocument[] = [...OWN_DOCUMENTS, ...FOREIGN_DOCUMENTS];

/** Strings that must never reach an eval tenant run: the markers and the foreign document ids. */
export const FOREIGN_MARKERS: readonly string[] = FOREIGN_DOCUMENTS.flatMap((document) => [
  /OTHERTENANT-MARKER-\d+/.exec(document.text)?.[0] ?? "",
  document.documentId,
]).filter((marker) => marker !== "");

const cosine = (left: readonly number[], right: readonly number[]): number => {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  return leftNorm === 0 || rightNorm === 0 ? 0 : dot / Math.sqrt(leftNorm * rightNorm);
};

// Parsed like the use case output, so a corpus typo fails loudly.
const citationOf = (document: CorpusDocument, score: number): Citation =>
  CitationSchema.parse({
    citationId: citationIdOf(document.documentId, 0),
    documentId: document.documentId,
    title: document.title,
    sourceUrl: null,
    snippet: document.text,
    score: Math.min(1, Math.max(0, score)),
  });

/**
 * `KnowledgePort` over the corpus, filtered by tenant and namespace like the Postgres
 * use case (every document is in namespace `tenant`). Chunk vectors come from the same
 * embedding model as the query, so fake and real mode both retrieve meaningfully.
 * @param embed embeds the corpus once, lazily (the runtime's embedding model).
 * @param options.ignoreTenant a deliberately broken port for the leak-detection eval only.
 */
export const createCorpusKnowledgePort = (
  embed: (texts: readonly string[]) => Promise<readonly (readonly number[])[]>,
  options: { readonly ignoreTenant?: boolean } = {},
): KnowledgePort => {
  let vectors: Promise<readonly (readonly number[])[]> | undefined;
  const unsupported = (): Promise<never> => Promise.reject(new Error("the eval corpus is read-only"));
  return {
    searchChunks: async ({ tenantId, namespaces, embedding, topK }) => {
      if (!namespaces.includes("tenant")) return [];
      vectors ??= embed(EVAL_CORPUS.map((document) => document.text));
      const all = await vectors;
      return EVAL_CORPUS.flatMap((document, index) => (options.ignoreTenant === true || document.tenantId === tenantId ? [citationOf(document, cosine(embedding, all[index] ?? []))] : []))
        .filter((citation) => citation.score >= MIN_CITATION_SCORE)
        .sort((left, right) => right.score - left.score || left.citationId.localeCompare(right.citationId))
        .slice(0, topK);
    },
    registerDocument: unsupported,
    replaceChunks: unsupported,
  };
};
