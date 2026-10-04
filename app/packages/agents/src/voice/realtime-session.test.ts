import { describe, expect, it } from "vitest";
import { createOpenAiRealtimeMinter, REALTIME_SECRET_TTL_SECONDS, RealtimeMintError } from "./realtime-session.ts";

type Seen = { url: string; headers: Headers; body: unknown };

const minterWith = (answer: Response) => {
  const seen: Seen[] = [];
  const fetchStub = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    seen.push({
      url: input instanceof Request ? input.url : input.toString(),
      headers: new Headers(init?.headers),
      body: JSON.parse(typeof init?.body === "string" ? init.body : "null"),
    });
    return Promise.resolve(answer);
  };
  const minter = createOpenAiRealtimeMinter({
    apiKey: "sk-test",
    model: "gpt-realtime-2.1",
    instructions: () => Promise.resolve("Be brief."),
    fetch: fetchStub,
  });
  return { minter, seen };
};

describe("OpenAI realtime minter", () => {
  it("asks for a 60 s secret for a session with the instructions and no tools", async () => {
    const { minter, seen } = minterWith(Response.json({ value: "ek_123", expires_at: 1_790_000_060 }));
    expect(await minter.mint({ requestContext: undefined })).toEqual({
      clientSecret: "ek_123",
      expiresAt: new Date(1_790_000_060_000).toISOString(),
      model: "gpt-realtime-2.1",
    });
    expect(seen[0]?.url).toBe("https://api.openai.com/v1/realtime/client_secrets");
    expect(seen[0]?.headers.get("authorization")).toBe("Bearer sk-test");
    expect(seen[0]?.body).toEqual({
      expires_after: { anchor: "created_at", seconds: REALTIME_SECRET_TTL_SECONDS },
      session: { type: "realtime", model: "gpt-realtime-2.1", instructions: "Be brief.", tools: [] },
    });
  });

  it("fails with a stable error on a refused or malformed answer", async () => {
    await expect(
      minterWith(new Response("nope", { status: 401 })).minter.mint({ requestContext: undefined }),
    ).rejects.toBeInstanceOf(RealtimeMintError);
    await expect(
      minterWith(Response.json({ unexpected: true })).minter.mint({ requestContext: undefined }),
    ).rejects.toBeInstanceOf(RealtimeMintError);
  });
});
