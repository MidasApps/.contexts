// Entry point only: the handlers live in @core/services (SP3 Task 21). Write-only: no GET.
import { route } from "@/server/core";

export const PUT = route("connectors.setSecret");
