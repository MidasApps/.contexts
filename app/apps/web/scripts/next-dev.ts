// `pnpm -F web dev`: runs `next dev` on WEB_PORT (default 3000). The workspace
// `.env.local` is loaded first so WEB_PORT can live there; Node's loader never
// overrides a variable already set in the shell.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { resolveWebPort } from "./web-port.ts";

const WORKSPACE_ENV_FILE = path.resolve(import.meta.dirname, "../../../.env.local");
if (existsSync(WORKSPACE_ENV_FILE)) process.loadEnvFile(WORKSPACE_ENV_FILE);

const port = resolveWebPort(process.env);
// Spawn Next's JS entry with this Node binary: no shell, same behavior on Windows.
const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "dev", "--port", String(port)], { stdio: "inherit" });

// Ctrl+C reaches Next directly (same console/process group); forward the rest.
for (const signal of ["SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => child.kill(signal));
}
process.on("SIGINT", () => undefined);
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal === null ? 1 : 0);
});
