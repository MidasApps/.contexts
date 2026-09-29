import { createLogger } from "@core/services";
import { setGlobalOptions } from "firebase-functions/v2";
import { write } from "firebase-functions/logger";
import { onRequest } from "firebase-functions/v2/https";
import { env } from "./env.ts";
import { DEFAULT_MAX_INSTANCES, FUNCTIONS_REGION } from "./functions-options.ts";
import { makeHealthzHandler } from "./healthz-handler.ts";
import { serveWebHandler } from "./http/express-web-bridge.ts";
import { makeFirebaseLogSink } from "./observability/firebase-log-sink.ts";

// Composition root of the Functions codebase (Gen 2 only). Spec D5: Functions
// serve events, jobs and webhooks; the product API lives in the web app.
// HTTPS functions are private by default (IAM invoker only); a public one opts in
// explicitly, like healthz below. Non-HTTPS triggers ignore `invoker`.
setGlobalOptions({ region: FUNCTIONS_REGION, maxInstances: DEFAULT_MAX_INSTANCES, invoker: "private" });

const logger = createLogger({
  context: { service: "functions", env: env.APP_ENV },
  sink: makeFirebaseLogSink({ write }),
});

/** Public liveness probe (decision 0003); smallest footprint the platform allows. */
export const healthz = onRequest(
  { invoker: "public", memory: "256MiB", timeoutSeconds: 10, concurrency: 80 },
  serveWebHandler({ operation: "healthz", logger }, makeHealthzHandler({ logger })),
);
