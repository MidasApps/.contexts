// Entry point only: the handlers live in @core/services (SP5, decisions 0041 and 0044).
import { route } from "@/server/core";

export const POST = route("admin.endImpersonationSession");
