import { describe, expect, it } from "vitest";
import { formatFileSize } from "./file-size.ts";

const format = (locale: string) => (value: number, options: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(locale, options).format(value);

describe("formatFileSize", () => {
  it("picks bytes, kilobytes or megabytes and follows the locale", () => {
    expect(formatFileSize(512, format("en-US"))).toBe("512 byte");
    expect(formatFileSize(48 * 1024, format("en-US"))).toBe("48 kB");
    expect(formatFileSize(1.25 * 1024 * 1024, format("pt-BR"))).toBe("1,3 MB");
  });
});
