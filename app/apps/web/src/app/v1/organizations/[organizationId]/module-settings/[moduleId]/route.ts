// Entry point only: the handlers live in @core/services (SP2 Task 9, decision 0015 §6).
import { route } from "@/server/core";

export const GET = route("modules.getModuleSettings");
export const PUT = route("modules.updateModuleSettings");
