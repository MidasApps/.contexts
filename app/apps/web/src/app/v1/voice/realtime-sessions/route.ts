// Entry point only: the handlers live in @core/services (SP4 Task 7, decision 0034).
import { route } from "@/server/core";

export const POST = route("voice.createRealtimeSession");
