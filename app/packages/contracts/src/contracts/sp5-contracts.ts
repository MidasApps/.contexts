import { ActivatePromptVersionInputContract, PromptActivationContract } from "./agents/prompt-activation.schema.ts";
import { CreatePromptVersionInputContract, PromptVersionContract } from "./agents/prompt-version.schema.ts";
import type { ContractDefinition } from "./contract.ts";
import { MessageFeedbackContract, MessageFeedbackInputContract } from "./conversations/message-feedback.schema.ts";
import { EvalExperimentSummaryContract } from "./observability/eval-experiment-summary.schema.ts";
import { TraceDetailContract } from "./observability/trace-detail.schema.ts";
import { TraceSummaryContract } from "./observability/trace-summary.schema.ts";
import { AdminOverviewContract } from "./platform/admin-overview.schema.ts";
import { FeatureFlagContract, FeatureFlagDefinitionContract, SetFeatureFlagValueInputContract, TenantFlagValueInputContract } from "./platform/feature-flag.schema.ts";
import { PlanContract, UpsertPlanInputContract } from "./platform/plan.schema.ts";
import { UsageDailyRollupContract } from "./usage/usage-daily-rollup.schema.ts";
import { HumanApprovalResumeContract, WorkflowResumeActionInputContract } from "./workflows/human-approval-resume.schema.ts";
import { CreateScheduleInputContract, ScheduleContract, UpdateScheduleInputContract } from "./workflows/schedule.schema.ts";
import { WorkflowEventContract } from "./workflows/workflow-event.schema.ts";
import { StartWorkflowRunInputContract, WorkflowRunContract } from "./workflows/workflow-run.schema.ts";

/** Contracts added by SP5 (spec §3–§8), registered by `composition.ts`. */
export const SP5_CONTRACTS: readonly ContractDefinition[] = [
  HumanApprovalResumeContract,
  WorkflowResumeActionInputContract,
  ScheduleContract,
  CreateScheduleInputContract,
  UpdateScheduleInputContract,
  WorkflowRunContract,
  StartWorkflowRunInputContract,
  WorkflowEventContract,
  PromptVersionContract,
  CreatePromptVersionInputContract,
  PromptActivationContract,
  ActivatePromptVersionInputContract,
  PlanContract,
  UpsertPlanInputContract,
  FeatureFlagDefinitionContract,
  FeatureFlagContract,
  SetFeatureFlagValueInputContract,
  TenantFlagValueInputContract,
  AdminOverviewContract,
  TraceSummaryContract,
  TraceDetailContract,
  EvalExperimentSummaryContract,
  UsageDailyRollupContract,
  MessageFeedbackContract,
  MessageFeedbackInputContract,
];
