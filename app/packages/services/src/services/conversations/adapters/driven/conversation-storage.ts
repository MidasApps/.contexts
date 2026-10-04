import { type Conversation, ConversationSchema } from "@core/contracts";
import { type DocumentData, Timestamp } from "firebase-admin/firestore";
import { CORE_SCHEMA_VERSION } from "#/services/shared/firestore/collections.ts";
import { CorruptDocumentError } from "#/services/shared/firestore/corrupt-document-error.ts";
import type { CursorPosition } from "#/services/shared/pagination/cursor.ts";

/** Top-level collection of chat conversation metadata (decision 0033). */
export const CONVERSATIONS_COLLECTION = "conversations";

const TIME_FIELDS = [
  "lastMessageAt",
  "createdAt",
  "updatedAt",
  "archivedAt",
  "deletedAt",
  "activeStreamStartedAt",
] as const;
// `archived` mirrors `archivedAt != null`, so the list filters by equality (one composite index).
const STORAGE_ONLY_FIELDS = new Set(["schemaVersion", "archived"]);

const toTimestamp = (iso: string | null): Timestamp | null => (iso === null ? null : Timestamp.fromDate(new Date(iso)));

export const toConversationDocument = (conversation: Conversation): DocumentData => {
  const { id, ...fields } = conversation;
  void id;
  const document: DocumentData = {
    ...fields,
    archived: conversation.archivedAt !== null,
    schemaVersion: CORE_SCHEMA_VERSION,
  };
  for (const key of TIME_FIELDS) document[key] = toTimestamp(conversation[key]);
  return document;
};

/** @throws {CorruptDocumentError} when the stored document does not match the contract. */
export const fromConversationDocument = (
  id: string,
  path: string,
  data: DocumentData | undefined,
): Conversation | null => {
  if (data === undefined) return null;
  const fields = Object.fromEntries(Object.entries(data).filter(([key]) => !STORAGE_ONLY_FIELDS.has(key)));
  for (const key of TIME_FIELDS) if (fields[key] instanceof Timestamp) fields[key] = fields[key].toDate().toISOString();
  const parsed = ConversationSchema.safeParse({ ...fields, id });
  if (parsed.success) return parsed.data;
  throw new CorruptDocumentError({
    documentPath: path,
    issuePaths: [...new Set(parsed.error.issues.map((issue) => issue.path.map(String).join(".")))],
  });
};

const PINNED = "1";
const UNPINNED = "0";

/** Cursor position of the list order `pinned desc, lastMessageAt desc, id desc`. */
export const conversationPosition = (conversation: Conversation): CursorPosition => [
  `${conversation.pinned ? PINNED : UNPINNED}|${conversation.lastMessageAt}`,
  conversation.id,
];

/** @returns `[pinned, lastMessageAt]` of a position, or `null` for a position of another list. */
export const parseConversationPosition = (
  position: CursorPosition,
): { pinned: boolean; lastMessageAt: string } | null => {
  const [flag, lastMessageAt] = position[0].split("|");
  if ((flag !== PINNED && flag !== UNPINNED) || lastMessageAt === undefined || Number.isNaN(Date.parse(lastMessageAt)))
    return null;
  return { pinned: flag === PINNED, lastMessageAt };
};
