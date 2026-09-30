import { ApprovalActionKindSchema } from "@core/contracts";
import type { z } from "zod";
import type { ApprovalActionContext, ApprovalActionHandler } from "./ports/driven/approval-action-handler.ts";

export type ApprovalHandlerRegistryErrorCode = "APPROVAL_HANDLER_DUPLICATE" | "APPROVAL_HANDLER_KIND_INVALID";

/** Startup bug: two handlers claim one kind, or a kind is not kebab-case. */
export class ApprovalHandlerRegistryError extends Error {
  readonly code: ApprovalHandlerRegistryErrorCode;
  readonly kind: string;

  constructor(code: ApprovalHandlerRegistryErrorCode, kind: string) {
    super(`${code}: ${kind}`);
    this.name = "ApprovalHandlerRegistryError";
    this.code = code;
    this.kind = kind;
  }
}

/** A registered handler, with its input type erased behind its own schema. */
export type RegisteredApprovalHandler = {
  readonly kind: string;
  /** Issues of `input` against the handler's schema; empty when it parses. */
  readonly check: (input: unknown) => readonly z.core.$ZodIssue[];
  /**
   * Parses `input` again and executes the handler.
   * @throws when the input no longer parses, or whatever the handler throws.
   */
  readonly run: (input: unknown, context: ApprovalActionContext) => Promise<void>;
};

/**
 * The `ApprovalActionHandler` registry. It stays open after composition: the agent runtime
 * (SP3, `agent-command`) and workflows (SP5) register their handlers when they start. A
 * request whose kind has no handler is refused (422) and never executes (fail-closed).
 */
export type ApprovalHandlerRegistry = {
  readonly get: (kind: string) => RegisteredApprovalHandler | undefined;
  /** @throws {ApprovalHandlerRegistryError} for a duplicate or malformed kind. */
  readonly register: <Input>(handler: ApprovalActionHandler<Input>) => void;
  /** Registered kinds, sorted. */
  readonly kinds: () => readonly string[];
};

const erase = <Input>(handler: ApprovalActionHandler<Input>): RegisteredApprovalHandler => ({
  kind: handler.kind,
  check: (input) => {
    const parsed = handler.inputSchema.safeParse(input);
    return parsed.success ? [] : parsed.error.issues;
  },
  run: async (input, context) => handler.execute(handler.inputSchema.parse(input), context),
});

export const createApprovalHandlerRegistry = (initial: readonly ApprovalActionHandler[] = []): ApprovalHandlerRegistry => {
  const handlers = new Map<string, RegisteredApprovalHandler>();
  const register = <Input>(handler: ApprovalActionHandler<Input>): void => {
    if (!ApprovalActionKindSchema.safeParse(handler.kind).success) throw new ApprovalHandlerRegistryError("APPROVAL_HANDLER_KIND_INVALID", handler.kind);
    if (handlers.has(handler.kind)) throw new ApprovalHandlerRegistryError("APPROVAL_HANDLER_DUPLICATE", handler.kind);
    handlers.set(handler.kind, erase(handler));
  };
  for (const handler of initial) register(handler);
  return { get: (kind) => handlers.get(kind), register, kinds: () => [...handlers.keys()].sort() };
};
