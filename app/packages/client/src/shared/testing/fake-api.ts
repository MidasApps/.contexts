// Test helper: an in-memory `/v1` server behind a fake `fetch`, so hooks, features and views run the
// real HTTP client, endpoint caller and response parsing (testing trophy: integration first).

export type FakeRequest = {
  readonly method: string;
  readonly path: string;
  /** `:name` segments of the matched pattern. */
  readonly params: Readonly<Record<string, string>>;
  readonly query: URLSearchParams;
  readonly body: unknown;
  readonly headers: Headers;
};

export type FakeResponse = { readonly status: number; readonly body?: unknown };
export type FakeHandler = (request: FakeRequest) => FakeResponse | Promise<FakeResponse>;
export type FakeRoutes = Record<string, FakeHandler | FakeResponse>;

export type FakeCall = {
  readonly method: string;
  readonly path: string;
  readonly query: string;
  readonly body: unknown;
  readonly headers: Headers;
};

export type FakeApi = {
  readonly fetch: (input: string, init?: RequestInit) => Promise<Response>;
  /** Every request, in order (`"GET /v1/me"` via `callLines()`). */
  readonly calls: FakeCall[];
  readonly callLines: () => string[];
  /** Adds or replaces a route (`"GET /v1/projects/:projectId"`). */
  readonly route: (key: string, handler: FakeHandler | FakeResponse) => void;
};

export const FAKE_REQUEST_ID = "01K6FAKEREQ0000000000000000";

/** `{ data }` with 200 (or `status`). */
export const ok = (data: unknown, status = 200): FakeResponse => ({ status, body: { data } });

/** A list page: `{ data, meta: { page } }`. */
export const page = (items: readonly unknown[], next: { cursor?: string; limit?: number } = {}): FakeResponse => ({
  status: 200,
  body: {
    data: items,
    meta: { page: { cursor: next.cursor ?? null, hasMore: next.cursor !== undefined, limit: next.limit ?? 100 } },
  },
});

/** The canonical error envelope (contracts/api.md §6). */
export const apiError = (
  status: number,
  code: string,
  details?: readonly { field: string; issue: string }[],
): FakeResponse => ({
  status,
  body: {
    error: {
      code,
      message: "Fake failure.",
      requestId: FAKE_REQUEST_ID,
      ...(details === undefined ? {} : { details }),
    },
  },
});

export const noContent = (): FakeResponse => ({ status: 204 });

const matchPattern = (pattern: string, path: string): Record<string, string> | null => {
  const want = pattern.split("/");
  const got = path.split("/");
  if (want.length !== got.length) return null;
  const params: Record<string, string> = {};
  for (const [index, segment] of want.entries()) {
    const actual = got[index] ?? "";
    if (segment.startsWith(":")) params[segment.slice(1)] = decodeURIComponent(actual);
    else if (segment !== actual) return null;
  }
  return params;
};

const toResponse = ({ status, body }: FakeResponse): Response =>
  new Response(body === undefined || status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-request-id": FAKE_REQUEST_ID },
  });

const parseBody = (init: RequestInit): unknown => (typeof init.body === "string" ? JSON.parse(init.body) : undefined);

/**
 * Fake `/v1`: routes keyed `"METHOD /path/:param"`; an unmatched request answers 404 `NOT_FOUND`.
 * @example const api = createFakeApi({ "GET /v1/me": ok(me) });
 */
export const createFakeApi = (routes: FakeRoutes = {}): FakeApi => {
  const table = new Map(Object.entries(routes));
  const calls: FakeCall[] = [];
  const fetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(input, "http://api.test");
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    const body = parseBody(init);
    calls.push({ method, path: url.pathname, query: url.search, body, headers });
    for (const [key, handler] of table) {
      const [routeMethod, pattern = ""] = key.split(" ");
      const params = routeMethod === method ? matchPattern(pattern, url.pathname) : null;
      if (params === null) continue;
      const response =
        typeof handler === "function"
          ? await handler({ method, path: url.pathname, params, query: url.searchParams, body, headers })
          : handler;
      return toResponse(response);
    }
    return toResponse(apiError(404, "NOT_FOUND"));
  };
  return {
    fetch,
    calls,
    callLines: () => calls.map((call) => `${call.method} ${call.path}`),
    route: (key, handler) => void table.set(key, handler),
  };
};
