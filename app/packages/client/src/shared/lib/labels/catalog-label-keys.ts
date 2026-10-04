/**
 * Message keys that may hold the human label of a code-defined id (decision 0052): workflows,
 * agents, tools, flags and permissions are named by convention, never by a key sent with the data,
 * so a row that carries only the id (a run, a schedule, an approval) still finds its label. Core
 * labels live in the core catalogs; a module ships its own under its namespace, keyed by the id
 * without the module prefix. Keys are candidates in order; the caller keeps the first that exists
 * and falls back to the id itself.
 */

// A message path segment: letters, digits and dashes, dot-separated. Anything else (a connector
// tool named with spaces or slashes) is never looked up.
const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*)*$/u;

const isSafe = (id: string): boolean => SAFE_PATH.test(id);

/**
 * Every way to split `id` into `<moduleId><separator><rest>` (module ids are kebab-case, so a
 * dashed id may belong to `a` or to `a-b`).
 * @example modulePrefixes("example-note-intake", "-") // [["example", "note-intake"], ["example-note", "intake"]]
 */
const modulePrefixes = (id: string, separator: "-" | "."): Array<readonly [string, string]> => {
  const parts = id.split(separator);
  return parts
    .slice(1)
    .map((_, index) => [parts.slice(0, index + 1).join(separator), parts.slice(index + 1).join(separator)] as const);
};

// The core's own prefixes are never module namespaces (`RESERVED_MODULE_IDS`).
const CORE_PREFIXES: ReadonlySet<string> = new Set(["core", "platform"]);

const moduleKeys = (id: string, separator: "-" | ".", group: string, leaf?: string): string[] =>
  modulePrefixes(id, separator)
    .filter(([moduleId]) => /^[a-z][a-z0-9-]*$/u.test(moduleId) && !CORE_PREFIXES.has(moduleId))
    .map(([moduleId, rest]) => [moduleId, group, rest, ...(leaf === undefined ? [] : [leaf])].join("."));

export type CatalogLabelPart = "name" | "description";

/** `common.workflows.<id>.<part>`, then `<moduleId>.workflows.<rest>.<part>` for `<moduleId>-<rest>`. */
export const workflowLabelKeys = (workflowId: string, part: CatalogLabelPart): string[] =>
  isSafe(workflowId) && !workflowId.includes(".")
    ? [`common.workflows.${workflowId}.${part}`, ...moduleKeys(workflowId, "-", "workflows", part)]
    : [];

/**
 * Label keys of one input field of a workflow: `common.workflows.<id>.input.<field>`, then the
 * module's `<moduleId>.workflows.<rest>.input.<field>`.
 */
export const workflowInputLabelKeys = (workflowId: string, field: string): string[] =>
  /^[A-Za-z0-9][A-Za-z0-9-]*$/u.test(field) && isSafe(workflowId) && !workflowId.includes(".")
    ? [`common.workflows.${workflowId}.input.${field}`, ...moduleKeys(workflowId, "-", "workflows", `input.${field}`)]
    : [];

/** `common.agents.<key>`, then `<moduleId>.agents.<rest>` for `<moduleId>-<rest>`. */
export const agentLabelKeys = (agentKey: string): string[] =>
  isSafe(agentKey) && !agentKey.includes(".")
    ? [`common.agents.${agentKey}`, ...moduleKeys(agentKey, "-", "agents")]
    : [];

/** `common.flags.<dotted key>.<part>` (flags are core only). */
export const flagLabelKeys = (flagKey: string, part: CatalogLabelPart): string[] =>
  isSafe(flagKey) ? [`common.flags.${flagKey}.${part}`] : [];

/** The tool id behind a stream tool name: the AI SDK names tools by their id with dots as underscores. */
export const normalizeToolId = (toolName: string): string => toolName.replaceAll("_", ".");

/** `chat.tools.<id>`, then `<moduleId>.tools.<rest>` for `<moduleId>.<rest>`. */
export const toolLabelKeys = (toolId: string): string[] =>
  isSafe(toolId) ? [`chat.tools.${toolId}`, ...moduleKeys(toolId, ".", "tools").slice(0, 1)] : [];

/** `permissions.<id>` (core and platform), then `<moduleId>.permissions.<rest>` (the module convention). */
export const permissionLabelKeys = (permission: string): string[] =>
  isSafe(permission) ? [`permissions.${permission}`, ...moduleKeys(permission, ".", "permissions").slice(0, 1)] : [];
