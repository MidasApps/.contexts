import { createHash } from "node:crypto";

/** SHA-256 of UTF-8 text as lower-case hex; used for opaque document ids and request hashes. */
export const sha256Hex = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
