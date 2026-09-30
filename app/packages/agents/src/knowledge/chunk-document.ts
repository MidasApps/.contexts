/**
 * Deterministic document chunker of the knowledge ingestion (SP3 spec §11): a
 * recursive splitter that prefers Markdown headings, then paragraphs, lines,
 * sentences and words, packs pieces up to `maxSize` characters and repeats the
 * tail of each chunk (`overlap`) at the start of the next one.
 *
 * Own code instead of `@mastra/rag` `MDocument` (decision 0022 amendment of Task
 * 14): the package pulls the AWS Bedrock runtime SDK and an alpha reranker client
 * into the runtime for a pure string function.
 */

export type ChunkFormat = "markdown" | "text";

export type DocumentChunk = { readonly index: number; readonly text: string; readonly tokenCount: number };

export type ChunkOptions = { readonly maxSize?: number; readonly overlap?: number; readonly format?: ChunkFormat };

/** ~512 tokens at ~4 characters per token (spec §11). */
export const DEFAULT_CHUNK_SIZE = 2000;
export const DEFAULT_CHUNK_OVERLAP = 200;
const CHARS_PER_TOKEN = 4;

const SEPARATORS: Readonly<Record<ChunkFormat, readonly string[]>> = {
  markdown: ["\n# ", "\n## ", "\n### ", "\n#### ", "\n\n", "\n", ". ", " "],
  text: ["\n\n", "\n", ". ", " "],
};

/** Token estimate used for `token_count` (the real tokenizer depends on the model). */
export const estimateTokens = (text: string): number => Math.ceil(text.length / CHARS_PER_TOKEN);

const normalize = (text: string): string =>
  text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    // `trim()` also drops a leading byte order mark (U+FEFF is whitespace in JS).
    .trim();

// Splits keeping each separator at the start of the piece it introduces.
const splitKeeping = (text: string, separator: string): string[] => {
  const pieces: string[] = [];
  let start = 0;
  for (let at = text.indexOf(separator, 1); at !== -1; at = text.indexOf(separator, at + separator.length)) {
    pieces.push(text.slice(start, at));
    start = at;
  }
  pieces.push(text.slice(start));
  return pieces.filter((piece) => piece !== "");
};

const hardSplit = (text: string, size: number): string[] => {
  const pieces: string[] = [];
  for (let start = 0; start < text.length; start += size) pieces.push(text.slice(start, start + size));
  return pieces;
};

/** Pieces no longer than `size`, cut at the coarsest separator that works. */
const splitRecursive = (text: string, size: number, separators: readonly string[]): string[] => {
  if (text.length <= size) return [text];
  const index = separators.findIndex((separator) => text.includes(separator, 1));
  if (index === -1) return hardSplit(text, size);
  const rest = separators.slice(index + 1);
  return splitKeeping(text, separators[index] ?? " ").flatMap((piece) => splitRecursive(piece, size, rest));
};

/** Greedily packs consecutive pieces while they fit in `size`. */
const pack = (pieces: readonly string[], size: number): string[] => {
  const packed: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current !== "" && current.length + piece.length > size) {
      packed.push(current);
      current = "";
    }
    current += piece;
  }
  if (current !== "") packed.push(current);
  return packed;
};

// The tail of the previous chunk, starting at a word boundary.
const tailOf = (text: string, overlap: number): string => {
  if (overlap <= 0 || text.length <= overlap) return overlap <= 0 ? "" : text;
  const tail = text.slice(-overlap);
  const space = tail.indexOf(" ");
  return space === -1 ? tail : tail.slice(space + 1);
};

/**
 * Splits a document into chunks of at most `maxSize` characters.
 * @example chunkDocument("# Guide\n\nMembers join after approval.", { format: "markdown" })
 */
export const chunkDocument = (text: string, options: ChunkOptions = {}): DocumentChunk[] => {
  const maxSize = options.maxSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = Math.min(options.overlap ?? DEFAULT_CHUNK_OVERLAP, Math.floor(maxSize / 2));
  const clean = normalize(text);
  if (clean === "") return [];
  const body = pack(splitRecursive(`\n${clean}`, maxSize - overlap, SEPARATORS[options.format ?? "text"]), maxSize - overlap);
  const chunks = body.map((piece, position) => `${position === 0 ? "" : tailOf(body[position - 1] ?? "", overlap)}${piece}`.trim());
  return chunks.filter((chunk) => chunk !== "").map((chunk, index) => ({ index, text: chunk, tokenCount: estimateTokens(chunk) }));
};
