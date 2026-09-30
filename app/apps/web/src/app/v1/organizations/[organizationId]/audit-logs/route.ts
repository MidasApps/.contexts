// Entry point only: the handlers live in @core/services (SP1 Task 18).
import { route } from "@/server/core";

export const GET = route("audit.listAuditLogs");
