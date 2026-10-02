import { Suspense, type ReactNode } from "react";
import { EntrySkeleton } from "@/client/shell-skeleton";

/**
 * Entry pages (sign-in, invitation, sign-up, password reset). Their views frame themselves with `AuthTemplate`; the
 * boundary is here because they read search params (request-time under Cache Components).
 */
// Next.js requires the layout as a default export.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<EntrySkeleton />}>{children}</Suspense>;
}
