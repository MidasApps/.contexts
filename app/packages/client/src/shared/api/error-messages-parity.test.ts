import { CORE_ERROR_CODES } from "@core/contracts";
import { CORE_MESSAGES, SUPPORTED_LOCALES } from "@core/i18n";
import { describe, expect, it } from "vitest";
import { CLIENT_ERROR_CODES } from "./api-error.ts";

describe("error messages", () => {
  it.each(SUPPORTED_LOCALES)("%s has an errors.* message for every API and client error code", (locale) => {
    const messages: Record<string, unknown> = CORE_MESSAGES[locale].errors;
    const missing = [...CORE_ERROR_CODES, ...CLIENT_ERROR_CODES].filter(
      (code) => typeof messages[code] !== "string" || messages[code] === "",
    );
    expect(missing).toEqual([]);
  });
});
