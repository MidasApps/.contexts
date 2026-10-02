import { useId, type ReactNode } from "react";
import { cn } from "#/shared/lib/cn.ts";

export type SectionCardProps = {
  /** The section's `h2` (the page's `h1` is in the page header). */
  title: ReactNode;
  description?: ReactNode;
  /** Actions of this section (e.g. "Invite"), right-aligned, wrapping under the title on phones. */
  actions?: ReactNode;
  children: ReactNode;
  /** `danger` frames destructive zones (sign out everywhere) with the destructive border. */
  tone?: "default" | "danger";
  className?: string;
};

/**
 * A titled block of a settings or profile page (componentes.html card: `--card` surface,
 * hairline border, semibold title, muted description). Labelled by its heading, so screen reader
 * users can jump between sections.
 */
export function SectionCard({ title, description, actions, children, tone = "default", className }: SectionCardProps) {
  const id = useId();
  return (
    <section
      aria-labelledby={`${id}-title`}
      data-slot="section-card"
      className={cn("flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5", tone === "danger" ? "border-destructive/40" : "border-border", className)}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={`${id}-title`} className="text-title font-semibold">
            {title}
          </h2>
          {description === undefined ? null : <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions === undefined ? null : <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
