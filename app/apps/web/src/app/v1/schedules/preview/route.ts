// Entry point only: the handlers live in @core/services (SP5, decisions 0037 and 0061).
import { route } from "@/server/core";

export const POST = route("schedules.preview");
