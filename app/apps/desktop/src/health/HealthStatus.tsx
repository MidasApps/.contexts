import { useRouter } from "@tanstack/react-router";
import { isTauri } from "@tauri-apps/api/core";
import type { HealthCheckResult } from "@/api/health-client.ts";

/** API liveness (neutral copy; product tone of voice is not defined yet). */
export function HealthStatus({ result }: { result: HealthCheckResult }) {
  const router = useRouter();
  const shell = isTauri() ? "tauri" : "browser";
  return (
    <section aria-labelledby="health-title">
      <h1 id="health-title">API status</h1>
      {result.ok ? (
        <p data-testid="health-status">{result.status}</p>
      ) : (
        <p data-testid="health-status" role="alert">
          unavailable ({result.error.code}
          {result.error.httpStatus === undefined ? "" : ` ${result.error.httpStatus}`})
        </p>
      )}
      <p className="muted">shell: {shell}</p>
      <button type="button" onClick={() => void router.invalidate()}>
        Check again
      </button>
    </section>
  );
}
