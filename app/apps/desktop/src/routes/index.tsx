import { HomeView } from "@core/client/views/home";
import { createFileRoute } from "@tanstack/react-router";

// `/`: redirects to the last context or the organizations list (SP2 spec §4).
export const Route = createFileRoute("/")({ component: HomeView });
