import { CreateProjectInputSchema } from "@core/contracts";
import { z } from "zod";
import type { ProjectsPort } from "../../runtime/runtime-ports.ts";
import { defineCoreTool } from "../define-core-tool.ts";
import { toolFailure } from "../tool-errors.ts";
import type { AgentCommand } from "./agent-command.ts";

const TOOL_ID = "command.tenancy.CreateProjectInput";
export const CREATE_PROJECT_PERMISSION = "core.project.create";

/**
 * Core command of the action agent (SP3 Task 20): creates a project in the caller's
 * organization through SP1's `createProject` use case, the same path as `/v1`. It is a
 * mutation, so the user approves every call; the input is the SP1 command contract
 * `tenancy.CreateProjectInput`. Module commands (`command.<module>.*`) arrive with Task 19.
 */
export const createCreateProjectCommand = (deps: { readonly projects: ProjectsPort }): AgentCommand => ({
  targetContractId: "tenancy.Project",
  tool: defineCoreTool({
    id: TOOL_ID,
    description: "Creates a project in the user's organization. Use it only after the user confirmed the project name (and optional description).",
    kind: "mutation",
    permission: CREATE_PROJECT_PERMISSION,
    inputSchema: CreateProjectInputSchema,
    outputSchema: z.strictObject({ projectId: z.string().min(1), name: z.string().min(1) }),
    summarize: (input) => `Create the project "${input.name}"`,
    preview: (input) => Promise.resolve({ before: null, after: { name: input.name, description: input.description ?? null } }),
    execute: async (input, ctx) => {
      const result = await deps.projects.createProject({ principal: ctx.principal, tenantId: ctx.agent.tenantId, requestId: ctx.agent.requestId, input });
      if (!result.ok) throw toolFailure(TOOL_ID, "FORBIDDEN", "The caller may not create projects in this organization.");
      return result.data;
    },
  }),
});
