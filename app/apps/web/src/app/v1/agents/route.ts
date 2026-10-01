// Entry point only: the handler lives in @core/services (SP5 Task 14).
import { route } from "@/server/core";

export const GET = route("agents.listCatalog");
