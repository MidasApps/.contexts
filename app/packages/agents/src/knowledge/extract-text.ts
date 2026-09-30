import type { ChunkFormat } from "./chunk-document.ts";

/**
 * Text extraction of the knowledge ingestion (SP3 spec §11): plain text,
 * Markdown, CSV and JSON are read as UTF-8; HTML is reduced to its text; PDF
 * goes through the optional `parsePdf` hook (Firecrawl `parse`, SP3 Task 23)
 * and is `UNSUPPORTED_MEDIA` while no parser is configured.
 */

export type ExtractedText = { readonly text: string; readonly format: ChunkFormat };

export type ExtractTextError = { readonly code: "UNSUPPORTED_MEDIA"; readonly contentType: string } | { readonly code: "EMPTY_CONTENT" };

export type ExtractTextResult = { readonly ok: true; readonly data: ExtractedText } | { readonly ok: false; readonly error: ExtractTextError };

/** Turns PDF bytes into Markdown; configured only when a parser service exists. */
export type PdfParser = (bytes: Uint8Array) => Promise<string>;

const decodeUtf8 = (bytes: Uint8Array): string => new TextDecoder("utf-8").decode(bytes);

const ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Visible text of an HTML page: scripts, styles and tags removed, common entities decoded. */
export const htmlToText = (html: string): string =>
  html
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|section|article|li|tr|h[1-6])\s*>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|[a-z]+);/gi, (entity, name: string) => {
      if (name.startsWith("#")) return String.fromCodePoint(Number(name.slice(1)));
      return ENTITIES[name.toLowerCase()] ?? entity;
    })
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();

const TEXT_TYPES: Readonly<Record<string, ChunkFormat>> = {
  "text/plain": "text",
  "text/markdown": "markdown",
  "text/csv": "text",
  "application/json": "text",
};

const baseType = (contentType: string): string => (contentType.split(";")[0] ?? "").trim().toLowerCase();

const fromText = (text: string, format: ChunkFormat): ExtractTextResult =>
  text.trim() === "" ? { ok: false, error: { code: "EMPTY_CONTENT" } } : { ok: true, data: { text, format } };

/** Extracts the indexable text of a document. */
export const extractText = async (input: { readonly bytes: Uint8Array; readonly contentType: string; readonly parsePdf?: PdfParser }): Promise<ExtractTextResult> => {
  const type = baseType(input.contentType);
  const textFormat = TEXT_TYPES[type];
  if (textFormat !== undefined) return fromText(decodeUtf8(input.bytes), textFormat);
  if (type === "text/html") return fromText(htmlToText(decodeUtf8(input.bytes)), "text");
  if (type === "application/pdf" && input.parsePdf !== undefined) return fromText(await input.parsePdf(input.bytes), "markdown");
  return { ok: false, error: { code: "UNSUPPORTED_MEDIA", contentType: type } };
};
