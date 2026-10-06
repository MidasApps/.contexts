import type { AnyWorkflow } from "@mastra/core/workflows";
import type { Memory } from "@mastra/memory";
import { createCatalogReindexWorkflow } from "../knowledge/workflows/catalog-reindex.workflow.ts";
import { createKnowledgeIngestWorkflow } from "../knowledge/workflows/knowledge-ingest.workflow.ts";
import { type AgentModels, embeddingModelIdOf } from "../models/model-factory.ts";
import { createApprovalDemoWorkflow } from "../workflows/approval-demo.workflow.ts";
import {
  APPROVAL_EXPIRY_SWEEP_CRON,
  createApprovalExpirySweepWorkflow,
} from "../workflows/approval-expiry-sweep.workflow.ts";
import { CONVERSATION_PURGE_CRON, createConversationPurgeWorkflow } from "../workflows/conversation-purge.workflow.ts";
import { createEvalExportWorkflow, EVAL_EXPORT_CRON } from "../workflows/eval-export.workflow.ts";
import type { PlatformSchedule } from "../workflows/schedules/platform-schedules.ts";
import { createUsageReportWorkflow, USAGE_REPORT_PLATFORM_CRON } from "../workflows/usage-report.workflow.ts";
import {
  createWorkflowCatalog,
  policyOf,
  type WorkflowCatalog,
  type WorkflowPolicy,
  workflowIdOf,
} from "../workflows/workflow-catalog.ts";
import { AgentModuleError } from "./agent-module.ts";
import type { ComposeAgentRuntimeArgs } from "./compose-agent-runtime-args.ts";

/**
 * Core workflows: knowledge ingestion, the catalog reindex (SP3 §11), the HITL demo (decision 0036),
 * the usage report (decision 0039) and the maintenance sweeps (approval expiry, conversation purge, eval export).
 */
const coreWorkflowMap = (
  args: ComposeAgentRuntimeArgs,
  models: AgentModels,
  memory: Memory | undefined,
): Record<string, AnyWorkflow> => {
  const indexing = {
    knowledge: args.ports.knowledge,
    embedding: models.embedding,
    embeddingModelId: embeddingModelIdOf(args.env),
  };
  const ingest = createKnowledgeIngestWorkflow({
    ...indexing,
    access: args.ports.access,
    files: args.ports.files,
    webContent: args.ports.webContent,
    events: args.ports.knowledgeEvents,
  });
  const reindex = createCatalogReindexWorkflow({
    ...indexing,
    ...(args.aiCatalog === undefined ? {} : { aiCatalog: args.aiCatalog }),
  });
  const approvalDemo = createApprovalDemoWorkflow({
    approvals: args.ports.workflowApprovals,
    commands: args.ports.workflowCommands,
    access: args.ports.access,
  });
  const usageReport = createUsageReportWorkflow({
    access: args.ports.access,
    notifications: args.ports.notifications,
    usageReport: args.ports.usageReport,
  });
  const maintenance = [
    createApprovalExpirySweepWorkflow({ approvalSweeps: args.ports.approvalSweeps }),
    createConversationPurgeWorkflow({ conversationPurge: args.ports.conversationPurge, memory }),
    createEvalExportWorkflow({ evalExport: args.ports.evalExport }),
  ];
  return {
    [ingest.id]: ingest,
    [reindex.id]: reindex,
    [approvalDemo.id]: approvalDemo,
    [usageReport.id]: usageReport,
    ...Object.fromEntries(maintenance.map((workflow) => [workflow.id, workflow])),
  };
};

/**
 * Core workflow policies (SP5 spec §3.2): only the HITL demo starts from `/v1`; platform crons (UTC)
 * are written as Mastra Schedules rows at boot (`ensurePlatformSchedules`, decision 0037 amendment).
 */
const CORE_WORKFLOW_FLAGS: Readonly<
  Record<string, { startable?: boolean; schedulable?: boolean; platformCron?: string }>
> = {
  "approval-demo": { startable: true },
  "catalog-reindex": { platformCron: "0 3 * * *" },
  "usage-report": { schedulable: true, platformCron: USAGE_REPORT_PLATFORM_CRON },
  "approval-expiry-sweep": { platformCron: APPROVAL_EXPIRY_SWEEP_CRON },
  "conversation-purge": { platformCron: CONVERSATION_PURGE_CRON },
  "eval-export": { platformCron: EVAL_EXPORT_CRON },
};

/** Core and module workflows with the catalog of their policies (decisions 0037, 0040). */
export const collectWorkflows = (
  args: ComposeAgentRuntimeArgs,
  models: AgentModels,
  memory: Memory | undefined,
): { workflows: Record<string, AnyWorkflow>; catalog: WorkflowCatalog; platformSchedules: PlatformSchedule[] } => {
  const workflows = coreWorkflowMap(args, models, memory);
  const policies: WorkflowPolicy[] = Object.keys(workflows).map((id) => policyOf(id, CORE_WORKFLOW_FLAGS[id]));
  for (const entry of args.modules.flatMap((module) => module.workflows ?? [])) {
    const id = workflowIdOf(entry.workflow);
    if (workflows[id] !== undefined)
      throw new AgentModuleError({ code: "DUPLICATE_CAPABILITY", moduleId: "runtime", capabilityId: id });
    workflows[id] = entry.workflow;
    policies.push(policyOf(id, entry));
  }
  const platformSchedules = Object.keys(workflows).flatMap((workflowId) => {
    const cron = CORE_WORKFLOW_FLAGS[workflowId]?.platformCron;
    return cron === undefined ? [] : [{ workflowId, cron }];
  });
  return { workflows, catalog: createWorkflowCatalog(policies), platformSchedules };
};
