/** Scrim behind modal surfaces (Dialog, AlertDialog, Sheet); fades with the surface. */
export const overlayClasses = [
  "fixed inset-0 z-50 bg-black/60",
  "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
].join(" ");

/**
 * Centered modal surface: `--card` over a hairline border, 19.6 px radius, elevation 3
 * (elevacao.html), 240 ms entry. Width caps at 32 rem and never exceeds the viewport minus 2 rem;
 * height never exceeds the small viewport minus 2 rem and the surface scrolls, so a tall dialog
 * (MFA enrollment, long forms) keeps its title and actions reachable on a phone or short window.
 */
export const centeredModalClasses = [
  "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4",
  "max-h-[calc(100svh-2rem)] overflow-y-auto overscroll-contain",
  "rounded-xl border border-border bg-card p-6 text-card-foreground shadow-modal outline-none sm:max-w-lg",
  "duration-240 ease-(--ease-surface)",
  "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
].join(" ");
