import { describe, expect, it } from "vitest";
import { BackfillSearchNamesArgsError, parseBackfillSearchNamesArgs } from "./backfill-search-names-args.ts";

const BASE = ["--project", "acme-staging", "--confirm", "acme-staging"];

describe("parseBackfillSearchNamesArgs", () => {
  it("accepts a confirmed remote project with the defaults", () => {
    expect(parseBackfillSearchNamesArgs(BASE, { APP_ENV: "staging" })).toEqual({ projectId: "acme-staging", appEnv: "staging", dryRun: false, startAfter: undefined, batchSize: 200 });
  });

  it("reads the dry run, the checkpoint and the batch size", () => {
    const args = parseBackfillSearchNamesArgs([...BASE, "--dry-run", "--start-after", "uA1b2", "--batch-size", "50"], { APP_ENV: "staging" });
    expect(args).toMatchObject({ dryRun: true, startAfter: "uA1b2", batchSize: 50 });
  });

  it("refuses an unconfirmed project, unknown or repeated flags and a batch size out of range", () => {
    expect(() => parseBackfillSearchNamesArgs(["--project", "acme-staging", "--confirm", "acme-prod"], { APP_ENV: "staging" })).toThrow(/--confirm must equal --project/);
    expect(() => parseBackfillSearchNamesArgs(["--confirm", "acme-staging"], { APP_ENV: "staging" })).toThrow(BackfillSearchNamesArgsError);
    expect(() => parseBackfillSearchNamesArgs([...BASE, "--force"], { APP_ENV: "staging" })).toThrow(/--force/);
    expect(() => parseBackfillSearchNamesArgs([...BASE, "--project", "acme-staging"], { APP_ENV: "staging" })).toThrow(/given twice/);
    expect(() => parseBackfillSearchNamesArgs([...BASE, "--batch-size", "401"], { APP_ENV: "staging" })).toThrow(/--batch-size/);
  });

  it("keeps local runs on an emulator project and remote runs off one", () => {
    expect(() => parseBackfillSearchNamesArgs(BASE, { APP_ENV: "local" })).toThrow(/demo-\*/);
    expect(() => parseBackfillSearchNamesArgs(["--project", "demo-core", "--confirm", "demo-core"], { APP_ENV: "prod" })).toThrow(/demo-\*/);
    expect(parseBackfillSearchNamesArgs(["--project", "demo-core", "--confirm", "demo-core"], { APP_ENV: "local" }).projectId).toBe("demo-core");
  });
});
