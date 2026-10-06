import { citationHref } from "#/shared/lib/markdown/link-policy.ts";

// Citation markers of knowledge answers (SP3 spec §11): `[kb:<documentId>#<chunkIndex>]` after a
// claim. The reader sees a numbered marker; the id resolves against the passages of the turn.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MARKER = new RegExp(`\\s*\\[(kb:${UUID}#\\d+)\\]`, "gi");
/** A marker cut by streaming (`[kb:0192…` without its `]`): hidden until it completes. */
const PARTIAL_MARKER = /\s*\[(?:k|kb|kb:[0-9a-f#-]*)$/i;

export type LinkedCitations = {
  /** Markdown with each marker replaced by a `[n](#cite-n)` link (`SafeMarkdown` renders it). */
  readonly text: string;
  /** Citation ids in order of first appearance; `n` is the 1-based index here. */
  readonly order: readonly string[];
};

/**
 * Numbers the citation markers of a text. Pass the `order` of the previous text part of the
 * same message so numbers continue across parts and a repeated source keeps its number.
 * @example linkCitationMarkers("Prazo de 30 dias [kb:0192…#3].").text // "Prazo de 30 dias [1](#cite-1)."
 */
export const linkCitationMarkers = (text: string, previous: readonly string[] = []): LinkedCitations => {
  const order = [...previous];
  const linked = text.replace(PARTIAL_MARKER, "").replace(MARKER, (_marker: string, id: string) => {
    const key = id.toLowerCase();
    let index = order.indexOf(key);
    if (index === -1) index = order.push(key) - 1;
    return `[${index + 1}](${citationHref(index + 1)})`;
  });
  return { text: linked, order };
};
