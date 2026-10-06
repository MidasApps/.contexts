import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "#/shared/lib/cn.ts";

/**
 * shadcn `alert` (an inline banner, not a toast) in the design tokens: hairline card by default;
 * tinted variants take the 14 % accent tint with AA text tokens. The first child `svg` is the
 * icon column (decorative: the title says it).
 */
const alertVariants = cva(
  [
    "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-md border px-4 py-3 text-sm",
    "has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5",
  ],
  {
    variants: {
      variant: {
        default: "border-border bg-card text-card-foreground [&>svg]:text-muted-foreground",
        info: "border-blue/30 bg-blue/14 text-blue-foreground [&>svg]:text-blue",
        success: "border-emerald/30 bg-emerald/14 text-emerald-foreground [&>svg]:text-emerald",
        warning: "border-amber/30 bg-amber/14 text-amber-foreground [&>svg]:text-amber",
        destructive: "border-destructive/32 bg-destructive/14 text-destructive-text [&>svg]:text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type AlertProps = ComponentProps<"div"> & VariantProps<typeof alertVariants>;

/**
 * Role follows urgency (rules/accessibility.md "Live regions"): `destructive` is an `alert`,
 * the others a polite `status`. Pass `role` to override (e.g. `role={undefined}` for static help).
 */
export function Alert({ className, variant = "default", role, ...props }: AlertProps) {
  return (
    <div
      data-slot="alert"
      data-variant={variant}
      role={role ?? (variant === "destructive" ? "alert" : "status")}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn("col-start-2 font-medium tracking-tight", className)} {...props} />;
}

/** Body text inherits the variant's AA text colour (tints) or muted (default). */
export function AlertDescription({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-body [[data-variant=default]_&]:text-muted-foreground [&_p]:leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}
