// Entry point only: the handler lives in @core/services (SP3 Task 24, core MCP server).
import { route } from "@/server/core";

export const POST = route("agents.callMcp");
