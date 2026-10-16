import type { ReactNode } from "react";
import { cn } from "#/shared/lib/cn.ts";

export type SettingsTemplateProps = {
  /** Page header (title `h1` + description), usually the `page-header` widget. */
  header: ReactNode;
  /**
   * `reading` (default) caps forms and text at ~720 px; `wide` lets sections whose main content
   * is a data table use the whole column, so its columns and row actions fit.
   */
  width?: "reading" | "wide" | undefined;
  children: ReactNode;
  className?: string;
};

/**
 * Settings and profile pages inside the administration's `main` (decision 0077): header, then the
 * section content, whose blocks are spaced by the template. The sections are listed by the
 * administration's sidebar, so the page carries no navigation of its own.
 */
export function SettingsTemplate({ header, width = "reading", children, className }: SettingsTemplateProps) {
  return (
    <div data-slot="settings-template" className={cn("flex flex-col gap-6", className)}>
      {header}
      <section data-width={width} className={cn("flex min-w-0 flex-col gap-6", width === "reading" && "max-w-[720px]")}>
        {children}
      </section>
    </div>
  );
}
