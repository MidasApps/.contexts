// Entry point only: the handlers live in @core/services (decision 0072).
import { route } from "@/server/core";

export const GET = route("admin.getModelSettings");
export const PUT = route("admin.updateModelSettings");
