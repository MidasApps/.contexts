import { InviteView } from "@core/client/views/invite";
import { pageMetadata } from "@/server/page-metadata";

export const generateMetadata = pageMetadata("invite");

// Next.js requires pages as a default export.
export default function InvitePage() {
  return <InviteView />;
}
