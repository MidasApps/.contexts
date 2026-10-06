// Entry point only: the handlers live in @core/services (SP4 Task 6, decision 0033).
import { route } from "@/server/core";

export const GET = route("conversations.get");
export const PATCH = route("conversations.update");
export const DELETE = route("conversations.delete");
