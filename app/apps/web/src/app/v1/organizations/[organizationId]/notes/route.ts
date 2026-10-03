// Entry point only: the example module serves the handler (`createExampleRoutes`, decision 0063).
import { route } from "@/server/core";

export const GET = route("example.listNotes");
