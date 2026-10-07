import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadModuleMigrations,
  ModuleMigrationsError,
  moduleSqlNames,
  parseModuleMigrations,
} from "./module-migrations.ts";

const ROOT = path.resolve("/workspace");
const withJournal = (): boolean => true;

const problemsOf = (value: unknown, hasJournal: (folder: string) => boolean = withJournal): readonly string[] => {
  try {
    parseModuleMigrations(ROOT, value, hasJournal);
    return [];
  } catch (error: unknown) {
    if (error instanceof ModuleMigrationsError) return error.problems;
    throw error;
  }
};

describe("moduleSqlNames", () => {
  it("maps a kebab-case id to its schema, runtime role and journal table", () => {
    expect(moduleSqlNames("field-service")).toEqual({
      schema: "field_service",
      runtimeRole: "field_service_runtime",
      journalTable: "module_field_service",
    });
  });
});

describe("parseModuleMigrations", () => {
  it("resolves each folder against the workspace root", () => {
    const modules = parseModuleMigrations(
      ROOT,
      [{ moduleId: "example", folder: "modules/example/migrations" }],
      withJournal,
    );
    expect(modules).toEqual([
      {
        moduleId: "example",
        schema: "example",
        runtimeRole: "example_runtime",
        journalTable: "module_example",
        folder: path.join(ROOT, "modules/example/migrations"),
      },
    ]);
  });

  it("accepts an empty list and refuses a value that is not a list", () => {
    expect(parseModuleMigrations(ROOT, [], withJournal)).toEqual([]);
    expect(problemsOf(undefined)).toEqual(["must export MODULE_MIGRATIONS (an array)"]);
  });

  it("names every problem at once", () => {
    const problems = problemsOf([
      { moduleId: "Example", folder: "x" },
      { moduleId: "example", folder: "modules/example/migrations" },
      { moduleId: "example", folder: "modules/example/migrations" },
      { moduleId: "usage", folder: "modules/usage/migrations" },
      { moduleId: "web", folder: "modules/web/migrations" },
      { moduleId: "outside", folder: "../elsewhere" },
    ]);
    expect(problems).toEqual([
      "entry 0 must be { moduleId: kebab-case, folder }",
      "example is listed twice",
      "usage maps to the reserved schema usage",
      "web maps to the reserved schema web",
      "outside: the folder must be inside the workspace",
    ]);
  });

  it("refuses a folder without a journal", () => {
    expect(problemsOf([{ moduleId: "example", folder: "modules/example/migrations" }], () => false)).toEqual([
      "example: modules/example/migrations has no meta/_journal.json",
    ]);
  });
});

describe("loadModuleMigrations", () => {
  it("answers no module when the workspace has no migrations.modules.ts", async () => {
    expect(await loadModuleMigrations(path.join(import.meta.dirname, "no-such-workspace"))).toEqual([]);
  });
});
