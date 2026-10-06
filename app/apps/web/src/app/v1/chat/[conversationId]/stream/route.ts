// Entry point only: the handler lives in @core/services (SP4 Task 5, decision 0031).
import { route } from "@/server/core";

export const GET = route("chat.resumeStream");
