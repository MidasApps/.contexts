import type { IncomingHttpHeaders } from "node:http";
import { errorResponse, type Logger, REQUEST_ID_HEADER, resolveRequestId } from "@core/services";

/**
 * The part of the Express request `onRequest` hands over that the bridge
 * reads. Structural, so tests need no Express and handlers stay framework-free.
 */
export type NodeRequestLike = {
  method: string;
  protocol: string;
  originalUrl: string;
  headers: IncomingHttpHeaders;
  /** Set by the Functions runtime before any body parser consumes the stream. */
  rawBody?: Buffer;
};

/** The part of the Express response the bridge writes. */
export type NodeResponseLike = {
  status: (code: number) => NodeResponseLike;
  setHeader: (name: string, value: string | string[]) => void;
  removeHeader: (name: string) => void;
  /** Plain Node `end`: unlike Express `send()`, it adds no weak ETag. */
  end: (body: Buffer) => void;
};

export type WebHandler = (request: Request) => Promise<Response>;

type BufferedResponse = { status: number; headers: Headers; body: Buffer };

const METHODS_WITHOUT_BODY = new Set(["GET", "HEAD"]);

const toWebHeaders = (incoming: IncomingHttpHeaders): Headers => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    // Repeated headers arrive as arrays; appending keeps each value (Headers joins them on read).
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
  }
  return headers;
};

/** Rebuilds a fetch `Request` so the shared web handlers of `@core/services` run unchanged. */
export const toWebRequest = (request: NodeRequestLike): Request => {
  const headers = toWebHeaders(request.headers);
  const url = new URL(request.originalUrl, `${request.protocol}://${headers.get("host") ?? "localhost"}`);
  const hasBody = !METHODS_WITHOUT_BODY.has(request.method) && request.rawBody !== undefined;
  return new Request(url, {
    method: request.method,
    headers,
    ...(hasBody ? { body: new Uint8Array(request.rawBody ?? []) } : {}),
  });
};

const bufferResponse = async (response: Response): Promise<BufferedResponse> => ({
  status: response.status,
  headers: response.headers,
  body: Buffer.from(await response.arrayBuffer()),
});

const writeNodeResponse = (target: NodeResponseLike, source: BufferedResponse): void => {
  target.removeHeader("x-powered-by");
  target.status(source.status);
  source.headers.forEach((value, name) => {
    // Headers.forEach joins repeated Set-Cookie values with ", ", which breaks cookies.
    if (name !== "set-cookie") target.setHeader(name, value);
  });
  const cookies = source.headers.getSetCookie();
  if (cookies.length > 0) target.setHeader("set-cookie", cookies);
  target.setHeader("x-content-type-options", "nosniff");
  target.end(source.body);
};

const firstHeader = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * Adapts a web handler to the `onRequest` signature. The web handler owns its
 * route boundary; this outer boundary catches what happens around it (request
 * conversion, body read, a throw that escapes the handler) with one
 * `<operation>_failed` log line and the generic 500 envelope of
 * contracts/api.md §6, never the cause.
 * @param options.operation snake_case name used in the failure log line.
 */
export const serveWebHandler =
  (options: { operation: string; logger: Logger }, handler: WebHandler) =>
  async (request: NodeRequestLike, response: NodeResponseLike): Promise<void> => {
    const startedAt = performance.now();
    let buffered: BufferedResponse;
    try {
      buffered = await bufferResponse(await handler(toWebRequest(request)));
    } catch (err: unknown) {
      const requestId = resolveRequestId(firstHeader(request.headers[REQUEST_ID_HEADER]));
      const durationMs = Math.round(performance.now() - startedAt);
      options.logger.error(`${options.operation}_failed`, { requestId, durationMs, err });
      const failure = errorResponse({ status: 500, code: "INTERNAL_ERROR", message: "Internal error.", requestId });
      buffered = await bufferResponse(failure);
    }
    writeNodeResponse(response, buffered);
  };
