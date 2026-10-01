import { CheckIcon, CircleDashedIcon, CircleXIcon, LoaderCircleIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "#/shared/lib/cn.ts";

/** AI Elements `queue`: an ordered list of steps with their status (workflow progress, SP5). */
export function Queue({ className, ...props }: ComponentProps<"ol">) {
  return <ol data-slot="queue" className={cn("flex list-none flex-col gap-1.5", className)} {...props} />;
}

export type QueueItemStatus = "pending" | "running" | "done" | "failed";

const MARKS: Readonly<Record<QueueItemStatus, ReactNode>> = {
  pending: <CircleDashedIcon aria-hidden="true" className="size-4 text-muted-foreground" />,
  running: <LoaderCircleIcon aria-hidden="true" className="size-4 animate-spin text-blue motion-reduce:animate-none" />,
  done: <CheckIcon aria-hidden="true" className="size-4 text-emerald" />,
  failed: <CircleXIcon aria-hidden="true" className="size-4 text-destructive" />,
};

export type QueueItemProps = ComponentProps<"li"> & {
  status: QueueItemStatus;
  /** The status in words, for assistive tech (the mark and colour are visual). */
  statusLabel: string;
};

export function QueueItem({ status, statusLabel, className, children, ...props }: QueueItemProps) {
  return (
    <li data-slot="queue-item" data-status={status} className={cn("flex items-start gap-2 text-[13px]", status === "done" ? "text-muted-foreground" : "text-foreground", className)} {...props}>
      <span className="mt-0.5">{MARKS[status]}</span>
      <span className="min-w-0 flex-1">
        {children}
        <span className="sr-only"> ({statusLabel})</span>
      </span>
    </li>
  );
}
