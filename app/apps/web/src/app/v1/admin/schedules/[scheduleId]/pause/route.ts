// Entry point only: the handlers live in @core/services (SP5, decision 0043).
import { route } from "@/server/core";

export const POST = route("admin.pauseSchedule");
