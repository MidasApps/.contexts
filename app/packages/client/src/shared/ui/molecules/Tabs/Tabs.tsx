"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "#/shared/lib/cn.ts";

/**
 * shadcn `tabs` (Radix tablist: arrows move between tabs, Home/End, the panel is labelled by its
 * tab). `segmented` is the design-system segmented control (formularios.html `.seg`: 2–4 mutually
 * exclusive views on a `--muted` track, active on `--card`); `line` is for page-level tabs.
 */
export function Tabs({ className, orientation = "horizontal", ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn("group/tabs flex gap-3 data-[orientation=horizontal]:flex-col", className)}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  {
    variants: {
      variant: {
        segmented: "gap-0.5 rounded-sm bg-muted p-[3px] text-muted-foreground-strong",
        line: "gap-1 border-b border-border text-muted-foreground",
      },
    },
    defaultVariants: { variant: "segmented" },
  },
);

export function TabsList({
  className,
  variant = "segmented",
  ...props
}: ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex min-h-7 cursor-pointer items-center justify-center gap-1.5 px-3 py-1 text-[12.5px] font-medium whitespace-nowrap transition-colors",
        "hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground",
        "group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start",
        "group-data-[variant=segmented]/tabs-list:rounded-xs group-data-[variant=segmented]/tabs-list:data-[state=active]:bg-card",
        "group-data-[variant=segmented]/tabs-list:data-[state=active]:shadow-hover",
        "group-data-[variant=line]/tabs-list:-mb-px group-data-[variant=line]/tabs-list:border-b-2 group-data-[variant=line]/tabs-list:border-transparent",
        "group-data-[variant=line]/tabs-list:data-[state=active]:border-foreground",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("flex-1", className)} {...props} />;
}
