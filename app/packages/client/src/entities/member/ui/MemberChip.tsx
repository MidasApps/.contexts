import { cn } from "#/shared/lib/cn.ts";
import { Avatar } from "#/shared/ui/atoms/Avatar/Avatar.tsx";

export type MemberChipProps = {
  /** Display name; may be empty (the email is shown as the name then). */
  displayName: string;
  email: string;
  className?: string;
};

/** avatar.html user chip: avatar, name and email in two lines (member tables, pickers). */
export function MemberChip({ displayName, email, className }: MemberChipProps) {
  const name = displayName.trim() === "" ? email : displayName;
  return (
    <span data-slot="member-chip" className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <Avatar name={name} size="sm" decorative />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-body font-medium">{name}</span>
        {name === email ? null : <span className="truncate text-caption text-muted-foreground">{email}</span>}
      </span>
    </span>
  );
}
