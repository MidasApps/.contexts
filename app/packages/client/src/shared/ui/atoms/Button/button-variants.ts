import { cva, type VariantProps } from "class-variance-authority";

/**
 * Button look from `.design-system/componentes.html`: neutral primary (highest contrast in the theme),
 * secondary with a hairline border, ghost for toolbars, destructive for irreversible actions.
 * Radius 10 px (`rounded-sm`), 13.5 px medium text, 150 ms transitions. Focus uses the global
 * `:focus-visible` outline (2 px `--ring`, offset 2 px) so the indicator keeps ≥ 3:1 contrast.
 */
export const buttonVariants = cva(
  [
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-sm border border-transparent",
    "text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,opacity] duration-(--duration-fast) ease-in-out",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "aria-invalid:border-destructive",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "border-border bg-secondary text-secondary-foreground hover:bg-muted",
        outline: "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
        ghost: "text-foreground hover:bg-muted",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "h-auto px-0 text-foreground underline underline-offset-4 hover:text-muted-foreground",
      },
      size: {
        default: "h-9 px-3.5 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 px-5 has-[>svg]:px-4",
        // 24 px is the WCAG 2.2 AA minimum target (2.5.8); icon buttons never go below it.
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-xs": "size-6 rounded-xs [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;
