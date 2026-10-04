/**
 * What the knowledge base accepts, shown as a hint and checked before any request so an obvious
 * mistake gets an immediate message. The server is the validator (`files` upload policy: declared
 * type and size, then the bytes); this list only mirrors it for the copy.
 */
export const KNOWLEDGE_CONTENT_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
] as const;
export const KNOWLEDGE_EXTENSIONS = [".pdf", ".txt", ".md", ".csv", ".json"] as const;
export const KNOWLEDGE_MAX_BYTES = 25 * 1024 * 1024;

const BY_EXTENSION: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  json: "application/json",
};

export type KnowledgeFileProblem = "EMPTY" | "TYPE_NOT_ALLOWED" | "TOO_LARGE";

/** The media type to declare: the browser's, or the extension's when the browser reports none (common for `.md`). */
export const contentTypeOfFile = (file: { name: string; type: string }): string => {
  const declared = (file.type.split(";")[0] ?? "").trim().toLowerCase();
  if (declared !== "") return declared;
  const extension = file.name.includes(".") ? (file.name.split(".").pop() ?? "").toLowerCase() : "";
  return BY_EXTENSION[extension] ?? "";
};

export const checkKnowledgeFile = (file: { name: string; type: string; size: number }): KnowledgeFileProblem | null => {
  if (file.size === 0) return "EMPTY";
  if (!(KNOWLEDGE_CONTENT_TYPES as readonly string[]).includes(contentTypeOfFile(file))) return "TYPE_NOT_ALLOWED";
  return file.size > KNOWLEDGE_MAX_BYTES ? "TOO_LARGE" : null;
};

/** A public https URL (the API accepts nothing else). */
export const isHttpsUrl = (text: string): boolean => {
  try {
    return new URL(text).protocol === "https:";
  } catch {
    // TypeError: not a URL.
    return false;
  }
};
