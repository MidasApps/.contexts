import { ModulePageView } from "@core/client/views/module-page";
import { pageMetadata } from "@/server/page-metadata";

export const generateMetadata = pageMetadata("module");

// Next.js requires pages as a default export.
export default function Page() {
  return <ModulePageView />;
}
