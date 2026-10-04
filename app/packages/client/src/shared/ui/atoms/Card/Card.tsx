import type { ComponentProps } from "react";
import { cn } from "#/shared/lib/cn.ts";

/**
 * shadcn `card` in the design-system look (componentes.html "Cards de ação"): `--card` surface,
 * hairline border, 14 px radius, flat (no shadow on content cards, elevacao.html), 18 px padding.
 * Headings inside are the caller's choice of level (`CardTitle` renders a `div` unless `asHeading`).
 */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-4 rounded-lg border border-border bg-card p-[18px] text-card-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("grid auto-rows-min items-start gap-1 has-data-[slot=card-action]:grid-cols-[1fr_auto]", className)}
      {...props}
    />
  );
}

export type CardTitleProps = ComponentProps<"h3"> & { as?: "h2" | "h3" | "h4" | "div" };

/** Semibold 15 px title; pick `as` to keep the page's heading hierarchy (one h1, no skipped levels). */
export function CardTitle({ className, as: Tag = "h3", ...props }: CardTitleProps) {
  return <Tag data-slot="card-title" className={cn("text-title leading-snug font-semibold", className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p data-slot="card-description" className={cn("text-body text-muted-foreground", className)} {...props} />;
}

export function CardAction({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn(className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex items-center gap-2", className)} {...props} />;
}
