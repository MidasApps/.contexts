import { describe, expect, it } from "vitest";
import { z } from "zod";
import { inspectSchema } from "../field-meta-rules.ts";
import {
  dataEnvelope,
  ErrorCodeSchema,
  ErrorEnvelopeContract,
  ErrorEnvelopeSchema,
  listEnvelope,
  PageMetaSchema,
  PageQuerySchema,
} from "./envelopes.schema.ts";

const ItemSchema = z.object({ name: z.string() });

describe("dataEnvelope", () => {
  it("wraps a single resource in data", () => {
    expect(dataEnvelope(ItemSchema).parse({ data: { name: "a" } })).toEqual({ data: { name: "a" } });
  });

  it("rejects an array at the root", () => {
    expect(dataEnvelope(ItemSchema).safeParse([{ name: "a" }]).success).toBe(false);
  });
});

describe("listEnvelope", () => {
  it("wraps a list with meta.page", () => {
    const body = { data: [{ name: "a" }], meta: { page: { cursor: "abc", hasMore: true, limit: 20 } } };
    expect(listEnvelope(ItemSchema).parse(body)).toEqual(body);
  });

  it("accepts the end of the list as a null cursor", () => {
    const body = { data: [], meta: { page: { cursor: null, hasMore: false, limit: 20 } } };
    expect(listEnvelope(ItemSchema).safeParse(body).success).toBe(true);
  });

  it("requires meta.page", () => {
    expect(listEnvelope(ItemSchema).safeParse({ data: [] }).success).toBe(false);
  });
});

describe("ErrorEnvelopeSchema", () => {
  it("accepts the canonical error body with details", () => {
    const body = {
      error: {
        code: "VALIDATION_FAILED",
        message: "One or more fields are invalid.",
        details: [{ field: "email", issue: "INVALID_FORMAT" }],
        requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
      },
    };
    expect(ErrorEnvelopeSchema.parse(body)).toEqual(body);
  });

  it("requires requestId", () => {
    expect(ErrorEnvelopeSchema.safeParse({ error: { code: "NOT_FOUND", message: "Not found." } }).success).toBe(false);
  });

  it("is a registered-ready contract without personal data", () => {
    expect(ErrorEnvelopeContract.meta).toMatchObject({ id: "http.ErrorEnvelope", pii: "none" });
  });
});

describe("ErrorCodeSchema", () => {
  it.each(["NOT_FOUND", "IDEMPOTENCY_KEY_REUSED", "E2E_FAILED"])("accepts %s", (code) => {
    expect(ErrorCodeSchema.safeParse(code).success).toBe(true);
  });

  it.each(["not_found", "NotFound", "_NOT", "NOT__FOUND", "NOT_", ""])("rejects %j", (code) => {
    expect(ErrorCodeSchema.safeParse(code).success).toBe(false);
  });
});

describe("PageQuerySchema", () => {
  it("defaults limit to 20 and leaves cursor absent", () => {
    expect(PageQuerySchema.parse({})).toEqual({ limit: 20 });
  });

  it("reads limit from a query-string value", () => {
    expect(PageQuerySchema.parse({ cursor: "abc", limit: "100" })).toEqual({ cursor: "abc", limit: 100 });
  });

  it.each(["0", "101", "2.5", "x"])("rejects limit %s", (limit) => {
    expect(PageQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it("rejects an empty cursor", () => {
    expect(PageQuerySchema.safeParse({ cursor: "" }).success).toBe(false);
  });
});

describe("field meta of the shared envelopes", () => {
  it("gives every field of PageMeta, PageQuery and listEnvelope a description and pii", () => {
    const Item = z.object({ name: z.string().meta({ description: "Name.", pii: "none" }) });
    for (const schema of [PageMetaSchema, PageQuerySchema, listEnvelope(Item)]) {
      expect(inspectSchema(schema)).toEqual({ problems: [], maxPii: "none" });
    }
  });
});
