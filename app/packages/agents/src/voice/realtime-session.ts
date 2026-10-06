import type { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";

/** TTL of a realtime client secret (spec §4.5: at most 60 s). */
export const REALTIME_SECRET_TTL_SECONDS = 60;
const CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";
const MINT_TIMEOUT_MS = 10_000;

export type RealtimeSession = { readonly clientSecret: string; readonly expiresAt: string; readonly model: string };

export type RealtimeMinter = {
  readonly mint: (input: {
    readonly requestContext: RequestContext<unknown> | undefined;
    readonly abortSignal?: AbortSignal;
  }) => Promise<RealtimeSession>;
};

/** The provider answered without a usable secret (status or shape); the route answers 502. */
export class RealtimeMintError extends Error {
  readonly code = "REALTIME_MINT_FAILED";
  readonly status: number;

  constructor(status: number) {
    super(`realtime client secret request answered ${status}`);
    this.name = "RealtimeMintError";
    this.status = status;
  }
}

// The provider's answer is data: keep only the secret and its expiry.
const ClientSecretSchema = z.looseObject({ value: z.string().min(1), expires_at: z.number().int().positive() });

/**
 * OpenAI Realtime ephemeral secrets (`POST /v1/realtime/client_secrets`, GA session shape,
 * `stacks/ai/openai.md`): the session carries the given instructions and **no tools**, so a
 * realtime conversation can never bypass the per-call authorize and approval pipeline.
 * @param options.instructions the supervisor's instructions for the caller's context.
 */
export const createOpenAiRealtimeMinter = (options: {
  readonly apiKey: string;
  readonly model: string;
  readonly instructions: (requestContext: RequestContext<unknown> | undefined) => Promise<string>;
  readonly fetch?: typeof fetch;
}): RealtimeMinter => ({
  mint: async ({ requestContext, abortSignal }) => {
    const session = {
      type: "realtime",
      model: options.model,
      instructions: await options.instructions(requestContext),
      tools: [],
    };
    const signal =
      abortSignal === undefined
        ? AbortSignal.timeout(MINT_TIMEOUT_MS)
        : AbortSignal.any([abortSignal, AbortSignal.timeout(MINT_TIMEOUT_MS)]);
    const response = await (options.fetch ?? fetch)(CLIENT_SECRETS_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ expires_after: { anchor: "created_at", seconds: REALTIME_SECRET_TTL_SECONDS }, session }),
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new RealtimeMintError(response.status);
    }
    const parsed = ClientSecretSchema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) throw new RealtimeMintError(response.status);
    return {
      clientSecret: parsed.data.value,
      expiresAt: new Date(parsed.data.expires_at * 1000).toISOString(),
      model: options.model,
    };
  },
});
