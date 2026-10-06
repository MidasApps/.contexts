import { AdminPage } from "@/client/section-pages";
import { pageMetadata } from "@/server/page-metadata";

export const generateMetadata = pageMetadata("admin");

// Next.js requires pages as a default export.
export default function Page() {
  return <AdminPage />;
}
