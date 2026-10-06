import { DeviceActivationCodeSchema } from "@core/contracts";
import { InvalidRandomBytesError, type RandomBytes } from "../../access/domain/invitation-token.ts";
import { sha256Hex } from "../../shared/crypto/sha256.ts";

/** 40 bits: 8 Crockford base32 chars (decision 0008, device activation §1). */
export const ACTIVATION_CODE_BYTES = 5;

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * A new activation code: 5 random bytes as 8 Crockford base32 chars (exactly 40 bits).
 * @throws {InvalidRandomBytesError} when `randomBytes` returns fewer than 5 bytes.
 */
export const generateActivationCode = (randomBytes: RandomBytes): string => {
  const bytes = randomBytes(ACTIVATION_CODE_BYTES);
  if (bytes.length < ACTIVATION_CODE_BYTES) throw new InvalidRandomBytesError();
  let value = 0n;
  for (const byte of bytes.subarray(0, ACTIVATION_CODE_BYTES)) value = (value << 8n) | BigInt(byte);
  let code = "";
  for (let shift = 35n; shift >= 0n; shift -= 5n) code += CROCKFORD[Number((value >> shift) & 31n)];
  return code;
};

/**
 * What a person typed → the canonical code: upper-case, `-` and spaces removed, `O→0`,
 * `I`/`L→1` (Crockford decoding).
 * @returns null when the result is not 8 Crockford chars.
 */
export const normalizeActivationCode = (typed: string): string | null => {
  const normalized = typed.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  return DeviceActivationCodeSchema.safeParse(normalized).success ? normalized : null;
};

/** What `device-activations.codeHash` stores. */
export const hashActivationCode = (code: string): string => sha256Hex(code);
