// Public API of the prompt-version entity (SP5 Task 12): platform prompt versions and activations of an agent.
export {
  activeVersionOf,
  promptActivationsQuery,
  promptVersionKeys,
  promptVersionsQuery,
  usePromptActivations,
  usePromptVersions,
} from "./api/prompt-version-queries.ts";
export { PromptVerdictPill } from "./ui/PromptVerdictPill.tsx";
// Tenant side (SP5 Task 14): the organization's own instructions (addendum) of an agent.
export {
  addendumActivationsQuery,
  addendumVersionsQuery,
  isPromptAgentId,
  tenantAddendumKeys,
  useAddendumActivations,
  useAddendumVersions,
} from "./api/tenant-addendum-queries.ts";
