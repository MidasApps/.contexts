"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Avatar as AvatarPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { type AvatarTone, avatarToneFor, initialsOf } from "./avatar-identity.ts";

const avatarVariants = cva("group/avatar relative flex shrink-0 rounded-full select-none", {
  variants: {
    size: {
      xs: "size-5 text-micro",
      sm: "size-7 text-label",
      md: "size-9 text-body",
      lg: "size-12 text-base",
      xl: "size-16 text-xl",
    },
  },
  defaultVariants: { size: "md" },
});

// avatar.html pairs, as tints: white initials on the saturated gradients miss AA (≈ 2.4–3.3:1),
// so the fallback uses the 14% tint + the AA-safe text token (decision 0014 amendment).
const TONE_CLASSES: Record<AvatarTone, string> = {
  violet: "bg-violet/14 text-violet-foreground",
  emerald: "bg-emerald/14 text-emerald-foreground",
  amber: "bg-amber/14 text-amber-foreground",
  blue: "bg-blue/14 text-blue-foreground",
  neutral: "bg-muted text-muted-foreground-strong",
};

export type AvatarPresence = "online" | "away" | "busy" | "offline";

const PRESENCE_CLASSES: Record<AvatarPresence, string> = {
  online: "bg-emerald",
  away: "bg-amber",
  busy: "bg-destructive",
  offline: "bg-muted-foreground",
};

export type AvatarProps = Omit<ComponentProps<typeof AvatarPrimitive.Root>, "children"> &
  VariantProps<typeof avatarVariants> & {
    /** Person or entity name: initials and the stable tint come from it. */
    name: string;
    src?: string | undefined;
    /** `system` renders the neutral tone (removed users, bots). */
    tone?: AvatarTone | "auto";
    /** Presence dot (md and larger only, avatar.html) with a visually hidden label. */
    presence?: AvatarPresence | undefined;
    /** Hide from assistive tech when the name is already shown next to the avatar (user chip). */
    decorative?: boolean;
  };

/**
 * shadcn `avatar` (Radix: image with fallback) extended with avatar.html: five sizes, two-letter
 * initials, a tone chosen by a hash of the name (same person, same tone) and a presence dot that
 * is announced as text, never colour alone. The image is decorative when a name is shown next to
 * it; `alt` is the name otherwise.
 */
export function Avatar({
  className,
  size = "md",
  name,
  src,
  tone = "auto",
  presence,
  decorative = false,
  ...props
}: AvatarProps) {
  const t = useTranslations("common.presence");
  const resolvedTone = tone === "auto" ? avatarToneFor(name) : tone;
  const showPresence = presence !== undefined && size !== "xs" && size !== "sm";
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      aria-hidden={decorative || undefined}
      className={cn(avatarVariants({ size }), className)}
      {...props}
    >
      {src === undefined ? null : (
        <AvatarPrimitive.Image
          data-slot="avatar-image"
          src={src}
          alt={decorative ? "" : name}
          className="aspect-square size-full rounded-full object-cover"
        />
      )}
      <AvatarPrimitive.Fallback
        data-slot="avatar-fallback"
        className={cn(
          "flex size-full items-center justify-center rounded-full font-semibold",
          TONE_CLASSES[resolvedTone],
        )}
      >
        <span aria-hidden="true">{initialsOf(name)}</span>
        {decorative ? null : <span className="sr-only">{name}</span>}
      </AvatarPrimitive.Fallback>
      {showPresence ? (
        <span
          data-slot="avatar-presence"
          className={cn("absolute end-0 bottom-0 size-2.5 rounded-full ring-2 ring-card", PRESENCE_CLASSES[presence])}
        >
          <span className="sr-only">{t(presence)}</span>
        </span>
      ) : null}
    </AvatarPrimitive.Root>
  );
}
