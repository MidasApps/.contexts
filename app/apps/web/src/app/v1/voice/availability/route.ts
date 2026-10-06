// Entry point only: the handler lives in @core/services (SP4 Task 12, decision 0034).
import { route } from "@/server/core";

export const GET = route("voice.getAvailability");
