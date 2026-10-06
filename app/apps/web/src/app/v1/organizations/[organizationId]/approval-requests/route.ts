// Entry point only: the handlers live in @core/services (SP1 Task 17).
import { route } from "@/server/core";

export const GET = route("access.listApprovalRequests");
export const POST = route("access.createApprovalRequest");
