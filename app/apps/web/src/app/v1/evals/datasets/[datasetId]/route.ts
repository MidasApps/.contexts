// Entry point only: the handlers live in @core/services (decisions 0062 and 0075).
import { route } from "@/server/core";

export const PATCH = route("evals.renameDataset");
export const DELETE = route("evals.deleteDataset");
