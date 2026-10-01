// Entry point only: the handlers live in @core/services (SP5, decision 0040).
import { route } from "@/server/core";

export const GET = route("traces.list");
