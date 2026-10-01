import type { ReactNode } from "react";
import { cn } from "#/shared/lib/cn.ts";

export type PageHeaderProps = {
  /** The page's only `h1`. */
  title: ReactNode;
  description?: ReactNode;
  /** Small context line above the title (e.g. the organization name on a project page). */
  eyebrow?: ReactNode;
  /** Status next to the title (a `StatusPill`, a role tag). */
  meta?: ReactNode;
  /** Primary and secondary page actions, right-aligned (wrapping under the title on small screens). */
  actions?: ReactNode;
  className?: string;
};

/**
 * Top of every page in the user area (layout.html): one `h1`, a one-line muted description and the
 * page actions. Heading levels below it start at `h2` (rules/accessibility.md "Headings").
 */
export function PageHeader({ title, description, eyebrow, meta, actions, className }: PageHeaderProps) {
  return (
    <div data-slot="page-header" className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow === undefined ? null : <p className="text-xs font-medium text-muted-foreground">{eyebrow}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight">{title}</h1>
          {meta}
        </div>
        {description === undefined ? null : <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions === undefined ? null : <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
