// Entry point only: the handlers live in @core/services (SP5, decision 0037).
import { route } from "@/server/core";

export const GET = route("schedules.get");
export const PATCH = route("schedules.update");
export const DELETE = route("schedules.delete");
