// Entry point only: the handlers live in @core/services (SP5, decision 0038).
import { route } from "@/server/core";

export const GET = route("prompts.adminListVersions");
export const POST = route("prompts.adminCreateVersion");
