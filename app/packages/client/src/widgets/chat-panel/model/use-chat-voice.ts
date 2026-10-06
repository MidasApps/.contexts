"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { type VoicePreferences, voiceAvailabilityQuery } from "#/features/chat-voice/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";

/** Permission of every voice call (decision 0034). */
export const VOICE_PERMISSION = "core.voice.use";

/**
 * Voice of a chat thread, or `undefined` while it must stay hidden: the member lacks
 * `core.voice.use`, the organization's `chat.voice` flag is off, or the answer is not in yet.
 * The availability is asked only for members who could use voice, so nobody else even makes the
 * request. Auto-send and read-aloud start off and last as long as the thread.
 */
export const useChatVoice = (args: {
  organizationId: string;
  can: ((permission: string) => boolean) | undefined;
}): VoicePreferences | undefined => {
  const callEndpoint = useCallEndpoint();
  const allowed = args.can?.(VOICE_PERMISSION) === true;
  const availability = useQuery({ ...voiceAvailabilityQuery(callEndpoint, args.organizationId), enabled: allowed });
  const [autoSend, setAutoSend] = useState(false);
  const [autoRead, setAutoRead] = useState(false);
  if (!allowed || availability.data?.voice !== true) return undefined;
  return { autoSend, setAutoSend, autoRead, setAutoRead, realtime: availability.data.realtime };
};
