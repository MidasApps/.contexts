import { ApprovalsView } from "@core/client/views/approvals";
import { pageMetadata } from "@/server/page-metadata";

export const generateMetadata = pageMetadata("approvals");

// The inbox and one request (decision 0077: deciding is using the app); the shared view reads the
// request id through the router port. Next.js requires pages as a default export.
export default function Page() {
  return <ApprovalsView />;
}
