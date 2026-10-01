import type { ComponentProps } from "react";
import { cn } from "#/shared/lib/cn.ts";
import { Avatar } from "#/shared/ui/atoms/Avatar/Avatar.tsx";

export type OrganizationAvatarProps = Omit<ComponentProps<typeof Avatar>, "name" | "tone" | "presence"> & {
  /** Organization name: the initials and the stable tone come from it. */
  name: string;
};

/**
 * The organization mark in switchers and lists (sidebar-07 team switcher): initials with the
 * hashed tone, square-ish corners so it reads as a workspace rather than a person.
 */
export function OrganizationAvatar({ name, className, size = "sm", ...props }: OrganizationAvatarProps) {
  return <Avatar name={name} size={size} className={cn("rounded-xs [&_[data-slot=avatar-fallback]]:rounded-xs", className)} {...props} />;
}
