import { createFileRoute } from "@tanstack/react-router";
import { HealthStatus } from "@/health/HealthStatus.tsx";

export const Route = createFileRoute("/")({
  // Aborted when the route unloads; failures come back as values, never throws.
  loader: ({ context, abortController }) => context.healthClient.checkHealth(abortController.signal),
  pendingComponent: () => <p role="status">Checking API…</p>,
  component: HomePage,
});

function HomePage() {
  return <HealthStatus result={Route.useLoaderData()} />;
}
