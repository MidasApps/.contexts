import type { ComponentProps } from "react";
import { StatePanel } from "#/shared/ui/molecules/StatePanel/StatePanel.tsx";

export type EmptyStateProps = Omit<ComponentProps<typeof StatePanel>, "icon" | "tone"> & {
  icon?: ComponentProps<typeof StatePanel>["icon"];
};

/**
 * Nothing to show yet, or no search results (empty.html). Callers pass translated copy specific
 * to the collection ("No projects yet" + "Create project"); a search miss offers "Clear search".
 */
export function EmptyState({ icon = "inbox", ...props }: EmptyStateProps) {
  return <StatePanel data-state="empty" icon={icon} tone="neutral" {...props} />;
}
