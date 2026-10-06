export type ModuleDefinitionErrorCode = "INVALID_MODULE";

/** A module manifest declared wrong is a bug: it fails when the app composes its modules, never at request time. */
export class ModuleDefinitionError extends Error {
  readonly code: ModuleDefinitionErrorCode = "INVALID_MODULE";
  readonly moduleId: string;
  readonly problems: readonly string[];

  constructor(args: { moduleId: string; problems: readonly string[] }) {
    super(`Module ${args.moduleId}: ${args.problems.join("; ")}`);
    this.name = "ModuleDefinitionError";
    this.moduleId = args.moduleId;
    this.problems = args.problems;
  }
}
