/**
 * Class lists shared by the floating surfaces (Select, DropdownMenu, Popover, Command, Tooltip) so
 * they stay identical: `--popover` surface over a hairline border, elevation 2 (elevacao.html),
 * 240 ms entry with the surface easing (motion.html). Reduced motion removes the animation
 * (globals.css).
 */
export const floatingSurfaceClasses = [
  "z-50 rounded-md border border-border bg-popover text-popover-foreground shadow-popover",
  "duration-240 ease-(--ease-surface)",
  "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
  "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
  "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
].join(" ");

/**
 * Items inside menus and listboxes: the highlighted item gets `--accent` plus an inset focus
 * outline when reached by keyboard (the fill alone is below 3:1 against the popover).
 */
export const menuItemClasses = [
  "relative flex cursor-default items-center gap-2 rounded-xs px-2 py-1.5 text-sm select-none",
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
  "focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  "[&_svg:not([class*='text-'])]:text-muted-foreground",
].join(" ");
