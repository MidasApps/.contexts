import { describe, expect, it } from "vitest";
import { createServerlessIdTokenSource, type IdTokenMinter, ServerlessIdTokenError } from "./serverless-id-token.ts";

const minter = (outcomes: (string | Error)[]) => {
  const audiences: string[] = [];
  const auth: IdTokenMinter = {
    getIdTokenClient: (audience) => {
      audiences.push(audience);
      return Promise.resolve({
        getRequestHeaders: () => {
          const next = outcomes.shift() ?? new Error("no more tokens");
          return next instanceof Error ? Promise.reject(next) : Promise.resolve(new Headers({ authorization: next }));
        },
      });
    },
  };
  return { auth, audiences };
};

describe("createServerlessIdTokenSource", () => {
  it("returns the Bearer header for the Mastra audience and reuses the client", async () => {
    const { auth, audiences } = minter(["Bearer id-1", "Bearer id-2"]);
    const source = createServerlessIdTokenSource({ audience: "https://mastra.a.run.app", auth });
    expect(await source.headerValue()).toBe("Bearer id-1");
    expect(await source.headerValue()).toBe("Bearer id-2");
    expect(audiences).toEqual(["https://mastra.a.run.app"]);
  });

  it("wraps a minting failure and retries with a fresh client next time", async () => {
    const { auth, audiences } = minter([new Error("metadata server down"), "Bearer id-3"]);
    const source = createServerlessIdTokenSource({ audience: "https://mastra.a.run.app", auth });
    await expect(source.headerValue()).rejects.toBeInstanceOf(ServerlessIdTokenError);
    expect(await source.headerValue()).toBe("Bearer id-3");
    expect(audiences).toHaveLength(2);
  });
});
