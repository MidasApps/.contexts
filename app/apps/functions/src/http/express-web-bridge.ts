import type { IncomingHttpHeaders } from "node:http";

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
  setHeader: (name: string, value: string) => void;
  send: (body: Buffer) => void;
};

export type WebHandler = (request: Request) => Promise<Response>;

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

/**
 * Adapts a web handler to the `onRequest` signature. The web handler owns
 * the route boundary (request id, single log line, generic 500), so the
 * bridge only copies status, headers and body.
 */
export const serveWebHandler =
  (handler: WebHandler) =>
  async (request: NodeRequestLike, response: NodeResponseLike): Promise<void> => {
    const webResponse = await handler(toWebRequest(request));
    response.status(webResponse.status);
    webResponse.headers.forEach((value, name) => {
      response.setHeader(name, value);
    });
    response.send(Buffer.from(await webResponse.arrayBuffer()));
  };
