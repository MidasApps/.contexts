import { ProjectHomeView } from "@core/client/views/project-home";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/o/$organizationId/p/$projectId/")({ component: ProjectHomeView });
