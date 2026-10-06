import { DeviceActivationCodeSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { InvalidRandomBytesError } from "../../access/domain/invitation-token.ts";
import { ACTIVATION_CODE_BYTES, generateActivationCode, normalizeActivationCode } from "./activation-code.ts";

describe("activation code", () => {
  it("encodes 5 random bytes (40 bits) as 8 Crockford base32 chars", () => {
    expect(ACTIVATION_CODE_BYTES * 8).toBeGreaterThanOrEqual(40);
    expect(generateActivationCode(() => new Uint8Array([0, 0, 0, 0, 0]))).toBe("00000000");
    expect(generateActivationCode(() => new Uint8Array([255, 255, 255, 255, 255]))).toBe("ZZZZZZZZ");
    const code = generateActivationCode(() => new Uint8Array([0x3a, 0x91, 0x7c, 0x05, 0xee]));
    expect(DeviceActivationCodeSchema.safeParse(code).success).toBe(true);
  });

  it("gives every byte pattern a distinct code (no truncation of entropy)", () => {
    const codes = new Set<string>();
    for (let value = 0; value < 256; value += 1)
      codes.add(generateActivationCode(() => new Uint8Array([value, 0, 0, 0, value])));
    expect(codes.size).toBe(256);
  });

  it("refuses a generator that returns fewer bytes", () => {
    expect(() => generateActivationCode(() => new Uint8Array(4))).toThrow(InvalidRandomBytesError);
  });

  it("normalizes what a person types: case, dashes, spaces and look-alike letters", () => {
    expect(normalizeActivationCode("7kq2-m9xa")).toBe("7KQ2M9XA");
    expect(normalizeActivationCode(" 7KQ2 M9XA ")).toBe("7KQ2M9XA");
    expect(normalizeActivationCode("OIL2M9XA")).toBe("0112M9XA");
    expect(normalizeActivationCode("7KQ2M9XU")).toBeNull();
    expect(normalizeActivationCode("7KQ2M9X")).toBeNull();
  });
});
