import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "#/shared/lib/cn.ts";
import { Spinner } from "#/shared/ui/atoms/Spinner/Spinner.tsx";
import { type ButtonVariantProps, buttonVariants } from "./button-variants.ts";

export type ButtonProps = ComponentProps<"button"> &
  ButtonVariantProps & {
    /** Renders the child element (a link, a router `Link`) with the button look (Radix `Slot`). */
    asChild?: boolean;
    /**
     * Pending action: shows a spinner, sets `aria-busy` and blocks clicks while keeping the label
     * readable (the spinner is decorative; the label says what is happening).
     */
    pending?: boolean;
  };

/** shadcn `button` (new-york, Radix `Slot`) restyled with the design-system tokens. */
export function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  pending = false,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild) {
    return (
      <Slot.Root data-slot="button" data-variant={variant} data-size={size} className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      // Buttons inside forms submit by default; an explicit type avoids accidental submits.
      type={type ?? "button"}
      className={classes}
      disabled={disabled === true || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {pending ? <Spinner decorative /> : null}
      {children}
    </button>
  );
}
