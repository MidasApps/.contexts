"use client";

import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { useTranslations } from "use-intl";
import { SpeechInput } from "#/shared/ui/ai/speech-input.tsx";
import type { PushToTalkPhase } from "../model/push-to-talk.ts";

export type PushToTalkButtonProps = {
  phase: PushToTalkPhase;
  onStart: () => void;
  onStop: () => void;
  /** Throws the recording away (Esc while recording). */
  onCancel: () => void;
  disabled?: boolean | undefined;
};

/** `Ctrl+Space` (spec §5.3): starts and stops a recording from anywhere in the page. */
const isShortcut = (event: globalThis.KeyboardEvent): boolean => event.ctrlKey && !event.altKey && !event.metaKey && (event.code === "Space" || event.key === " ");

/**
 * The push-to-talk control (spec §5.3). With a pointer it records while held. With the keyboard
 * (Enter or Space on the button, or `Ctrl+Space` anywhere) one press starts and the next stops —
 * holding a key is not something every member can do (WCAG 2.5.1 asks for a simple alternative).
 * Esc discards the recording. The button says what a press does and is `aria-pressed` while it
 * records; its state is also said in words next to it by the composer.
 */
export function PushToTalkButton({ phase, onStart, onStop, onCancel, disabled = false }: PushToTalkButtonProps) {
  const t = useTranslations("chat.voice");
  const recording = phase === "recording" || phase === "requesting";
  const busy = phase === "transcribing";
  const held = useRef(false);

  const toggle = (): void => {
    if (busy) return;
    if (recording) onStop();
    else onStart();
  };

  useEffect(() => {
    if (disabled) return undefined;
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (!isShortcut(event) || event.repeat) return;
      event.preventDefault();
      if (busy) return;
      if (recording) onStop();
      else onStart();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [disabled, busy, recording, onStart, onStop]);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0 || busy || recording) return;
    held.current = true;
    onStart();
  };

  const release = (): void => {
    if (!held.current) return;
    held.current = false;
    onStop();
  };

  // A pointer press already started (and its release will stop) the recording: only clicks that
  // did not come from a held pointer — the keyboard, assistive technology — toggle.
  const onClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (event.detail === 0) toggle();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== "Escape" || !recording) return;
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  };

  return (
    <SpeechInput
      type="button"
      recording={recording}
      label={recording ? t("stopRecording") : t("talk")}
      aria-keyshortcuts="Control+Space"
      disabled={disabled || busy}
      onPointerDown={onPointerDown}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onClick={onClick}
      onKeyDown={onKeyDown}
    />
  );
}
