import { randomFillSync } from "node:crypto";

/**
 * RFC 9562 UUIDv7: 48-bit Unix milliseconds, version 7, variant 10, 74 random bits.
 * Ledger rows get their id here (not from Postgres) so a retried batch and the
 * BigQuery `insertId` keep the same identity (decision 0026).
 * @param nowMs clock seam for tests; @param random fills the 10 random bytes.
 */
export const uuidv7 = (nowMs: number = Date.now(), random: (bytes: Uint8Array) => void = randomFillSync): string => {
  const bytes = new Uint8Array(16);
  random(bytes.subarray(6));
  const millis = BigInt(Math.max(0, Math.trunc(nowMs)));
  for (let index = 0; index < 6; index += 1) bytes[index] = Number((millis >> BigInt(8 * (5 - index))) & 0xffn);
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
