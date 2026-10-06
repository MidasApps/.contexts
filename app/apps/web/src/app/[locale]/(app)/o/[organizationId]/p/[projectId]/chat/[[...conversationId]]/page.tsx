import { ChatView } from "@core/client/views/chat";
import { pageMetadata } from "@/server/page-metadata";

export const generateMetadata = pageMetadata("chat");

// Composition only (SP4 Task 13): the conversation in the path is read by the shared view through
// the router port. Next.js requires pages as a default export.
export default function Page() {
  return <ChatView />;
}
