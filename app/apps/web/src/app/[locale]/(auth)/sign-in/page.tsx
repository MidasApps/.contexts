import { SignInView } from "@core/client/views/sign-in";
import { pageMetadata } from "@/server/page-metadata";

// The one indexable page of the app.
export const generateMetadata = pageMetadata("signIn", { indexable: true });

// Next.js requires pages as a default export.
export default function SignInPage() {
  return <SignInView />;
}
