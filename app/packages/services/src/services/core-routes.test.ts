import { describe, expect, it } from "vitest";
import { createRouteResolver, UnknownEndpointError } from "./core-routes.ts";
import { createLogger, type LogRecord } from "./shared/observability/logger.ts";
import type { ErrorEnvelope } from "./shared/http/error-envelope.ts";

const errorOf = async (response: Response) => ((await response.json()) as ErrorEnvelope).error;

const setup = (routes: Record<string, (request: Request) => Promise<Response>>) => {
  const records: LogRecord[] = [];
  let loads = 0;
  const route = createRouteResolver({
    getRoutes: () => {
      loads += 1;
      return routes;
    },
    logger: createLogger({ context: { service: "test", env: "local" }, sink: (record) => records.push(record) }),
    endpointIds: ["sample.listThings"],
  });
  return { route, records, loads: () => loads };
};

describe("createRouteResolver", () => {
  it("rejects an undeclared endpoint id when the route module loads", () => {
    const { route } = setup({});
    expect(() => route("identity.getMee")).toThrow(UnknownEndpointError);
    expect(() => route("sample.listThings")).not.toThrow();
  });

  it("resolves the handler lazily, on the request", async () => {
    const { route, loads } = setup({ "identity.getMe": () => Promise.resolve(new Response("ok")) });
    const handler = route("identity.getMe");
    expect(loads()).toBe(0);
    expect(await (await handler(new Request("http://localhost/v1/me"))).text()).toBe("ok");
    expect(loads()).toBe(1);
  });

  it("answers the 500 envelope and logs when a declared endpoint has no handler yet", async () => {
    const { route, records } = setup({});
    const response = await route("identity.getMe")(new Request("http://localhost/v1/me"));
    expect(response.status).toBe(500);
    expect((await errorOf(response)).code).toBe("INTERNAL_ERROR");
    expect(records).toMatchObject([{ level: "error", message: "route_not_registered", endpointId: "identity.getMe" }]);
  });
});
