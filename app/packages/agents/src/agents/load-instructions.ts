import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Versioned agent instructions (spec §6): `instructions/<agent>.v<N>.md` next to this
 * file is the source of truth; SP5 adds a per-tenant store override. The Mastra build
 * bundles this code into `.mastra/output`, so `apps/mastra` copies the folder into
 * `src/mastra/public/instructions` (served next to the bundle) and passes that directory.
 */

const INSTRUCTIONS_NAME = /^[a-z][a-z0-9-]*\.v\d+$/;

/** Bug: an agent asks for instructions that do not exist (boot error). */
export class InstructionsNotFoundError extends Error {
  readonly code = "INSTRUCTIONS_NOT_FOUND";

  constructor(name: string, options?: ErrorOptions) {
    super(`agent instructions ${name} not found`, options);
    this.name = "InstructionsNotFoundError";
  }
}

/** The directory of this package's instruction files (source layout: tests, `mastra dev`). */
export const PACKAGE_INSTRUCTIONS_DIR = path.join(import.meta.dirname, "instructions");

const candidateDirs = (dirs: readonly string[] | undefined): string[] => [...(dirs ?? []), PACKAGE_INSTRUCTIONS_DIR];

/**
 * Reads `<name>.md` (e.g. `knowledge.v1`), trimmed.
 * @param dirs directories tried first (the bundled copy of `apps/mastra`).
 * @throws {InstructionsNotFoundError} for an unknown or malformed name.
 */
export const loadInstructions = (name: string, dirs?: readonly string[]): string => {
  if (!INSTRUCTIONS_NAME.test(name)) throw new InstructionsNotFoundError(name);
  let lastError: unknown;
  for (const dir of candidateDirs(dirs)) {
    try {
      return readFileSync(path.join(dir, `${name}.md`), "utf8").trim();
    } catch (error: unknown) {
      // ENOENT: try the next directory; the last error becomes the cause.
      lastError = error;
    }
  }
  throw new InstructionsNotFoundError(name, { cause: lastError });
};
