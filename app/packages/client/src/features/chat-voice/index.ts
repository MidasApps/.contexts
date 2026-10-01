// Public API of the chat-voice feature (SP4 Task 12, decision 0034): push-to-talk, read aloud
// and the optional realtime conversation. Nothing here renders unless the widget mounts it, and
// the widget mounts it only when the organization's voice flag is on.
export { voiceAvailabilityQuery } from "./api/voice-api.ts";
export { MAX_RECORDING_BYTES, MAX_RECORDING_MS, type PushToTalkPhase, type PushToTalkProblem, type RecorderLike, type StreamLike } from "./model/push-to-talk.ts";
export { usePushToTalk, type VoiceSeams } from "./model/use-push-to-talk.ts";
export { connectRealtimeOverWebRtc, useRealtimeVoice, type RealtimeConnection, type RealtimeConnector, type RealtimeVoiceStatus } from "./model/use-realtime-voice.ts";
export { useSpeechPlayback, type SpeechPlayback, type SpeechPlaybackSeams } from "./model/use-speech-playback.ts";
export { ComposerVoice, type ComposerVoiceProps, type VoicePreferences } from "./ui/composer-voice.tsx";
export { PushToTalkButton, type PushToTalkButtonProps } from "./ui/push-to-talk-button.tsx";
export { ReadAloudAction, type ReadAloudActionProps } from "./ui/read-aloud-action.tsx";
