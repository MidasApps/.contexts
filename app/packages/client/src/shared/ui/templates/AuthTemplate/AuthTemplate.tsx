import type { ReactNode } from "react";
import { cn } from "#/shared/lib/cn.ts";
import { SkipLink } from "#/shared/ui/atoms/SkipLink/SkipLink.tsx";

export type AuthTemplateProps = {
  /** Product mark and name (the app supplies it; the core ships no brand). */
  brand?: ReactNode;
  /** The form card content: the page's `h1`, form and links. */
  children: ReactNode;
  /** Secondary controls under the card (language selector, legal links). */
  footer?: ReactNode;
  className?: string;
};

/**
 * Signed-out pages (sign-in, invitation; shadcn block `login-03`): centred 400 px card on the page
 * background, brand above, footer below. Skip link first, one `main#main`, no sidebar.
 */
export function AuthTemplate({ brand, children, footer, className }: AuthTemplateProps) {
  return (
    <div
      className={cn("flex min-h-svh flex-col items-center justify-center gap-6 bg-background px-4 py-10", className)}
    >
      <SkipLink />
      {brand === undefined ? null : <div className="flex items-center gap-2 self-center font-medium">{brand}</div>}
      <main id="main" tabIndex={-1} className="w-full max-w-[400px] outline-none">
        <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6 text-card-foreground sm:p-8">
          {children}
        </div>
      </main>
      {footer === undefined ? null : (
        <footer className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
          {footer}
        </footer>
      )}
    </div>
  );
}
