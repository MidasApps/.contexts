import { describe, expect, it } from "vitest";
import { z } from "zod";
import { describeServerIssue, describeZodIssue } from "./issue-messages.ts";
import { mapServerErrors, toSchemaFormFailure } from "./server-errors.ts";

const rendered = new Set(["title", "budget"]);

describe("mapServerErrors", () => {
  it("maps dotted detail fields to their top-level form field, first issue wins", () => {
    const mapped = mapServerErrors(
      {
        code: "VALIDATION_FAILED",
        details: [
          { field: "budget.amountMinor", issue: "TOO_BIG" },
          { field: "title", issue: "TOO_SMALL" },
          { field: "budget.currency", issue: "INVALID_FORMAT" },
        ],
      },
      rendered,
    );
    expect(mapped).toEqual({
      fieldIssues: [
        { name: "budget", issue: "TOO_BIG" },
        { name: "title", issue: "TOO_SMALL" },
      ],
      showFormError: false,
    });
  });

  it("needs the form alert for fields not on screen and for other codes", () => {
    expect(
      mapServerErrors({ code: "VALIDATION_FAILED", details: [{ field: "id", issue: "INVALID_TYPE" }] }, rendered),
    ).toEqual({
      fieldIssues: [],
      showFormError: true,
    });
    expect(mapServerErrors({ code: "CONFLICT" }, rendered).showFormError).toBe(true);
  });

  it("turns a thrown error into a failure, keeping an API code and request id", () => {
    expect(toSchemaFormFailure({ code: "FORBIDDEN", requestId: "r1" })).toEqual({ code: "FORBIDDEN", requestId: "r1" });
    expect(toSchemaFormFailure(new TypeError("boom"))).toEqual({ code: "INTERNAL_ERROR", requestId: undefined });
  });
});

describe("issue messages", () => {
  const issuesOf = (schema: z.ZodType, value: unknown) => schema.safeParse(value).error?.issues ?? [];

  it("describes Zod issues with their limits and empty values as required", () => {
    const [short] = issuesOf(z.string().min(3), "ab");
    const [big] = issuesOf(z.number().max(9), 10);
    const [missing] = issuesOf(z.enum(["a", "b"]), undefined);
    const [notInt] = issuesOf(z.int(), 1.5);
    expect(short && describeZodIssue(short, "ab")).toEqual({
      key: "common.form.errors.tooShort",
      values: { minimum: 3 },
    });
    expect(big && describeZodIssue(big, 10)).toEqual({ key: "common.form.errors.tooBig", values: { maximum: 9 } });
    expect(missing && describeZodIssue(missing, undefined)).toEqual({ key: "common.form.errors.required" });
    expect(notInt && describeZodIssue(notInt, 1.5)).toEqual({ key: "common.form.errors.notInteger" });
  });

  it("describes server issue codes, falling back to the generic message", () => {
    expect(describeServerIssue("INVALID_VALUE")).toEqual({ key: "common.form.errors.invalidOption" });
    expect(describeServerIssue("TOO_SMALL")).toEqual({ key: "common.form.errors.invalid" });
  });
});
