import { ApprovalsView } from "@core/client/views/approvals";
import { createFileRoute } from "@tanstack/react-router";

// The approvals inbox and one request (decision 0077: deciding is using the app); the shared view
// reads the request through the router port.
export const Route = createFileRoute("/o/$organizationId/approvals/{-$approvalRequestId}")({
  component: ApprovalsView,
});
