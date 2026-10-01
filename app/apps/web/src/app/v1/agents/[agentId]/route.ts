// Entry point only: the handlers live in @core/services (decision 0046).
import { route } from "@/server/core";

export const GET = route("custom-agents.get");
export const PATCH = route("custom-agents.update");
export const DELETE = route("custom-agents.delete");
