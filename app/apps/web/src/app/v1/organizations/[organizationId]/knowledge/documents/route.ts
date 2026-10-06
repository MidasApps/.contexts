// Entry point only: the handlers live in @core/services (SP3 Task 14).
import { route } from "@/server/core";

export const GET = route("knowledge.listDocuments");
