// Entry point only: the handlers live in @core/services (SP5, decision 0040; creation: decision 0062).
import { route } from "@/server/core";

export const GET = route("evals.listDatasets");
export const POST = route("evals.createDataset");
