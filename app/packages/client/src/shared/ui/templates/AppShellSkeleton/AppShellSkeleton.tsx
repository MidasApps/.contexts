import { Skeleton } from "#/shared/ui/atoms/Skeleton/Skeleton.tsx";
import { SIDEBAR_WIDTH, SIDEBAR_WIDTH_ICON } from "#/shared/ui/organisms/Sidebar/sidebar-context.tsx";

export type AppShellSkeletonProps = {
  /** What is loading, said once by the polite status (an i18n string from the host). */
  label: string;
  /** The user's last sidebar state (cookie on web, local storage on desktop); expanded by default. */
  sidebarOpen?: boolean;
};

const NAV_ROWS = 6;

/**
 * Placeholder of the user area while the session is checked: the `AppShellTemplate` geometry
 * (sidebar 260/60 px from `md`, sticky 56 px topbar, content capped at 1280 px with the same
 * gutters, a page header) without data, so nothing jumps when the real shell arrives. Static: no
 * provider, hook or translation, so it can be a server-streamed Suspense fallback.
 */
export function AppShellSkeleton({ label, sidebarOpen = true }: AppShellSkeletonProps) {
  return (
    <div data-slot="app-shell-skeleton" className="flex min-h-svh w-full">
      <div
        aria-hidden="true"
        data-slot="app-shell-skeleton-sidebar"
        style={{ width: sidebarOpen ? SIDEBAR_WIDTH : SIDEBAR_WIDTH_ICON }}
        className="sticky top-0 hidden h-svh shrink-0 flex-col gap-3 border-r border-sidebar-border bg-sidebar p-3 md:flex"
      >
        <Skeleton className="h-8 w-full rounded-sm" />
        {Array.from({ length: NAV_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-7 w-full rounded-sm" />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <div aria-hidden="true" data-slot="app-topbar-skeleton" className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <Skeleton className="size-7 rounded-sm" />
          <Skeleton className="h-4 w-40" />
        </div>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          <div role="status" aria-busy="true" className="mx-auto w-full max-w-[1280px] px-6 py-6 lg:px-10 lg:py-8">
            <span className="sr-only">{label}</span>
            <div aria-hidden="true" data-slot="page-header-skeleton" className="mb-6 flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-64 max-w-full" />
              <Skeleton className="h-4 w-96 max-w-full" />
            </div>
            <div aria-hidden="true" className="flex flex-col gap-3">
              <Skeleton className="h-24 w-full rounded-md" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
