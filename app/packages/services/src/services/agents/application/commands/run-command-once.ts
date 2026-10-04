import { sha256Hex } from "../../../shared/crypto/sha256.ts";
import type { IdempotencyStore } from "../../../shared/idempotency/idempotency-store.ts";
import { idempotencyScopeKey } from "../../../shared/idempotency/idempotency-store.ts";
import { canonicalJson } from "../../../shared/idempotency/request-hash.ts";
import { AgentCommandError } from "./agent-command-error.ts";

/** One command execution keyed by `runId:toolCallId` (decision 0025, follow-up #26). */
export type CommandRun = {
  readonly tenantId: string;
  /** Command contract id (`tenancy.CreateProjectInput`); keys never collide across commands. */
  readonly commandId: string;
  /** `runId:toolCallId` of the agent tool call. */
  readonly idempotencyKey: string;
  /** The validated command input; the same key with another input is refused. */
  readonly input: unknown;
  readonly run: () => Promise<unknown>;
};

export type CommandRunResult = { readonly output: unknown; readonly replayed: boolean };

export type CommandIdempotency = {
  /**
   * Runs the command at most once per key for 24 h and replays its stored result afterwards.
   * @throws {AgentCommandError} `IDEMPOTENCY_KEY_REUSED` (other input) or `COMMAND_IN_PROGRESS`;
   *   whatever `run` throws (the key is then released, so a retry can run it).
   */
  readonly runOnce: (command: CommandRun) => Promise<CommandRunResult>;
};

const STORED_STATUS = 200;

/**
 * Idempotent command execution over SP1's `IdempotencyStore` (decision 0009 §3: records in
 * `idempotency-records`, 24 h TTL, 60 s in-flight lease). The record id is
 * `sha256("tenant:<tenantId>:agent-command:<commandId>:<runId:toolCallId>")`, so nothing
 * readable is stored, and the result body is kept as JSON. Both the Mastra tool pipeline
 * (user-approved mutations) and the SP1 `agent-command` handler (four eyes) use it, so a
 * retried approval never runs a command twice.
 */
export const createCommandIdempotency = (deps: { readonly store: IdempotencyStore }): CommandIdempotency => ({
  runOnce: async (command) => {
    const scopeKey = idempotencyScopeKey({
      principalKey: `tenant:${command.tenantId}`,
      endpointId: `agent-command:${command.commandId}`,
      idempotencyKey: command.idempotencyKey,
    });
    const begin = await deps.store.begin(scopeKey, sha256Hex(canonicalJson(command.input)));
    if (begin.kind === "conflict") throw new AgentCommandError("IDEMPOTENCY_KEY_REUSED", command.commandId);
    if (begin.kind === "in-flight") throw new AgentCommandError("COMMAND_IN_PROGRESS", command.commandId);
    if (begin.kind === "replay")
      return {
        output: begin.response.body === null ? null : (JSON.parse(begin.response.body) as unknown),
        replayed: true,
      };
    let output: unknown;
    try {
      output = (await command.run()) ?? null;
    } catch (error: unknown) {
      await deps.store.release(scopeKey, begin.attemptId);
      throw error;
    }
    await deps.store.complete(scopeKey, begin.attemptId, { status: STORED_STATUS, body: JSON.stringify(output) });
    return { output, replayed: false };
  },
});
