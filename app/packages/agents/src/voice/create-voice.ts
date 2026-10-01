import type { SpeechModelV4, TranscriptionModelV4 } from "@ai-sdk/provider";
import { CompositeVoice, type MastraVoice } from "@mastra/core/voice";
import type { AgentModels } from "../models/model-factory.ts";
import { AiSdkSpeechVoice, AiSdkTranscriptionVoice, type SynthesizedAudio, synthesizeSpeech, type Transcript, transcribeAudio } from "./ai-sdk-voice.ts";

/** Voice models of the factory (`null` = the provider key is missing). */
export type VoiceModels = Pick<AgentModels, "transcription" | "speech">;

export type VoiceCapabilities = { readonly transcription: boolean; readonly speech: boolean; readonly realtime: boolean };

/** Provider and model of a voice role, for the usage ledger (SP3 follow-up #29). */
export type VoiceModelRef = { readonly provider: string; readonly modelId: string };

/**
 * Voice of the runtime (spec §5.1, §14; SP4 attaches `voice` to chat agents and
 * exposes the routes). `transcribe`/`synthesize` return what the HTTP routes need
 * (duration, media type), which `CompositeVoice.listen/speak` drop.
 */
export type CoreVoice = {
  readonly voice: CompositeVoice;
  readonly capabilities: VoiceCapabilities;
  readonly models: { readonly transcription: VoiceModelRef | null; readonly speech: VoiceModelRef | null };
  readonly transcribe: (input: { readonly audio: Uint8Array; readonly mediaType: string; readonly abortSignal?: AbortSignal }) => Promise<Transcript>;
  readonly synthesize: (input: { readonly text: string; readonly voice?: string; readonly abortSignal?: AbortSignal }) => Promise<SynthesizedAudio>;
};

/** A voice capability without a configured model; the routes answer 503. */
export class VoiceUnavailableError extends Error {
  readonly code = "FEATURE_UNAVAILABLE";
  readonly capability: keyof VoiceCapabilities;

  constructor(capability: keyof VoiceCapabilities) {
    super(`voice ${capability} is not configured`);
    this.name = "VoiceUnavailableError";
    this.capability = capability;
  }
}

// AI SDK model ids are `<provider>.<api>` (e.g. `openai.transcription`); the ledger keeps the vendor.
const refOf = (model: { readonly provider: string; readonly modelId: string } | null): VoiceModelRef | null =>
  model === null ? null : { provider: model.provider.split(".")[0] ?? model.provider, modelId: model.modelId };

const requireModel = <TModel>(model: TModel | null, capability: keyof VoiceCapabilities): TModel => {
  if (model === null) throw new VoiceUnavailableError(capability);
  return model;
};

/**
 * `CompositeVoice` over the transcription and speech roles of the model factory
 * (fake voice models in `AI_MODE=fake`). Realtime is optional: SP3 pins no realtime
 * provider, so it is on only when a `MastraVoice` realtime provider is injected.
 * @returns `null` when neither model is configured: the voice feature is off.
 */
export const createVoice = (args: { readonly models: VoiceModels; readonly realtime?: MastraVoice }): CoreVoice | null => {
  const transcription: TranscriptionModelV4 | null = args.models.transcription();
  const speech: SpeechModelV4 | null = args.models.speech();
  if (transcription === null && speech === null && args.realtime === undefined) return null;
  const voice = new CompositeVoice({
    ...(transcription === null ? {} : { input: new AiSdkTranscriptionVoice(transcription) }),
    ...(speech === null ? {} : { output: new AiSdkSpeechVoice(speech) }),
    ...(args.realtime === undefined ? {} : { realtime: args.realtime }),
  });
  return {
    voice,
    capabilities: { transcription: transcription !== null, speech: speech !== null, realtime: args.realtime !== undefined },
    models: { transcription: refOf(transcription), speech: refOf(speech) },
    transcribe: async (input) => {
      const model = requireModel(transcription, "transcription");
      return transcribeAudio(model, { audio: input.audio, ...(input.abortSignal === undefined ? {} : { abortSignal: input.abortSignal }) });
    },
    synthesize: async (input) => synthesizeSpeech(requireModel(speech, "speech"), input),
  };
};
