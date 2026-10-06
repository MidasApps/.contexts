import { ProjectHomeView } from "@core/client/views/project-home";
import { pageMetadata } from "@/server/page-metadata";

export const generateMetadata = pageMetadata("project");

// Next.js requires pages as a default export.
export default function Page() {
  return <ProjectHomeView />;
}
