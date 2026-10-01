// Public API of the project entity (SP2 Tasks 11, 15). Mutations (create project) live in features and
// invalidate `projectKeys.all(organizationId)`; `useNodeOptions` feeds the grant-target pickers.
export { projectKeys, projectQuery, projectsQuery, useProject, useProjects } from "./api/project-queries.ts";
export { nodeFromOptionValue, nodeOptionValue, useNodeOptions, type NodeOptions, type TenantNodeInput } from "./model/node-options.ts";
export { NodeSelect, type NodeSelectProps } from "./ui/NodeSelect.tsx";
