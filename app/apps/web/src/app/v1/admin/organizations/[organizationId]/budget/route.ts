// Entry point only: the handlers live in @core/services (SP5, decisions 0039 and 0041).
import { route } from "@/server/core";

export const PUT = route("admin.setOrganizationBudget");
