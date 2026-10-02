import { SignUpView } from "@core/client/views/sign-up";
import { pageMetadata } from "@/server/page-metadata";

export const generateMetadata = pageMetadata("signUp");

// Next.js requires pages as a default export.
export default function SignUpPage() {
  return <SignUpView />;
}
