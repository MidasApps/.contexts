"use client";

import { FileIcon, FileTextIcon, ImageIcon, MusicIcon, VideoIcon, XIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "#/shared/lib/cn.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";

export type AttachmentsProps = Omit<ComponentProps<"ul">, "aria-label"> & { label: string };

/** AI Elements `attachments`: the files of a message or of the composer, as a labelled list. */
export function Attachments({ label, className, ...props }: AttachmentsProps) {
  return (
    <ul
      data-slot="attachments"
      aria-label={label}
      className={cn("flex list-none flex-wrap gap-2", className)}
      {...props}
    />
  );
}

const iconOf = (mediaType: string): ReactNode => {
  if (mediaType.startsWith("image/")) return <ImageIcon aria-hidden="true" className="size-4" />;
  if (mediaType.startsWith("video/")) return <VideoIcon aria-hidden="true" className="size-4" />;
  if (mediaType.startsWith("audio/")) return <MusicIcon aria-hidden="true" className="size-4" />;
  if (mediaType === "application/pdf" || mediaType.startsWith("text/"))
    return <FileTextIcon aria-hidden="true" className="size-4" />;
  return <FileIcon aria-hidden="true" className="size-4" />;
};

export type AttachmentProps = Omit<ComponentProps<"li">, "children"> & {
  name: string;
  mediaType: string;
  /** Size, state or progress in words ("48 KB", "Enviando 40%"). */
  detail?: ReactNode;
  /** A preview to show instead of the type icon (an `img` of our own read URL). */
  preview?: ReactNode;
  /** Trailing control, usually `AttachmentRemove`. */
  action?: ReactNode;
  tone?: "default" | "error";
};

export function Attachment({
  name,
  mediaType,
  detail,
  preview,
  action,
  tone = "default",
  className,
  ...props
}: AttachmentProps) {
  return (
    <li
      data-slot="attachment"
      data-tone={tone}
      className={cn(
        "flex max-w-full items-center gap-2 rounded-sm border bg-card py-1.5 pr-1.5 pl-2 text-body-sm",
        tone === "error" ? "border-destructive/40" : "border-border",
        className,
      )}
      {...props}
    >
      <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-xs bg-muted text-muted-foreground">
        {preview ?? iconOf(mediaType)}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">{name}</span>
        {detail === undefined ? null : (
          <span className={cn("block truncate", tone === "error" ? "text-destructive-text" : "text-muted-foreground")}>
            {detail}
          </span>
        )}
      </span>
      {action}
    </li>
  );
}

export type AttachmentRemoveProps = Omit<ComponentProps<typeof Button>, "children" | "aria-label"> & { label: string };

/** Removes one attachment; the label names the file ("Remover diagram.png"). */
export function AttachmentRemove({ label, ...props }: AttachmentRemoveProps) {
  return (
    <Button data-slot="attachment-remove" variant="ghost" size="icon-xs" aria-label={label} {...props}>
      <XIcon aria-hidden="true" />
    </Button>
  );
}
