// Composition root of traces, evals and feedback (SP5 Task 11, decision 0040).
import type { AgentSettings } from "@core/contracts";
import type { GetConversation } from "../conversations/application/use-cases/get-conversation.ts";
import type { MessageFeedbackStore } from "../conversations/application/ports/message-feedback-store.ts";
import { makeRecordMessageFeedback, type RecordMessageFeedback } from "../conversations/application/use-cases/record-message-feedback.ts";
import { type ListDatasets, makeListDatasets } from "../evals/application/use-cases/list-datasets.ts";
import { type ListExperiments, makeListExperiments } from "../evals/application/use-cases/list-experiments.ts";
import { makeStartExperiment, type StartExperiment } from "../evals/application/use-cases/start-experiment.ts";
import type { Clock } from "../shared/clock/clock.ts";
import type { Logger } from "../shared/observability/logger.ts";
import type { ConsoleGateway } from "./application/ports/console-gateway.ts";
import { type GetTrace, makeGetTrace } from "./application/use-cases/get-trace.ts";
import { type ListTraces, makeListTraces } from "./application/use-cases/list-traces.ts";

export type ObservabilityServices = {
  readonly listTraces: ListTraces;
  readonly getTrace: GetTrace;
  readonly listDatasets: ListDatasets;
  readonly listExperiments: ListExperiments;
  readonly startExperiment: StartExperiment;
  readonly recordFeedback: RecordMessageFeedback;
};

/** Binds the console read use cases and feedback (fake gateway and in-memory stores in unit tests). */
export const createObservabilityServices = (deps: {
  readonly console: ConsoleGateway;
  readonly getAgentSettings: (input: { tenantId: string }) => Promise<AgentSettings>;
  readonly getConversation: GetConversation;
  readonly feedback: MessageFeedbackStore;
  readonly clock: Clock;
  readonly logger: Pick<Logger, "warn">;
}): ObservabilityServices => ({
  listTraces: makeListTraces(deps),
  getTrace: makeGetTrace(deps),
  listDatasets: makeListDatasets(deps),
  listExperiments: makeListExperiments(deps),
  startExperiment: makeStartExperiment(deps),
  recordFeedback: makeRecordMessageFeedback(deps),
});
