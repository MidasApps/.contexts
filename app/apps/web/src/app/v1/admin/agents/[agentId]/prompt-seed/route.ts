// Entry point only: the handler lives in @core/services (follow-up 86).
import { route } from "@/server/core";

export const GET = route("prompts.adminGetSeed");
