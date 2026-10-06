import { createHash } from "node:crypto";

/**
 * Citation markers of knowledge answers (SP3 spec §11): `kb:<documentId>#<chunkIndex>`,
 * written by the model in square brackets after each claim, e.g. `[kb:0192…#3]`.
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** A bracketed marker, as instructions ask the model to write it. */
export const CITATION_MARKER_PATTERN = new RegExp(`\\[(kb:${UUID}#\\d+)\\]`, "gi");

/** A bare citation id anywhere in a text (tool outputs, JSON). */
const CITATION_ID_PATTERN = new RegExp(`kb:${UUID}#\\d+`, "gi");

export const citationIdOf = (documentId: string, chunkIndex: number): string => `kb:${documentId}#${chunkIndex}`;

/** Every distinct citation id in a text, lowercased, in order of first appearance. */
export const extractCitationIds = (text: string): string[] => [
  ...new Set([...text.matchAll(CITATION_ID_PATTERN)].map((match) => match[0].toLowerCase())),
];

/** SHA-256 hex of the extracted text: unchanged content is not re-embedded (`content_hash`). */
export const contentHashOf = (text: string): string => createHash("sha256").update(text).digest("hex");
